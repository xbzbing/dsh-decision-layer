const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const probability = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
const MAX_STATE = 8 * 1024;

// Core tools an agent almost always needs. They are never judged for relevance
// and never dropped, so narrowing cannot strip the agent's fundamental
// capabilities (reading, editing, shell, search, task tracking).
export const DEFAULT_CORE_TOOLS = Object.freeze([
  'read', 'write', 'edit', 'bash', 'glob', 'grep', 'ls', 'todo_write',
]);

// Tool-name prefixes that are always kept and never judged, on top of the core
// tools. Memory/context tools like OpenViking are "keep resident, trigger on
// demand": their relevance rarely shows in the literal task text, so per-tool
// relevance judging would keep pruning them. Users can override this list.
export const DEFAULT_KEEP_PREFIXES = Object.freeze(['mcp__openviking']);

// Intersect the host-allowed tool set with the model's relevance verdict. Only
// removes tools; never adds. Any missing or invalid noul keeps the tool, and a
// verdict that would strip everything is skipped so the agent is never disabled.
export function narrowTools(allowed, result, { threshold = 0.5 } = {}) {
  const tools = Array.isArray(allowed) ? allowed.filter(name => typeof name === 'string') : [];
  const answers = isObject(result?.answers) ? result.answers : undefined;
  if (tools.length === 0 || !answers) return { applied: false, keep: [...tools], drop: [] };

  const keep = [];
  const drop = [];
  for (const name of tools) {
    const answer = answers[name];
    if (isObject(answer) && answer.type === 'noul' && probability(answer.noul) && answer.noul < threshold) drop.push(name);
    else keep.push(name);
  }
  if (drop.length === 0 || keep.length === 0) return { applied: false, keep: [...tools], drop: [] };
  return { applied: true, keep, drop };
}

// Build one Noul relevance question per candidate tool. The state carries the
// current task; each question references the tool being judged. Noul answers
// have no confidence field, so relevance is read straight from the probability.
export function relevanceQuestions(state, tools) {
  const task = typeof state === 'string' ? state.slice(0, MAX_STATE)
    : isObject(state) ? state : '';
  return {
    state: task,
    questions: Object.fromEntries(tools.map(tool => [tool.name, {
      type: 'noul',
      instructions: {
        tool: { name: tool.name, description: typeof tool.description === 'string' ? tool.description.slice(0, 512) : '' },
        question: '完成当前任务是否会用到 `tool` 描述的这个工具？',
      },
    }])),
  };
}

// Orchestrates one relevance pass over the host-allowed tools. Pure of DSH
// runtime types: the caller supplies the candidate tools and the task state,
// and owns applying the restriction (only enforce mode should act on `drop`).
// `settings` resolves { mode: 'observe' | 'enforce', threshold } live.
//
// Guardrails against over-narrowing a large tool surface:
//   A. core tools are always kept and never judged (DEFAULT_CORE_TOOLS);
//   B. when the judged (optional) candidate count exceeds `maxCandidates`,
//      enforce is downgraded to observe so a large surface cannot be mass-pruned;
//   C. if narrowing would leave fewer than `minKeep` tools total, the verdict is
//      treated as untrustworthy and no restriction is applied.
export function createNarrowing({ evaluate, sessions, settings, coreTools = DEFAULT_CORE_TOOLS,
  keepPrefixes = DEFAULT_KEEP_PREFIXES, minCandidates = 2, maxCandidates = 20, minKeep = 5 } = {}) {
  if (typeof evaluate !== 'function') throw new Error('Narrowing requires an evaluator');
  const core = new Set(Array.isArray(coreTools) ? coreTools.filter(name => typeof name === 'string') : []);
  const defaultPrefixes = Array.isArray(keepPrefixes) ? keepPrefixes.filter(prefix => typeof prefix === 'string' && prefix) : [];
  const resolveSettings = async () => {
    let raw = {};
    try { raw = (typeof settings === 'function' ? await settings() : settings) ?? {}; } catch { raw = {}; }
    const mode = raw?.mode === 'observe' ? 'observe' : 'enforce';
    const threshold = typeof raw?.threshold === 'number' && Number.isFinite(raw.threshold) && raw.threshold >= 0 && raw.threshold <= 1 ? raw.threshold : 0.5;
    // An explicit array in settings (including empty) overrides the default set.
    const prefixes = Array.isArray(raw?.keepPrefixes)
      ? raw.keepPrefixes.filter(prefix => typeof prefix === 'string' && prefix)
      : defaultPrefixes;
    // A configured optional-candidate ceiling overrides the constructor default.
    const cap = Number.isSafeInteger(raw?.maxCandidates) && raw.maxCandidates >= 1 ? raw.maxCandidates : maxCandidates;
    return { mode, threshold, prefixes, cap };
  };
  const record = (turn, outcome, detail = {}) => {
    const id = turn?.agent?.session?.id;
    if (!sessions || typeof id !== 'string') return;
    try { if (typeof sessions.recordNarrow === 'function') sessions.recordNarrow(id, outcome, detail.dropped ?? 0); }
    catch { /* telemetry is best effort */ }
    if (typeof sessions.log !== 'function') return;
    try { sessions.log(id, { kind: 'narrow', outcome, ...detail }); }
    catch { /* logging is best effort */ }
  };
  const skip = { evaluated: false, applied: false, keep: [], drop: [], mode: 'observe' };
  return {
    async review(turn) {
      const tools = Array.isArray(turn?.tools) ? turn.tools.filter(tool => tool && typeof tool.name === 'string') : [];
      const names = tools.map(tool => tool.name);
      const { mode, threshold, prefixes, cap } = await resolveSettings();
      // A: core tools and keep-prefix matches are always kept and never sent to
      // the model for judging (e.g. mcp__openviking memory tools stay resident).
      const alwaysKeep = name => core.has(name) || prefixes.some(prefix => name.startsWith(prefix));
      const keptNames = names.filter(alwaysKeep);
      const optional = tools.filter(tool => !alwaysKeep(tool.name));
      const optionalNames = optional.map(tool => tool.name);
      if (optional.length < minCandidates) return { ...skip, keep: names };
      const hasState = typeof turn?.state === 'string' ? turn.state.trim().length > 0
        : isObject(turn?.state) ? Object.keys(turn.state).length > 0 : false;
      if (!hasState) return { ...skip, keep: names };
      const id = turn?.agent?.session?.id;
      if (sessions && typeof id === 'string') {
        try { if (sessions.snapshot(id).enabled === false) return { ...skip, keep: names }; }
        catch { return { ...skip, keep: names }; }
      }
      // B: a large optional surface must not be enforced — only observed.
      const overCap = optional.length > cap;
      const effectiveMode = overCap ? 'observe' : mode;
      let result;
      try { result = await evaluate(relevanceQuestions(turn.state, optional), { signal: turn.signal }); }
      catch (error) { record(turn, 'error', { reason: typeof error?.reason === 'string' ? error.reason : 'unreachable', mode: effectiveMode }); return { ...skip, keep: names, mode: effectiveMode }; }
      const narrowed = narrowTools(optionalNames, result, { threshold });
      const keep = [...keptNames, ...narrowed.keep];
      const drop = narrowed.drop;
      // C: too few tools left over is a sign the verdict over-pruned; do not apply.
      const trustworthy = keep.length >= minKeep;
      const applied = narrowed.applied && trustworthy && !overCap && mode === 'enforce';
      const dropped = drop.length;
      const detail = { dropped, kept: keep.length, mode: effectiveMode, tools: drop };
      // The optional-candidate count (excludes core tools and keep-prefix matches),
      // recorded so the "too many candidates" reason shows the number that tripped it.
      if (overCap) { detail.reason = 'too-many-candidates'; detail.candidates = optional.length; }
      else if (dropped > 0 && !trustworthy) detail.reason = 'low-keep';
      record(turn, dropped > 0 ? 'applied' : 'ok', detail);
      return { evaluated: true, applied, keep, drop, mode: effectiveMode, overCap, trustworthy };
    },
  };
}
