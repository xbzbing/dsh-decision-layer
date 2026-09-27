import { readFile } from 'node:fs/promises';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { resolveConfig, featureEnabled } from './config-store.mjs';
import { createBackend } from './backend.mjs';
import { createManagerRoutes } from './manager-api.mjs';
import { createSessionState } from './session-state.mjs';
import { createDangerGate, normalizeDangerRules } from './danger-gate.mjs';
import { createSelfCheck } from './self-check.mjs';
import { createNarrowing } from './narrowing.mjs';
import { createTaskCompletion } from './task-completion.mjs';
import { createLoopGuard } from './loop-guard.mjs';
import { createLogStore } from './log-store.mjs';
import { analyzeSessionLogs } from './log-analyze.mjs';

export const name = 'dsh-decision-layer';
export const inject = ['tools', 'skills'];

// Best-effort extraction of the turn's final assistant text. The self-check
// treats empty output as "skip", so an unreachable shape degrades safely.
function lastAssistantText(agent) {
  try {
    const messages = agent?.session?.deriveMessages?.();
    if (!Array.isArray(messages)) return '';
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message?.role !== 'assistant' || !Array.isArray(message.content)) continue;
      return message.content.filter(block => block?.type === 'text' && typeof block.text === 'string').map(block => block.text).join('');
    }
    return '';
  } catch { return ''; }
}

// The task text a narrowing pass judges tools against: the user messages
// entering this step. An unreachable shape yields '', which skips narrowing.
function stepTaskText(messages) {
  try {
    if (!Array.isArray(messages)) return '';
    return messages
      .filter(message => message?.role === 'user' && Array.isArray(message.content))
      .flatMap(message => message.content.filter(block => block?.type === 'text' && typeof block.text === 'string').map(block => block.text))
      .join('\n').slice(0, 8 * 1024);
  } catch { return ''; }
}

// The user's request text for this turn, used by task-completion to extract the
// explicit conditions. Best-effort: an unreachable shape yields '', which skips
// the check. Takes the trailing run of user messages (the prompt entering the turn).
function turnUserText(agent) {
  try {
    const messages = agent?.session?.deriveMessages?.();
    if (!Array.isArray(messages)) return '';
    const texts = [];
    let collecting = false;
    // Walk backwards: skip the turn's trailing assistant/tool messages, collect the
    // contiguous user run that started this turn, then stop at the prior assistant.
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message?.role === 'user' && Array.isArray(message.content)) {
        collecting = true;
        texts.unshift(message.content.filter(block => block?.type === 'text' && typeof block.text === 'string').map(block => block.text).join('\n'));
      } else if (collecting) break;
    }
    return texts.join('\n').slice(0, 8 * 1024);
  } catch { return ''; }
}

// Tool evidence for the turn's task-completion check: the tool calls and their
// ok/error outcome from the derived history. Names only (no arguments), bounded.
// An unreachable shape yields [], which skips the check.
function turnToolEvidence(agent) {
  try {
    const messages = agent?.session?.deriveMessages?.();
    if (!Array.isArray(messages)) return [];
    const evidence = [];
    for (const message of messages) {
      if (message?.role !== 'tool' || !Array.isArray(message.content)) continue;
      const tool = typeof message.name === 'string' ? message.name : (typeof message.toolName === 'string' ? message.toolName : '');
      if (!tool) continue;
      evidence.push({ tool: tool.slice(0, 128), outcome: message.isError === true ? 'error' : 'ok' });
      if (evidence.length >= 40) break;
    }
    return evidence;
  } catch { return []; }
}

// Enumerate the tool names/descriptions visible to this agent scope, best-effort.
function agentTools(ctx, agent) {
  try {
    const schemas = typeof ctx.tools?.schemas === 'function' ? ctx.tools.schemas(agent) : undefined;
    if (!Array.isArray(schemas)) return [];
    return schemas
      .filter(schema => schema && typeof schema.name === 'string')
      .map(schema => ({ name: schema.name, description: typeof schema.description === 'string' ? schema.description : '' }));
  } catch { return []; }
}

export async function apply(ctx, options = {}) {
  const path = options.configPath;
  const backend = createBackend({ config: () => resolveConfig({ path }) });
  // The research log sink is attached once the web server reveals the instance
  // port (used in the file name); until then decision logs stay in memory only.
  let logStore;
  const sessions = createSessionState({ onLog: entry => logStore?.append(entry) });
  const gate = createDangerGate({
    evaluate: (input, request) => backend.evaluate(input, request),
    sessions,
    rules: async () => normalizeDangerRules((await resolveConfig({ path })).dangerRules),
  });
  const loopGuard = createLoopGuard({ sessions });
  // Live per-feature enablement; every decision point defaults to enabled.
  const featureOn = async key => featureEnabled((await resolveConfig({ path })).features, key);
  if (typeof ctx.on === 'function') {
    if (typeof ctx.tools.guard === 'function') {
      // Deterministic loop guard runs with no backend; then the dangerous-gate
      // monotonic denial. Guards can only deny, never re-allow.
      ctx.tools.guard(exec => loopGuard.check(exec));
      ctx.tools.guard(exec => gate.guardReason(exec));
    }
    const install = () => {
      const disposePre = ctx.on('tools/pre-execute', async (exec, next) => {
        if (!(await featureOn('gate'))) return next();
        return gate.preExecute(exec, next);
      });
      const disposePost = ctx.on('tools/post-execute', async (exec, result, next) => {
        gate.observeResult(exec, result);
        return next();
      });
      return () => { disposePre?.(); disposePost?.(); };
    };
    if (typeof ctx.effect === 'function') ctx.effect(install);
    else install();

    const selfCheck = createSelfCheck({
      evaluate: (input, request) => backend.evaluate(input, request),
      sessions,
      settings: async () => (await resolveConfig({ path })).checkSettings,
      steer: (agent, text) => agent.steer(createUserMessage({
        content: [{ type: 'text', text }],
        source: { kind: 'user' },
      })),
    });
    const installCheck = () => ctx.on('agent/turn-stopping', async payload => {
      if (!(await featureOn('check'))) return;
      return selfCheck.review({
        agent: payload.agent, turn: payload.turn, signal: payload.signal,
        output: lastAssistantText(payload.agent),
      });
    });
    if (typeof ctx.effect === 'function') ctx.effect(installCheck);
    else installCheck();

    const taskCompletion = createTaskCompletion({
      evaluate: (input, request) => backend.evaluate(input, request),
      sessions,
      settings: async () => (await resolveConfig({ path })).completeSettings,
      steer: (agent, text) => agent.steer(createUserMessage({
        content: [{ type: 'text', text }],
        source: { kind: 'user' },
      })),
    });
    // Independent turn-stopping listener, separate from the self-check: it checks
    // whether the user's explicit conditions have supporting tool evidence.
    const installCompletion = () => ctx.on('agent/turn-stopping', async payload => {
      if (!(await featureOn('complete'))) return;
      return taskCompletion.review({
        agent: payload.agent, turn: payload.turn, signal: payload.signal,
        output: lastAssistantText(payload.agent),
        userText: turnUserText(payload.agent),
        evidence: turnToolEvidence(payload.agent),
      });
    });
    if (typeof ctx.effect === 'function') ctx.effect(installCompletion);
    else installCompletion();

    const narrowing = createNarrowing({
      evaluate: (input, request) => backend.evaluate(input, request),
      sessions,
      settings: async () => (await resolveConfig({ path })).narrowSettings,
    });
    // Narrow once per turn, on its first step, and only enforce a restriction in
    // enforce mode. The restriction is agent-scoped and lifted before the next
    // turn's pass so a later turn is judged against the full host-allowed set.
    const narrowedTurns = new Map();
    const installNarrowingHook = () => ctx.on('agent/pre-step', async (payload, next) => {
      const agent = payload?.agent;
      const id = agent?.session?.id;
      const turn = payload?.turn;
      if (typeof id === 'string' && Number.isInteger(turn) && await featureOn('narrow')) {
        const state = narrowedTurns.get(id);
        if (!state || state.turn !== turn) {
          state?.dispose?.();
          const entry = { turn, dispose: undefined };
          narrowedTurns.set(id, entry);
          if (narrowedTurns.size > 1024) { const oldest = narrowedTurns.keys().next().value; if (oldest !== id) { narrowedTurns.get(oldest)?.dispose?.(); narrowedTurns.delete(oldest); } }
          try {
            const result = await narrowing.review({
              agent, turn, signal: payload.signal,
              state: stepTaskText(payload.messages), tools: agentTools(ctx, agent),
            });
            if (result.mode === 'enforce' && result.applied && typeof agent?.ctx?.tools?.restrict === 'function') {
              entry.dispose = agent.ctx.tools.restrict({ allow: result.keep });
            }
          } catch { /* narrowing is best effort; never block the step */ }
        }
      }
      return next();
    });
    if (typeof ctx.effect === 'function') ctx.effect(installNarrowingHook);
    else installNarrowingHook();
  }
  const rawSkill = await readFile(new URL('../skills/decision-layer/SKILL.md', import.meta.url), 'utf8');
  const content = rawSkill.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim();
  ctx.skills.register({ name: 'decision-layer', description: '显式发起结构化裁决，辅助明确边界的选择与评分。', content, source: 'bundled' });

  const output = { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] };
  ctx.tools.register({
    name: 'decision_evaluate', description: '对 state 和 questions 执行一次显式结构化裁决，不修改 agent 行为。',
    parameters: { type: 'object', required: ['state', 'questions'], properties: {
      state: { oneOf: [{ type: 'string' }, { type: 'object', additionalProperties: true }, { type: 'array', items: {} }] },
      questions: { type: 'object', additionalProperties: { type: 'object', additionalProperties: true } },
    }, additionalProperties: false },
    output, timeoutMs: 25_000,
    execute: (args, exec) => backend.evaluate(args, { signal: exec.signal }),
  });
  ctx.tools.register({
    name: 'decision_check_connection', description: '向裁决端点发送一次轻量连通测试，不增加自动裁决指标。',
    parameters: { type: 'object', properties: {}, additionalProperties: false }, output, timeoutMs: 25_000,
    execute: async (_args, exec) => {
      const result = await backend.evaluate({ state: 'Connection test', questions: {
        connected: { type: 'noul', instructions: 'Is this a connection test?' },
      } }, { signal: exec.signal });
      return { connected: true, model: result.model, usage: result.usage };
    },
  });

  ctx.inject(['webServer'], web => {
    logStore = createLogStore({ port: web.webServer.port });
    const port = web.webServer.port;
    const analyze = async sessionId => analyzeSessionLogs(sessionId, {
      port,
      trendConfig: (await resolveConfig({ path })).checkSettings,
    });
    const unregister = createManagerRoutes({ path, sessions, backend, logStore, analyze, bindHost: web.webServer.host }).map(route => web.webServer.register(route));
    return () => { unregister.forEach(dispose => dispose()); const store = logStore; logStore = undefined; void store?.dispose(); };
  });
}
