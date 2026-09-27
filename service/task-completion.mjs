const MAX_STATE = 8 * 1024;
const MAX_CONDITION = 512;
const MAX_CONDITIONS = 20;
const MAX_EVIDENCE = 40;

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const probability = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

const STEER_TEXT = '本回合任务完成核对发现有明确交付条件尚未满足：请对照用户列出的条件逐项复核，补完未完成的部分。';

// Deterministic extraction of the explicit deliverable conditions a user listed.
// Only structured forms are recognized — numbered lists, bullet lists, and a
// single line of comma/、-separated multiple commands. Implicit or inferred
// expectations are deliberately out of scope for the first version.
export function extractConditions(userText) {
  const text = typeof userText === 'string' ? userText : '';
  if (!text.trim()) return [];
  const conditions = [];
  const push = value => {
    const item = value.trim().replace(/\s+/g, ' ').slice(0, MAX_CONDITION);
    if (item && !conditions.includes(item)) conditions.push(item);
  };
  const lines = text.split(/\r?\n/);
  let matchedStructured = false;
  for (const line of lines) {
    // Numbered: `1. `, `1) `, `1、`, `（1）`, `(1)`; or bullets: `- `, `* `, `• `.
    const numbered = line.match(/^\s*(?:[（(]?\d+[)）.、]|\d+\s*[.)、])\s+(.*)$/);
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    if (numbered && numbered[1].trim()) { push(numbered[1]); matchedStructured = true; }
    else if (bullet && bullet[1].trim()) { push(bullet[1]); matchedStructured = true; }
  }
  // Fallback: a single instruction line joining multiple commands with 、/,/，
  // and enough parts to look like an explicit multi-step ask (e.g. "改配置、跑测试、说明失败原因").
  if (!matchedStructured) {
    const compact = text.trim();
    if (!/[\r\n]/.test(compact)) {
      const parts = compact.split(/[、，,]/).map(part => part.trim()).filter(Boolean);
      if (parts.length >= 2) for (const part of parts) push(part);
    }
  }
  return conditions.slice(0, MAX_CONDITIONS);
}

// Build one choice question per explicit condition. The state carries the
// conditions, the turn's tool evidence, and the final reply. Tool evidence is
// primary; the reply's own claims are explicitly NOT treated as proof, so the
// model can answer insufficient_evidence when only the reply asserts completion.
export function completionQuestions(conditions, evidence, answer) {
  const items = Array.isArray(conditions) ? conditions.slice(0, MAX_CONDITIONS) : [];
  const tools = Array.isArray(evidence)
    ? evidence.filter(item => isObject(item) && typeof item.tool === 'string').slice(0, MAX_EVIDENCE)
      .map(item => ({ tool: item.tool.slice(0, 128), outcome: item.outcome === 'error' ? 'error' : 'ok' }))
    : [];
  const state = {
    conditions: items.map((text, index) => ({ id: `c${index}`, text })),
    toolEvidence: tools,
    finalReply: String(answer ?? '').slice(0, MAX_STATE),
    note: '工具证据（toolEvidence）是判定依据；finalReply 自称完成不作为证据。缺少证据时选 insufficient_evidence。',
  };
  const questions = Object.fromEntries(items.map((text, index) => [`c${index}`, {
    type: 'choice',
    instructions: {
      condition: text,
      question: '根据当前工具证据与最终回复，这个交付条件的完成情况属于哪一种？',
    },
    criteria: {
      satisfied: '有工具证据或用户明确确认表明该条件已完成',
      unsatisfied: '有证据表明该条件未完成或做错',
      insufficient_evidence: '现有证据不足以判断该条件是否完成',
    },
  }]));
  return { state, questions };
}

// Orchestrates one task-completion pass at turn end. Read-only by default: it
// records a per-condition verdict and only steers when explicitly configured,
// the model is confident, and at least one condition is not satisfied. A steer
// opens a supplemental step; it never rewrites the already-committed reply.
export function createTaskCompletion({ evaluate, sessions, steer, settings, minConfidence = 0.4 } = {}) {
  if (typeof evaluate !== 'function') throw new Error('Task completion requires an evaluator');
  const steeredTurns = new Set();
  const steerKey = turn => {
    const id = turn?.agent?.session?.id;
    return typeof id === 'string' && Number.isInteger(turn?.turn) ? `${id}:${turn.turn}` : undefined;
  };
  const resolveSettings = async () => {
    let raw = {};
    try { raw = (typeof settings === 'function' ? await settings() : settings) ?? {}; } catch { raw = {}; }
    const mode = raw?.mode === 'steer' ? 'steer' : 'observe';
    const minConditions = Number.isSafeInteger(raw?.minConditions) && raw.minConditions >= 2 ? raw.minConditions : 2;
    return { mode, minConditions };
  };
  const record = (turn, outcome, detail = {}) => {
    const id = turn?.agent?.session?.id;
    if (!sessions || typeof id !== 'string' || typeof sessions.recordComplete !== 'function') return;
    try { sessions.recordComplete(id, outcome, detail); } catch { /* telemetry is best effort */ }
    if (typeof sessions.log !== 'function') return;
    try { sessions.log(id, { kind: 'complete', outcome, ...detail }); }
    catch { /* logging is best effort */ }
  };
  const skip = { evaluated: false, steered: false };
  return {
    async review(turn) {
      const output = typeof turn?.output === 'string' ? turn.output.trim() : '';
      const { mode, minConditions } = await resolveSettings();
      const conditions = extractConditions(turn?.userText);
      if (conditions.length < minConditions) return { ...skip };
      const evidence = Array.isArray(turn?.evidence) ? turn.evidence : [];
      if (evidence.length === 0) return { ...skip };
      const id = turn?.agent?.session?.id;
      if (sessions && typeof id === 'string') {
        try { if (sessions.snapshot(id).enabled === false) return { ...skip }; }
        catch { return { ...skip }; }
      }
      let answers;
      try {
        const result = await evaluate(completionQuestions(conditions, evidence, output), { signal: turn.signal });
        answers = isObject(result?.answers) ? result.answers : undefined;
      } catch (error) {
        record(turn, 'error', { reason: typeof error?.reason === 'string' ? error.reason : 'unreachable' });
        return { ...skip };
      }
      if (!answers) { record(turn, 'error', { reason: 'invalid-response' }); return { ...skip }; }
      let satisfied = 0, unsatisfied = 0, insufficient = 0;
      let minConf = 1;
      for (let index = 0; index < conditions.length; index++) {
        const answer = answers[`c${index}`];
        if (!isObject(answer) || answer.type !== 'choice' || typeof answer.choice !== 'string') {
          insufficient++; continue;
        }
        if (probability(answer.confidence)) minConf = Math.min(minConf, answer.confidence);
        if (answer.choice === 'satisfied') satisfied++;
        else if (answer.choice === 'unsatisfied') unsatisfied++;
        else insufficient++;
      }
      const outcome = unsatisfied > 0 ? 'unsatisfied' : 'ok';
      const detail = { conditions: conditions.length, satisfied, unsatisfied, insufficient };
      // A steer is only for a confident finding that a listed condition is not met.
      const confident = unsatisfied > 0 && minConf >= minConfidence;
      let steered = false;
      if (mode === 'steer' && confident && typeof steer === 'function' && turn?.agent) {
        const key = steerKey(turn);
        if (key !== undefined && !steeredTurns.has(key)) {
          steeredTurns.add(key);
          if (steeredTurns.size > 4096) steeredTurns.delete(steeredTurns.values().next().value);
          try { steer(turn.agent, STEER_TEXT); steered = true; }
          catch { steered = false; }
        }
      }
      if (steered) detail.steered = true;
      record(turn, outcome, detail);
      return { evaluated: true, steered, satisfied, unsatisfied, insufficient };
    },
  };
}
