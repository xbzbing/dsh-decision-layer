import { readFile } from 'node:fs/promises';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { resolveConfig, featureEnabled } from './config-store.js';
import { createBackend } from './backend.js';
import { createManagerRoutes } from './manager-api.js';
import { createSessionState } from './session-state.js';
import { createDangerGate, normalizeDangerRules } from './danger-gate.js';
import { createSelfCheck } from './self-check.js';
import { createNarrowing } from './narrowing.js';
import { createTaskCompletion } from './task-completion.js';
import { createLoopGuard } from './loop-guard.js';
import { createLogStore } from './log-store.js';
import { createStateStore } from './state-store.js';
import { analyzeSessionLogs, reconstructSessionSeed, listSessionDecisions } from './log-analyze.js';
import { isObject } from './types.js';
import type {
  AgentLike, EvaluateInput, HostContext, NextStep, ToolCandidate, ToolExec, WebFace,
} from './types.js';

export const name = 'dsh-decision-layer';
export const inject = ['tools', 'skills'];

type LooseMessage = { role?: unknown; content?: unknown; name?: unknown; toolName?: unknown; isError?: unknown };

const asMessage = (value: unknown): LooseMessage | undefined => (isObject(value) ? value as LooseMessage : undefined);

// The text blocks of one message's content, joined; '' for any other shape.
const textOf = (content: unknown): string => Array.isArray(content)
  ? content.filter(block => isObject(block) && block.type === 'text' && typeof block.text === 'string')
    .map(block => (block as { text: string }).text).join('')
  : '';

const derivedMessages = (agent: unknown): unknown[] | undefined => {
  const messages = ((agent as { session?: { deriveMessages?: () => unknown } } | undefined)?.session)?.deriveMessages?.();
  return Array.isArray(messages) ? messages : undefined;
};

// Best-effort extraction of the turn's final assistant text. The self-check
// treats empty output as "skip", so an unreachable shape degrades safely.
function lastAssistantText(agent: unknown): string {
  try {
    const messages = derivedMessages(agent);
    if (!messages) return '';
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = asMessage(messages[i]);
      if (message?.role !== 'assistant' || !Array.isArray(message.content)) continue;
      return textOf(message.content);
    }
    return '';
  } catch { return ''; }
}

// The task text a narrowing pass judges tools against: the user messages
// entering this step. An unreachable shape yields '', which skips narrowing.
function stepTaskText(messages: unknown): string {
  try {
    if (!Array.isArray(messages)) return '';
    return messages
      .map(asMessage)
      .filter((message): message is LooseMessage => message?.role === 'user' && Array.isArray(message.content))
      .flatMap(message => (message.content as unknown[])
        .filter(block => isObject(block) && block.type === 'text' && typeof block.text === 'string')
        .map(block => (block as { text: string }).text))
      .join('\n').slice(0, 8 * 1024);
  } catch { return ''; }
}

// The user's request text for this turn, used by task-completion to extract the
// explicit conditions. Best-effort: an unreachable shape yields '', which skips
// the check. Takes the trailing run of user messages (the prompt entering the turn).
function turnUserText(agent: unknown): string {
  try {
    const messages = derivedMessages(agent);
    if (!messages) return '';
    const texts: string[] = [];
    let collecting = false;
    // Walk backwards: skip the turn's trailing assistant/tool messages, collect the
    // contiguous user run that started this turn, then stop at the prior assistant.
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = asMessage(messages[i]);
      if (message?.role === 'user' && Array.isArray(message.content)) {
        collecting = true;
        texts.unshift(message.content.filter(block => isObject(block) && block.type === 'text' && typeof block.text === 'string')
          .map(block => (block as { text: string }).text).join('\n'));
      } else if (collecting) break;
    }
    return texts.join('\n').slice(0, 8 * 1024);
  } catch { return ''; }
}

// Tool evidence for the turn's task-completion check: the tool calls and their
// ok/error outcome from the derived history. Names only (no arguments), bounded.
// An unreachable shape yields [], which skips the check.
function turnToolEvidence(agent: unknown): { tool: string; outcome: 'ok' | 'error' }[] {
  try {
    const messages = derivedMessages(agent);
    if (!messages) return [];
    const evidence: { tool: string; outcome: 'ok' | 'error' }[] = [];
    for (const item of messages) {
      const message = asMessage(item);
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
function agentTools(ctx: HostContext, agent: AgentLike | undefined): ToolCandidate[] {
  try {
    const schemas = typeof ctx.tools?.schemas === 'function' ? ctx.tools.schemas(agent) : undefined;
    if (!Array.isArray(schemas)) return [];
    return schemas
      .filter((schema): schema is { name: string; description?: unknown } => isObject(schema) && typeof schema.name === 'string')
      .map(schema => ({ name: schema.name, description: typeof schema.description === 'string' ? schema.description : '' }));
  } catch { return []; }
}

export async function apply(ctx: HostContext, options: { configPath?: string } = {}): Promise<void> {
  const path = options.configPath;
  const backend = createBackend({ config: () => resolveConfig({ path }) });
  // The research log sink is attached once the web server reveals the instance
  // port (used in the file name); until then decision logs stay in memory only.
  let logStore: ReturnType<typeof createLogStore> | undefined;
  // Durable per-session mirror of the live decision counters/log, keyed by
  // session id (not port), so a resumed session's panel survives an instance
  // restart instead of resetting to zero. Independent of the JSONL research log.
  const stateStore = createStateStore();
  const sessions = createSessionState({
    onLog: entry => logStore?.append(entry),
    // Restore a resumed session from its durable snapshot; if it has none yet but
    // has persisted JSONL decision history (e.g. a session that predates this
    // persistence, or whose snapshot was pruned), reconstruct a seed from the
    // logs instead. Logs are read across all ports and filtered by the globally
    // unique session id, so a changed instance port never orphans the history.
    loadState: async id => (await stateStore.load(id)) ?? reconstructSessionSeed(id, {
      trendConfig: (await resolveConfig({ path })).checkSettings,
    }).catch(() => undefined),
    persistState: (id, state) => stateStore.save(id, state),
  });
  if (typeof ctx.effect === 'function') ctx.effect(() => () => { void stateStore.dispose(); });
  const gate = createDangerGate({
    evaluate: (input, request) => backend.evaluate(input, request),
    sessions,
    rules: async () => normalizeDangerRules((await resolveConfig({ path })).dangerRules),
    // Live config-backed floor (default 0.6): a `deny` only blocks once the model
    // is at least this confident. Read per call so an edit takes effect at once.
    minConfidence: async () => (await resolveConfig({ path })).gateSettings?.minConfidence,
    // Read lazily (only when a dangerous call is recorded) so ordinary tool calls
    // never pay for deriveMessages().
    taskText: agent => turnUserText(agent),
  });
  const loopGuard = createLoopGuard({ sessions });
  // Live per-feature enablement; every decision point defaults to enabled.
  // An invalid config must not fail every tool call: these hooks run inside the
  // host's tools/pre-execute waterfall, which converts a throw into a failed call
  // (the tool never dispatches, so `read`/`edit` can no longer repair the file).
  // An unreadable config therefore degrades to "all features on", and each
  // decision point keeps its own safe fallback (the gate falls back to 0.6 and
  // the built-in rules), so the safety net stays armed instead of the agent
  // losing every tool.
  const featureOn = async (key: 'gate' | 'check' | 'narrow' | 'complete'): Promise<boolean> => {
    try { return featureEnabled((await resolveConfig({ path })).features, key); }
    catch { return true; }
  };
  if (typeof ctx.on === 'function') {
    if (typeof ctx.tools.guard === 'function') {
      // Deterministic loop guard runs with no backend; then the dangerous-gate
      // monotonic denial. Guards can only deny, never re-allow.
      ctx.tools.guard((exec: ToolExec) => loopGuard.check(exec));
      ctx.tools.guard((exec: ToolExec) => gate.guardReason(exec));
    }
    const install = (): (() => void) => {
      const disposePre = ctx.on('tools/pre-execute', async (exec: ToolExec, next: NextStep) => {
        if (!(await featureOn('gate'))) return next();
        return gate.preExecute(exec, next);
      });
      const disposePost = ctx.on('tools/post-execute', async (exec: ToolExec, result: unknown, next: NextStep) => {
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
      steer: (agent, text) => {
        // The host's agent always has steer; if it does not, fail loudly so
        // createSteerOnce treats it as a failed steer and keeps the turn budget.
        if (typeof agent.steer !== 'function') throw new Error('Agent cannot be steered');
        return agent.steer(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }));
      },
    });
    const installCheck = () => ctx.on('agent/turn-stopping', async (payload: TurnStoppingPayload) => {
      if (!(await featureOn('check'))) return;
      return selfCheck.review({
        agent: payload.agent, turn: payload.turn, signal: payload.signal,
        output: lastAssistantText(payload.agent),
        userText: turnUserText(payload.agent),
      });
    });
    if (typeof ctx.effect === 'function') ctx.effect(installCheck);
    else installCheck();

    const taskCompletion = createTaskCompletion({
      evaluate: (input, request) => backend.evaluate(input, request),
      sessions,
      settings: async () => (await resolveConfig({ path })).completeSettings,
      steer: (agent, text) => {
        // The host's agent always has steer; if it does not, fail loudly so
        // createSteerOnce treats it as a failed steer and keeps the turn budget.
        if (typeof agent.steer !== 'function') throw new Error('Agent cannot be steered');
        return agent.steer(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }));
      },
    });
    // Independent turn-stopping listener, separate from the self-check: it checks
    // whether the user's explicit conditions have supporting tool evidence.
    const installCompletion = () => ctx.on('agent/turn-stopping', async (payload: TurnStoppingPayload) => {
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
    const narrowedTurns = new Map<string, { turn: number; dispose: (() => void) | undefined }>();
    const installNarrowingHook = () => ctx.on('agent/pre-step', async (payload: PreStepPayload, next: NextStep) => {
      const agent = payload?.agent;
      const id = agent?.session?.id;
      const turn = payload?.turn;
      // Rehydrate this session's persisted counters/log on its first step this
      // process, before any gate/check/narrow/complete event mutates them, so a
      // resumed session continues from its saved totals instead of from zero.
      if (typeof id === 'string') await sessions.ensureLoaded(id);
      if (typeof id === 'string' && Number.isInteger(turn)) {
        const state = narrowedTurns.get(id);
        if (!state || state.turn !== turn) {
          // Release the previous turn's restriction first: restrict is agent-scoped
          // and stays in force until disposed, so a turn where narrowing is now off
          // must not inherit the earlier allow-list.
          state?.dispose?.();
          narrowedTurns.delete(id);
          if (await featureOn('narrow')) {
            const entry: { turn: number; dispose: (() => void) | undefined } = { turn: turn as number, dispose: undefined };
            narrowedTurns.set(id, entry);
            if (narrowedTurns.size > 1024) {
              const oldest = narrowedTurns.keys().next().value as string;
              if (oldest !== id) { narrowedTurns.get(oldest)?.dispose?.(); narrowedTurns.delete(oldest); }
            }
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
      }
      return next();
    });
    if (typeof ctx.effect === 'function') ctx.effect(installNarrowingHook);
    else installNarrowingHook();
  }
  const rawSkill = await readFile(new URL('../../skills/decision-layer/SKILL.md', import.meta.url), 'utf8');
  const content = rawSkill.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim();
  ctx.skills.register({ name: 'decision-layer', description: '显式发起结构化裁决，辅助明确边界的选择与评分。', content, source: 'bundled' });

  const output = { schema: { type: 'object', additionalProperties: true }, render: (_args: unknown, value: unknown) => [{ type: 'text', text: JSON.stringify(value) }] };
  ctx.tools.register({
    name: 'decision_evaluate', description: '对 state 和 questions 执行一次显式结构化裁决，不修改 agent 行为。',
    parameters: { type: 'object', required: ['state', 'questions'], properties: {
      state: { oneOf: [{ type: 'string' }, { type: 'object', additionalProperties: true }, { type: 'array', items: {} }] },
      questions: { type: 'object', additionalProperties: { type: 'object', additionalProperties: true } },
    }, additionalProperties: false },
    output, timeoutMs: 25_000,
    execute: (args, exec) => backend.evaluate(args as EvaluateInput, { signal: exec.signal }),
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

  ctx.inject(['webServer'], (web: WebFace) => {
    logStore = createLogStore({ port: web.webServer.port });
    const port = web.webServer.port;
    const analyze = async (sessionId: string) => analyzeSessionLogs(sessionId, {
      port,
      trendConfig: (await resolveConfig({ path })).checkSettings,
    });
    const listRows = (sessionId: string, { page, pageSize }: { page?: number; pageSize?: number } = {}) => listSessionDecisions(sessionId, { port, page, pageSize });
    const unregister = createManagerRoutes({ path, sessions, backend, logStore, analyze, listRows, bindHost: web.webServer.host }).map(route => web.webServer.register(route));
    return () => { unregister.forEach(dispose => dispose()); const store = logStore; logStore = undefined; void store?.dispose(); };
  });
}

type TurnStoppingPayload = { agent?: AgentLike; turn?: number; signal?: AbortSignal };
type PreStepPayload = { agent?: AgentLike; turn?: number; signal?: AbortSignal; messages?: unknown };
