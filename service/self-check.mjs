import { createSteerOnce } from './steer-once.mjs';

const MAX_OUTPUT = 24 * 1024;

export const DEFAULT_RUBRIC = Object.freeze([
  '明显答非所问，或存在严重遗漏 / 自相矛盾',
  '基本答到问题，但有可察觉的遗漏或不严谨',
  '完整、准确、无自相矛盾地回应了请求',
]);

const STEER_TEXT = '本回合自检得分偏低：请复核是否答到了用户的问题、有无遗漏或自相矛盾，并在需要时补完。';

// A short, single-line hint of the request this self-check judged, so a human
// reviewing the log knows WHICH turn's output was scored (not just "self-check").
// Best-effort over an untrusted string; whitespace collapses and length is capped.
function subjectOf(text) {
  if (typeof text !== 'string') return undefined;
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed ? collapsed.slice(0, 120) : undefined;
}

function boundedRubric(rubric) {
  if (!Array.isArray(rubric)) return DEFAULT_RUBRIC;
  const levels = rubric.filter(item => typeof item === 'string' && item.trim() && item.length <= 256).slice(0, 10);
  return levels.length >= 2 ? levels : DEFAULT_RUBRIC;
}

export function scoreQuestion(output, rubric = DEFAULT_RUBRIC) {
  return {
    state: { answer: String(output).slice(0, MAX_OUTPUT) },
    questions: { quality: {
      type: 'score',
      instructions: '按下列从低到高的档位，评估这次最终产出对用户请求的完成质量。',
      criteria: boundedRubric(rubric),
    } },
  };
}

// `settings` is an async resolver so rubric/mode/threshold follow live config.
// `steer(agent, text)` performs the host-native steer; the caller owns building
// the framework UserMessage so this module stays free of DSH message types.
export function createSelfCheck({ evaluate, sessions, steer, settings, minConfidence = 0.4 } = {}) {
  if (typeof evaluate !== 'function') throw new Error('Self-check requires an evaluator');
  const steerOnce = createSteerOnce();
  const resolveSettings = async () => {
    let raw = {};
    try { raw = (typeof settings === 'function' ? await settings() : settings) ?? {}; } catch { raw = {}; }
    const mode = raw?.mode === 'steer' ? 'steer' : 'observe';
    const lowScoreThreshold = Number.isSafeInteger(raw?.lowScoreThreshold) && raw.lowScoreThreshold >= 0 ? raw.lowScoreThreshold : 1;
    // Quality-trend thresholds (unvalidated heuristics; see quality-trend.mjs).
    const trendMinConfidence = typeof raw?.trendMinConfidence === 'number' && Number.isFinite(raw.trendMinConfidence) && raw.trendMinConfidence >= 0 && raw.trendMinConfidence <= 1 ? raw.trendMinConfidence : 0.6;
    const trendRun = Number.isSafeInteger(raw?.trendRun) && raw.trendRun >= 2 ? raw.trendRun : 3;
    const trendSevereRun = Number.isSafeInteger(raw?.trendSevereRun) && raw.trendSevereRun > trendRun ? raw.trendSevereRun : Math.max(trendRun + 1, 5);
    return { mode, rubric: boundedRubric(raw?.rubric), lowScoreThreshold, trendMinConfidence, trendRun, trendSevereRun };
  };
  const record = (turn, outcome, detail = {}, trend) => {
    const id = turn?.agent?.session?.id;
    if (!sessions || typeof id !== 'string' || typeof sessions.recordCheck !== 'function') return;
    try { sessions.recordCheck(id, outcome, trend); } catch { /* telemetry is best effort */ }
    if (typeof sessions.log !== 'function') return;
    try { sessions.log(id, { kind: 'check', outcome, ...detail }); }
    catch { /* logging is best effort */ }
  };
  return {
    async review(turn) {
      const output = typeof turn?.output === 'string' ? turn.output.trim() : '';
      if (!output) return { evaluated: false, lowScore: false, steered: false };
      const id = turn?.agent?.session?.id;
      if (sessions && typeof id === 'string') {
        try { if (sessions.snapshot(id).enabled === false) return { evaluated: false, lowScore: false, steered: false }; }
        catch { return { evaluated: false, lowScore: false, steered: false }; }
      }
      // The request this turn answered, carried onto every log row so a reviewer
      // can tell which turn's output each self-check score belongs to.
      const subject = subjectOf(turn?.userText);
      const subjectDetail = subject ? { subject } : {};
      const { mode, rubric, lowScoreThreshold, trendMinConfidence, trendRun, trendSevereRun } = await resolveSettings();
      let answer;
      try {
        const result = await evaluate(scoreQuestion(output, rubric), { signal: turn.signal });
        answer = result?.answers?.quality;
      } catch (error) { record(turn, 'error', { ...subjectDetail, reason: typeof error?.reason === 'string' ? error.reason : 'unreachable' }); return { evaluated: false, lowScore: false, steered: false }; }
      if (!answer || answer.type !== 'score' || typeof answer.score !== 'number' || !Number.isFinite(answer.score)) {
        record(turn, 'error', { ...subjectDetail, reason: 'invalid-response' });
        return { evaluated: false, lowScore: false, steered: false };
      }
      // A low-confidence Score is a legitimate answer, not a failure: the score
      // stays usable and is recorded as ok/low. Confidence only gates the steer,
      // because only interrupting the user warrants the model being sure.
      const confidence = typeof answer.confidence === 'number' && Number.isFinite(answer.confidence) ? answer.confidence : undefined;
      const detail = confidence === undefined ? { ...subjectDetail } : { ...subjectDetail, confidence };
      const lowScore = answer.score <= lowScoreThreshold;
      // The trend run advances over every evaluated score; a high-confidence low
      // score is the only thing that grows it. Thresholds flow to session-state.
      const trend = { confident: lowScore && confidence !== undefined && confidence >= trendMinConfidence, trendRun, trendSevereRun };
      // A low score the model is not confident about (confidence present but below
      // the trend threshold) does not advance the quality-trend judgment. Flag it
      // so the decision log can mark it as low-signal noise instead of a real dip.
      if (lowScore && confidence !== undefined && !trend.confident) detail.lowConfidence = true;
      record(turn, lowScore ? 'low' : 'ok', { score: answer.score, ...detail }, trend);
      if (!lowScore) return { evaluated: true, lowScore: false, steered: false, score: answer.score };
      const confident = confidence !== undefined && confidence >= minConfidence;
      // The turn budget is consumed only on a successful steer (createSteerOnce),
      // so a transient host failure does not permanently suppress this turn.
      const steered = mode === 'steer' && confident && typeof steer === 'function' && turn?.agent
        ? steerOnce.attempt(turn, () => steer(turn.agent, STEER_TEXT))
        : false;
      return { evaluated: true, lowScore: true, steered, score: answer.score };
    },
  };
}
