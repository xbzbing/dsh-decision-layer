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
import { createDecisionContext } from './decision-context.js';
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
  // Messages this plugin steered itself carry `kind:user` for host compatibility
  // but are our own supplemental prompt, not the user's request; remember their
  // ids so the next context pass does not treat one as the task.
  const steeredIds = new Map<string, true>();
  const rememberSteer = (message: unknown): void => {
    const id = isObject(message) && typeof message.id === 'string' ? message.id : undefined;
    if (!id) return;
    steeredIds.set(id, true);
    if (steeredIds.size > 256) steeredIds.delete(steeredIds.keys().next().value as string);
  };
  const steerAgent = (agent: AgentLike, text: string): unknown => {
    // The host's agent always has steer; if it does not, fail loudly so
    // createSteerOnce treats it as a failed steer and keeps the turn budget.
    if (typeof agent.steer !== 'function') throw new Error('Agent cannot be steered');
    const message = createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } });
    rememberSteer(message);
    return agent.steer(message);
  };
  // One per-turn boundary and snapshot per agent, so every decision point reads
  // the same current request and the same current-turn evidence.
  const decisionContext = createDecisionContext({ ignored: id => steeredIds.has(id) });
  const gate = createDangerGate({
    evaluate: (input, request) => backend.evaluate(input, request),
    sessions,
    rules: async () => normalizeDangerRules((await resolveConfig({ path })).dangerRules),
    // Live config-backed floor (default 0.6): a `deny` only blocks once the model
    // is at least this confident. Read per call so an edit takes effect at once.
    minConfidence: async () => (await resolveConfig({ path })).gateSettings?.minConfidence,
    // Read lazily (only when a dangerous call is recorded) so ordinary tool calls
    // never pay for deriveMessages(). The gate itself still sends only the call
    // summary; this excerpt is local-log context, from the same snapshot the other
    // decision points use.
    taskText: agent => decisionContext.snapshot(agent).context.request,
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
      steer: steerAgent,
    });
    const installCheck = () => ctx.on('agent/turn-stopping', async (payload: TurnStoppingPayload) => {
      if (!(await featureOn('check'))) return;
      const snapshot = decisionContext.snapshot(payload.agent);
      return selfCheck.review({
        agent: payload.agent, turn: payload.turn, signal: payload.signal,
        output: lastAssistantText(payload.agent),
        context: snapshot.context,
      });
    });
    if (typeof ctx.effect === 'function') ctx.effect(installCheck);
    else installCheck();

    const taskCompletion = createTaskCompletion({
      evaluate: (input, request) => backend.evaluate(input, request),
      sessions,
      settings: async () => (await resolveConfig({ path })).completeSettings,
      steer: steerAgent,
    });
    // Independent turn-stopping listener, separate from the self-check: it checks
    // whether the user's explicit conditions have supporting tool evidence.
    const installCompletion = () => ctx.on('agent/turn-stopping', async (payload: TurnStoppingPayload) => {
      if (!(await featureOn('complete'))) return;
      const snapshot = decisionContext.snapshot(payload.agent);
      return taskCompletion.review({
        agent: payload.agent, turn: payload.turn, signal: payload.signal,
        output: lastAssistantText(payload.agent),
        // Conditions come only from this turn's real user text; evidence only from
        // this turn's window, so an earlier task's successes cannot vouch for it.
        userText: snapshot.conditionsText,
        evidence: snapshot.evidence,
        context: snapshot.context,
      });
    });
    if (typeof ctx.effect === 'function') ctx.effect(installCompletion);
    else installCompletion();

    const narrowing = createNarrowing({
      evaluate: (input, request) => backend.evaluate(input, request),
      sessions,
      settings: async () => (await resolveConfig({ path })).narrowSettings,
    });
    // Narrow on the first step of a turn and again when a new real user request
    // arrives inside the same turn. A notice (time/runtime/background/schedule)
    // never triggers a re-pass. Every re-judgement first releases the previous
    // agent-scoped restriction, so the candidate set is the host's full allowed
    // set again — intersecting with the earlier allow-list could never restore a
    // tool. The host resolves this step's tool set BEFORE dispatching pre-step, so
    // a new restriction takes effect from the next step, not this one.
    const narrowedTurns = new Map<string, { turn: number; dispose: (() => void) | undefined }>();
    const releaseNarrowing = (id: string): void => {
      const entry = narrowedTurns.get(id);
      if (!entry) return;
      try { entry.dispose?.(); } catch { /* a failed release must never block the step */ }
      narrowedTurns.delete(id);
    };
    const installNarrowingHook = (): (() => void) => {
      const disposeHook = ctx.on('agent/pre-step', async (payload: PreStepPayload, next: NextStep) => {
        const agent = payload?.agent;
        const id = agent?.session?.id;
        const turn = payload?.turn;
        // Rehydrate this session's persisted counters/log on its first step this
        // process, before any gate/check/narrow/complete event mutates them, so a
        // resumed session continues from its saved totals instead of from zero.
        if (typeof id === 'string') await sessions.ensureLoaded(id);
        if (typeof id === 'string' && Number.isInteger(turn)) {
          const entered = decisionContext.enter(agent, { turn, messages: payload.messages });
          const previous = narrowedTurns.get(id);
          const turnChanged = !previous || previous.turn !== turn;
          if (turnChanged || entered.changed) {
            // Release before judging: the previous allow-list is agent-scoped and
            // must not narrow the new candidate set (it could hide tools forever).
            releaseNarrowing(id);
            if (await featureOn('narrow')) {
              const entry: { turn: number; dispose: (() => void) | undefined } = { turn: turn as number, dispose: undefined };
              narrowedTurns.set(id, entry);
              if (narrowedTurns.size > 1024) {
                const oldest = narrowedTurns.keys().next().value as string;
                if (oldest !== id) releaseNarrowing(oldest);
              }
              try {
                // `enter` skips snapshot work for steps with no new request; a turn
                // boundary seen for the first time here (e.g. narrowing was off when
                // the turn opened) still needs one, hence the fallback.
                const { context } = entered.snapshot ?? decisionContext.snapshot(agent);
                const result = await narrowing.review({
                  agent, turn, step: payload.step, signal: payload.signal,
                  state: { request: context.request, background: context.background, progress: context.progress },
                  taskText: context.request,
                  tools: agentTools(ctx, agent),
                });
                if (result.mode === 'enforce' && result.applied && typeof agent?.ctx?.tools?.restrict === 'function') {
                  const restriction = agent.ctx.tools.restrict({ allow: result.keep });
                  // The plugin may have been disposed while the request was in flight;
                  // assigning to a removed entry would leak the restriction.
                  if (narrowedTurns.get(id) === entry) entry.dispose = restriction;
                  else restriction?.();
                }
              } catch { /* narrowing is best effort; never block the step */ }
            }
          }
        }
        return next();
      });
      return () => {
        disposeHook?.();
        for (const key of [...narrowedTurns.keys()]) releaseNarrowing(key);
      };
    };
    if (typeof ctx.effect === 'function') ctx.effect(installNarrowingHook);
    else installNarrowingHook();

    // The host resolves a step's tool set BEFORE `agent/pre-step` runs, so a
    // restriction lifted at the next turn's first step would still constrain that
    // step (and a one-step turn would never recover). `turn/end` is appended in
    // the loop's finally — including aborted and failed turns — so releasing
    // there is the last point before the next turn's tools.resolve.
    const installNarrowingRelease = () => ctx.on('session/event', (subject: unknown, event: unknown) => {
      if (!isObject(event) || event.type !== 'turn/end') return;
      const id = isObject(subject) && typeof subject.id === 'string' ? subject.id : undefined;
      if (id !== undefined) releaseNarrowing(id);
    });
    if (typeof ctx.effect === 'function') ctx.effect(installNarrowingRelease);
    else installNarrowingRelease();
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
    const listRows = (sessionId: string, { page, pageSize, lowOnly }: { page?: number; pageSize?: number; lowOnly?: boolean } = {}) => listSessionDecisions(sessionId, { port, page, pageSize, lowOnly });
    const unregister = createManagerRoutes({ path, sessions, backend, logStore, analyze, listRows, bindHost: web.webServer.host }).map(route => web.webServer.register(route));
    return () => { unregister.forEach(dispose => dispose()); const store = logStore; logStore = undefined; void store?.dispose(); };
  });
}

type TurnStoppingPayload = { agent?: AgentLike; turn?: number; signal?: AbortSignal };
type PreStepPayload = { agent?: AgentLike; turn?: number; step?: number; signal?: AbortSignal; messages?: unknown };
