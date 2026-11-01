import { taskExcerpt } from './excerpt.js';
import { errorReason, isObject, isProbability } from './types.js';
import type { AgentLike, DangerRuleAdditions, DangerRuleSet, EvaluateInput, Evaluator, SessionsFace, ToolExec } from './types.js';

const DEFAULT_COMMAND_PATTERNS: readonly RegExp[] = Object.freeze([
  /\brm\b(?=[^\n]*(?:\s-r(?:f|fr)?\b|\s--recursive\b|\s--force\b))/i,
  /\bgit\s+push\b[^\n]*(?:\s-f\b|\s--force(?:-with-lease)?\b)/i,
  /\b(?:drop|truncate)\s+(?:table|database)\b/i,
  /\bkubectl\s+delete\b/i,
  /\b(?:prod|production)\b[^\n]*\b(?:write|deploy|config|secret)\b/i,
]);
const DEFAULT_PATH_PATTERNS: readonly RegExp[] = Object.freeze([/(?:^|[\\/])(?:etc|production|prod)[\\/]/i, /(?:^|[\\/])\.env(?:$|\.)/i]);
const COMMAND_KEYS = new Set(['command', 'cmd', 'script', 'query']);
const PATH_KEYS = new Set(['path', 'file_path', 'filePath', 'target', 'file', 'filename', 'directory']);
const MAX_RULES = 64;
const MAX_PATTERN_LENGTH = 128;
const MAX_METADATA_LENGTH = 2048;
export const MIN_CONFIDENCE = 0.6;

export const DEFAULT_DANGEROUS_RULES: DangerRuleSet = Object.freeze({
  toolNames: Object.freeze(['bash', 'pwsh', 'shell', 'exec', 'terminal', 'run_command', 'write', 'edit', 'str_replace_editor', 'file_write', 'write_file']),
  commandPatterns: DEFAULT_COMMAND_PATTERNS,
  pathPatterns: DEFAULT_PATH_PATTERNS,
});

const redact = (value: string): string => value.slice(0, MAX_METADATA_LENGTH)
  .replace(/(password|passwd|secret|token|api[_-]?key)\s*[:=]\s*\S+/gi, '$1=[redacted]')
  .replace(/(password|passwd|secret|token|api[_-]?key)\s+\S+/gi, '$1 [redacted]');
const literalPattern = (value: string): RegExp => new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
const boundedList = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()) && item.length <= MAX_PATTERN_LENGTH).slice(0, MAX_RULES) : [];

function collectMetadata(value: unknown, depth = 0, commands: string[] = [], paths: string[] = []): { commands: string[]; paths: string[] } | undefined {
  if (depth > 4 || value === null || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    const normalized = key.toLowerCase();
    if (typeof item === 'string' && COMMAND_KEYS.has(normalized)) commands.push(redact(item));
    else if (typeof item === 'string' && PATH_KEYS.has(normalized)) paths.push(redact(item));
    else if (item && typeof item === 'object' && !['content', 'body', 'data', 'metadata', 'headers', 'env', 'value'].includes(normalized)) {
      collectMetadata(item, depth + 1, commands, paths);
    }
  }
  return { commands, paths };
}

export function summarizeExecution(exec: ToolExec | undefined): { tool: string; command: string; path: string; inspectable: boolean } {
  const commands: string[] = [];
  const paths: string[] = [];
  const collected = collectMetadata(exec?.arguments, 0, commands, paths);
  return { tool: typeof exec?.name === 'string' ? exec.name.slice(0, 128) : '',
    command: commands.join('\n').slice(0, MAX_METADATA_LENGTH), path: paths.join('\n').slice(0, MAX_METADATA_LENGTH),
    inspectable: Boolean(collected) };
}

export type RulesInput = DangerRuleSet | DangerRuleAdditions;

export function normalizeDangerRules(input: DangerRuleAdditions = {}): DangerRuleSet {
  const addTools = boundedList(input.addToolNames);
  const removeTools = new Set(boundedList(input.removeToolNames));
  const tools = [...new Set([...DEFAULT_DANGEROUS_RULES.toolNames, ...addTools])].filter(tool => !removeTools.has(tool));
  const commands = [...DEFAULT_COMMAND_PATTERNS, ...boundedList(input.addCommandPatterns).map(literalPattern)];
  const paths = [...DEFAULT_PATH_PATTERNS, ...boundedList(input.addPathPatterns).map(literalPattern)];
  return { toolNames: tools, commandPatterns: commands, pathPatterns: paths };
}

// A set of compiled rules is distinguishable from the configured additions by
// its `toolNames` array; only the additions get normalized.
const isRuleSet = (rules: RulesInput): rules is DangerRuleSet => Array.isArray((rules as DangerRuleSet).toolNames);

export function classifyDangerous(exec: ToolExec | undefined, rules: RulesInput = DEFAULT_DANGEROUS_RULES): { dangerous: boolean; reason: string } {
  const normalized = isRuleSet(rules) ? rules : normalizeDangerRules(rules);
  const summary = summarizeExecution(exec);
  if (!normalized.toolNames.includes(summary.tool)) return { dangerous: false, reason: 'Tool is outside the dangerous-call rules' };
  if (!summary.inspectable) return { dangerous: true, reason: 'Dangerous call arguments could not be inspected' };
  const byCommand = normalized.commandPatterns.some(pattern => pattern.test(summary.command));
  const byPath = normalized.pathPatterns.some(pattern => pattern.test(summary.path));
  return { dangerous: byCommand || byPath || (!summary.command && !summary.path), reason: 'Dangerous tool call requires a host decision' };
}

function suggestionQuestion(exec: ToolExec | undefined): EvaluateInput {
  return {
    state: summarizeExecution(exec),
    questions: { verdict: {
      type: 'choice', instructions: 'Classify this dangerous tool call. Never grant a permission the host has not already granted.',
      criteria: { allow: 'No additional intervention is recommended', ask: 'Ask the host user for approval', deny: 'Reject this dangerous call' },
    } },
  };
}

type GateDecision = { kind: 'deny'; reason: string; modelSuggestion: string };
type RulesResolver = RulesInput | (() => Promise<RulesInput | undefined>);
type MinConfidenceResolver = number | (() => Promise<number | undefined>);

export type DangerGateOptions = {
  evaluate?: Evaluator;
  sessions?: SessionsFace;
  rules?: RulesResolver;
  minConfidence?: MinConfidenceResolver;
  /**
   * The turn's request text, used only for the bounded, masked excerpt attached
   * to a decision row. Called lazily when a dangerous call is recorded, so the
   * ordinary tool path never derives messages.
   */
  taskText?: (agent: AgentLike | undefined) => unknown;
};

export function createDangerGate({ evaluate, sessions, rules = DEFAULT_DANGEROUS_RULES, minConfidence = MIN_CONFIDENCE, taskText }: DangerGateOptions = {}) {
  if (typeof evaluate !== 'function') throw new Error('Danger gate requires an evaluator');
  const resolveRules = async (): Promise<RulesInput> => {
    if (typeof rules !== 'function') return rules;
    try { return (await rules()) ?? DEFAULT_DANGEROUS_RULES; } catch { return DEFAULT_DANGEROUS_RULES; }
  };
  // The confidence floor may be a fixed number or a live resolver (config-backed),
  // mirroring `rules`, so changing it takes effect without reloading the plugin.
  // An invalid or failed resolution falls back to the built-in floor rather than
  // to 0 — a broken config must never turn the gate into "block every deny".
  const resolveMinConfidence = async (): Promise<number> => {
    if (typeof minConfidence !== 'function') return isProbability(minConfidence) ? minConfidence : MIN_CONFIDENCE;
    try {
      const value = await minConfidence();
      return isProbability(value) ? value : MIN_CONFIDENCE;
    } catch { return MIN_CONFIDENCE; }
  };
  const deniedCalls = new WeakSet<object>();
  const evaluatedCalls = new WeakSet<object>();
  const record = (exec: ToolExec | undefined, outcome: string, detail: Record<string, unknown> = {}): void => {
    const id = exec?.agent?.session?.id;
    if (!sessions || typeof id !== 'string') return;
    try { sessions.record?.(id, 'gate', outcome); } catch { /* metrics cannot change the security decision */ }
    if (typeof sessions.log !== 'function') return;
    // Attach the same redacted, bounded command/path summary that was sent to the
    // backend, so a human reviewing the log sees WHAT was gated (e.g. the actual
    // `rm -rf ...`), not just the tool name. Secrets are already stripped by
    // summarizeExecution; session-state caps the length for storage.
    const summary = summarizeExecution(exec);
    const args: Record<string, unknown> = {};
    if (summary.command) args.command = summary.command;
    if (summary.path) args.path = summary.path;
    // Which task triggered the call, so a denial can be judged in context. The
    // excerpt is masked and bounded by taskExcerpt; the backend request above
    // still carries only the redacted call summary. Deriving it reads the derived
    // message history, so it is isolated: a taskText that throws must never turn
    // a decision record (or the call itself) into a failure.
    let task: string | undefined;
    if (typeof taskText === 'function') {
      try { task = taskExcerpt(taskText(exec?.agent)); } catch { task = undefined; }
    }
    if (task) args.task = task;
    try { sessions.log(id, { kind: 'gate', outcome, tool: exec?.name, ...args, ...detail }); }
    catch { /* logging is best effort */ }
  };
  // Two-tier model: the gate intervenes ONLY on a high-confidence `deny`
  // (returned as kind:'deny', enforced monotonically through tools.guard,
  // independent of the host approval policy). Every other outcome — a low-
  // confidence verdict, a high-confidence allow/ask, an invalid response, or a
  // backend failure — is NOT an intervention: the call proceeds on its original
  // path (next()). The gate no longer emits `ask`, so it never routes through
  // host approval and can no longer be mis-rendered as "the user rejected".
  // `passThrough` records the non-intervention for observability and returns
  // undefined so preExecute falls through to next().
  const passThrough = (exec: ToolExec | undefined, outcome: string, detail: Record<string, unknown> = {}): undefined => {
    record(exec, outcome, { action: 'pass', ...detail });
    if (exec && typeof exec === 'object') evaluatedCalls.add(exec);
    return undefined;
  };
  const gate = {
    classify: (exec: ToolExec | undefined) => classifyDangerous(exec, typeof rules === 'function' ? DEFAULT_DANGEROUS_RULES : rules),
    guardReason(exec: unknown): string | undefined {
      if (!isObject(exec) || !deniedCalls.has(exec)) return undefined;
      deniedCalls.delete(exec);
      return 'Dangerous call rejected by decision policy';
    },
    observeResult(exec: ToolExec | undefined, result: unknown): void {
      if (!exec || typeof exec !== 'object' || !evaluatedCalls.has(exec) || !sessions || typeof sessions.recordActual !== 'function') return;
      const id = exec.agent?.session?.id;
      if (typeof id !== 'string') return;
      const isError = isObject(result) && result.isError === true;
      try { sessions.recordActual(id, isError ? 'deny' : 'allow'); } catch { /* telemetry is best effort */ }
      evaluatedCalls.delete(exec);
    },
    async evaluate(exec: ToolExec): Promise<GateDecision | undefined> {
      let result;
      try {
        result = await evaluate(suggestionQuestion(exec), { signal: exec.signal });
      } catch (error) {
        // Backend failure: no verdict, so do not intervene (pass through).
        return passThrough(exec, 'error', { reason: errorReason(error) });
      }
      // The backend validates the wire shape, but an injected evaluator (a test
      // or an embedder) may hand us a bare verdict: read the two fields it can
      // act on instead of requiring the protocol's `type` discriminator, which
      // is not part of the gate's contract with the host.
      const answer = result?.answers?.verdict as { choice?: unknown; confidence?: unknown } | undefined;
      const choice = typeof answer?.choice === 'string' ? answer.choice : undefined;
      const confidence = typeof answer?.confidence === 'number' ? answer.confidence : undefined;
      if (choice === undefined || !['allow', 'ask', 'deny'].includes(choice)) return passThrough(exec, 'error', { reason: 'invalid-response' });
      const minConfidenceNow = await resolveMinConfidence();
      const confident = confidence !== undefined && Number.isFinite(confidence) && confidence >= minConfidenceNow;
      // Only a high-confidence deny blocks the call.
      if (choice === 'deny' && confident) {
        record(exec, 'deny', { suggestion: 'deny', action: 'deny' });
        if (exec && typeof exec === 'object') deniedCalls.add(exec);
        return { kind: 'deny', reason: 'Dangerous call rejected by decision policy', modelSuggestion: choice };
      }
      // Uncertain (low confidence) or a non-deny verdict → do not intervene.
      const detail: { suggestion: string; reason?: string; confidence?: number } = { suggestion: choice };
      if (!confident) { detail.reason = 'low-confidence'; if (confidence !== undefined && Number.isFinite(confidence)) detail.confidence = confidence; }
      return passThrough(exec, 'allow', detail);
    },
    async preExecute(exec: ToolExec, next: () => unknown): Promise<unknown> {
      const classification = classifyDangerous(exec, await resolveRules());
      if (!classification.dangerous) return next();
      const id = exec?.agent?.session?.id;
      if (sessions && typeof id === 'string') {
        try {
          // A deliberate user toggle bypasses the gate entirely (no record).
          if (sessions.snapshot(id).enabled === false) return next();
        } catch { passThrough(exec, 'error', { reason: 'unreachable' }); return next(); }
      }
      const decision = await gate.evaluate(exec);
      return decision ?? next();
    },
  };
  return gate;
}
