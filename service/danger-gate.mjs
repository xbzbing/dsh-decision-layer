const DEFAULT_COMMAND_PATTERNS = Object.freeze([
  /\brm\b(?=[^\n]*(?:\s-r(?:f|fr)?\b|\s--recursive\b|\s--force\b))/i,
  /\bgit\s+push\b[^\n]*(?:\s-f\b|\s--force(?:-with-lease)?\b)/i,
  /\b(?:drop|truncate)\s+(?:table|database)\b/i,
  /\bkubectl\s+delete\b/i,
  /\b(?:prod|production)\b[^\n]*\b(?:write|deploy|config|secret)\b/i,
]);
const DEFAULT_PATH_PATTERNS = Object.freeze([/(?:^|[\\/])(?:etc|production|prod)[\\/]/i, /(?:^|[\\/])\.env(?:$|\.)/i]);
const COMMAND_KEYS = new Set(['command', 'cmd', 'script', 'query']);
const PATH_KEYS = new Set(['path', 'file_path', 'filePath', 'target', 'file', 'filename', 'directory']);
const MAX_RULES = 64;
const MAX_PATTERN_LENGTH = 128;
const MAX_METADATA_LENGTH = 2048;
export const MIN_CONFIDENCE = 0.7;

export const DEFAULT_DANGEROUS_RULES = Object.freeze({
  toolNames: Object.freeze(['bash', 'pwsh', 'shell', 'exec', 'terminal', 'run_command', 'write', 'edit', 'str_replace_editor', 'file_write', 'write_file']),
  commandPatterns: DEFAULT_COMMAND_PATTERNS,
  pathPatterns: DEFAULT_PATH_PATTERNS,
});

const redact = value => value.slice(0, MAX_METADATA_LENGTH)
  .replace(/(password|passwd|secret|token|api[_-]?key)\s*[:=]\s*\S+/gi, '$1=[redacted]')
  .replace(/(password|passwd|secret|token|api[_-]?key)\s+\S+/gi, '$1 [redacted]');
const literalPattern = value => new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
const boundedList = value => Array.isArray(value) ? value.filter(item => typeof item === 'string' && item.trim() && item.length <= MAX_PATTERN_LENGTH).slice(0, MAX_RULES) : [];

function collectMetadata(value, depth = 0, commands = [], paths = []) {
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

export function summarizeExecution(exec) {
  const commands = [];
  const paths = [];
  const collected = collectMetadata(exec?.arguments, 0, commands, paths);
  return { tool: typeof exec?.name === 'string' ? exec.name.slice(0, 128) : '',
    command: commands.join('\n').slice(0, MAX_METADATA_LENGTH), path: paths.join('\n').slice(0, MAX_METADATA_LENGTH),
    inspectable: Boolean(collected) };
}

export function normalizeDangerRules(input = {}) {
  const addTools = boundedList(input.addToolNames);
  const removeTools = new Set(boundedList(input.removeToolNames));
  const tools = [...new Set([...DEFAULT_DANGEROUS_RULES.toolNames, ...addTools])].filter(tool => !removeTools.has(tool));
  const commands = [...DEFAULT_COMMAND_PATTERNS, ...boundedList(input.addCommandPatterns).map(literalPattern)];
  const paths = [...DEFAULT_PATH_PATTERNS, ...boundedList(input.addPathPatterns).map(literalPattern)];
  return { toolNames: tools, commandPatterns: commands, pathPatterns: paths };
}

export function classifyDangerous(exec, rules = DEFAULT_DANGEROUS_RULES) {
  const normalized = Array.isArray(rules.toolNames) ? rules : normalizeDangerRules(rules);
  const summary = summarizeExecution(exec);
  if (!normalized.toolNames.includes(summary.tool)) return { dangerous: false, reason: 'Tool is outside the dangerous-call rules' };
  if (!summary.inspectable) return { dangerous: true, reason: 'Dangerous call arguments could not be inspected' };
  const byCommand = normalized.commandPatterns.some(pattern => pattern.test(summary.command));
  const byPath = normalized.pathPatterns.some(pattern => pattern.test(summary.path));
  return { dangerous: byCommand || byPath || (!summary.command && !summary.path), reason: 'Dangerous tool call requires a host decision' };
}

function suggestionQuestion(exec) {
  return {
    state: summarizeExecution(exec),
    questions: { verdict: {
      type: 'choice', instructions: 'Classify this dangerous tool call. Never grant a permission the host has not already granted.',
      criteria: { allow: 'No additional intervention is recommended', ask: 'Ask the host user for approval', deny: 'Reject this dangerous call' },
    } },
  };
}

export function createDangerGate({ evaluate, sessions, rules = DEFAULT_DANGEROUS_RULES, minConfidence = MIN_CONFIDENCE } = {}) {
  if (typeof evaluate !== 'function') throw new Error('Danger gate requires an evaluator');
  const resolveRules = async () => {
    if (typeof rules !== 'function') return rules;
    try { return (await rules()) ?? DEFAULT_DANGEROUS_RULES; } catch { return DEFAULT_DANGEROUS_RULES; }
  };
  const deniedCalls = new WeakSet();
  const evaluatedCalls = new WeakSet();
  const record = (exec, outcome, detail = {}) => {
    const id = exec?.agent?.session?.id;
    if (!sessions || typeof id !== 'string') return;
    try { sessions.record(id, 'gate', outcome); } catch { /* metrics cannot change the security decision */ }
    if (typeof sessions.log !== 'function') return;
    try { sessions.log(id, { kind: 'gate', outcome, tool: exec?.name, ...detail }); }
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
  const passThrough = (exec, outcome, detail = {}) => {
    record(exec, outcome, { action: 'pass', ...detail });
    if (exec && typeof exec === 'object') evaluatedCalls.add(exec);
    return undefined;
  };
  return {
    classify: exec => classifyDangerous(exec, typeof rules === 'function' ? DEFAULT_DANGEROUS_RULES : rules),
    guardReason(exec) {
      if (!exec || !deniedCalls.has(exec)) return undefined;
      deniedCalls.delete(exec);
      return 'Dangerous call rejected by decision policy';
    },
    observeResult(exec, result) {
      if (!evaluatedCalls.has(exec) || !sessions || typeof sessions.recordActual !== 'function') return;
      const id = exec?.agent?.session?.id;
      if (typeof id !== 'string') return;
      try { sessions.recordActual(id, result?.isError ? 'deny' : 'allow'); } catch { /* telemetry is best effort */ }
      evaluatedCalls.delete(exec);
    },
    async evaluate(exec) {
      let result;
      try {
        result = await evaluate(suggestionQuestion(exec), { signal: exec.signal });
      } catch (error) {
        // Backend failure: no verdict, so do not intervene (pass through).
        return passThrough(exec, 'error', { reason: typeof error?.reason === 'string' ? error.reason : 'unreachable' });
      }
      const answer = result?.answers?.verdict;
      const choice = answer?.choice;
      if (!['allow', 'ask', 'deny'].includes(choice)) return passThrough(exec, 'error', { reason: 'invalid-response' });
      const confident = typeof answer.confidence === 'number' && Number.isFinite(answer.confidence) && answer.confidence >= minConfidence;
      // Only a high-confidence deny blocks the call.
      if (choice === 'deny' && confident) {
        record(exec, 'deny', { suggestion: 'deny', action: 'deny' });
        if (exec && typeof exec === 'object') deniedCalls.add(exec);
        return { kind: 'deny', reason: 'Dangerous call rejected by decision policy', modelSuggestion: choice };
      }
      // Uncertain (low confidence) or a non-deny verdict → do not intervene.
      const detail = { suggestion: choice };
      if (!confident) { detail.reason = 'low-confidence'; if (typeof answer.confidence === 'number' && Number.isFinite(answer.confidence)) detail.confidence = answer.confidence; }
      return passThrough(exec, 'allow', detail);
    },
    async preExecute(exec, next) {
      const classification = classifyDangerous(exec, await resolveRules());
      if (!classification.dangerous) return next();
      const id = exec?.agent?.session?.id;
      if (sessions && typeof id === 'string') {
        try {
          // A deliberate user toggle bypasses the gate entirely (no record).
          if (sessions.snapshot(id).enabled === false) return next();
        } catch { passThrough(exec, 'error', { reason: 'unreachable' }); return next(); }
      }
      const decision = await this.evaluate(exec);
      return decision ?? next();
    },
  };
}
