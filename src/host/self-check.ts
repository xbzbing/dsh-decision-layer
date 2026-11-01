import { taskExcerpt } from './excerpt.js';
import { createSteerOnce } from './steer-once.js';
import { errorReason, isProbability } from './types.js';
import type { AgentLike, CheckSettings, EvaluateInput, Evaluator, SessionsFace } from './types.js';

const MAX_OUTPUT = 24 * 1024;

export const DEFAULT_RUBRIC: readonly string[] = Object.freeze([
  '明显答非所问，或存在严重遗漏 / 自相矛盾',
  '基本答到问题，但有可察觉的遗漏或不严谨',
  '完整、准确、无自相矛盾地回应了请求',
]);

const STEER_TEXT = '本回合自检得分偏低：请复核是否答到了用户的问题、有无遗漏或自相矛盾，并在需要时补完。';

function boundedRubric(rubric: unknown): readonly string[] {
  if (!Array.isArray(rubric)) return DEFAULT_RUBRIC;
  const levels = rubric.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()) && item.length <= 256).slice(0, 10);
  return levels.length >= 2 ? levels : DEFAULT_RUBRIC;
}

export function scoreQuestion(output: unknown, rubric: readonly string[] = DEFAULT_RUBRIC): EvaluateInput {
  return {
    state: { answer: String(output).slice(0, MAX_OUTPUT) },
    questions: { quality: {
      type: 'score',
      instructions: '按下列从低到高的档位，评估这次最终产出对用户请求的完成质量。',
      criteria: boundedRubric(rubric),
    } },
  };
}

// The confidence floor for interrupting the user with a supplemental prompt.
// Named rather than inlined because config-store's `checkSettings.minConfidence`
// and the config form both document this value; a bare literal in three places
// drifts silently on the next tuning pass.
export const DEFAULT_MIN_CONFIDENCE = 0.4;

export type CheckTurn = {
  agent?: AgentLike;
  turn?: number;
  signal?: AbortSignal;
  output?: unknown;
  userText?: unknown;
};

export type CheckResult = { evaluated: boolean; lowScore: boolean; steered: boolean; score?: number };

export type SelfCheckOptions = {
  evaluate?: Evaluator;
  sessions?: SessionsFace;
  steer?: (agent: AgentLike, text: string) => unknown;
  settings?: CheckSettings | (() => Promise<CheckSettings | undefined>);
  minConfidence?: number;
};

type Trend = { confident: boolean; trendRun: number; trendSevereRun: number };

// `settings` is an async resolver so rubric/mode/threshold follow live config.
// `steer(agent, text)` performs the host-native steer; the caller owns building
// the framework UserMessage so this module stays free of DSH message types.
export function createSelfCheck({ evaluate, sessions, steer, settings, minConfidence = DEFAULT_MIN_CONFIDENCE }: SelfCheckOptions = {}) {
  if (typeof evaluate !== 'function') throw new Error('Self-check requires an evaluator');
  const steerOnce = createSteerOnce();
  const resolveSettings = async () => {
    let raw: CheckSettings = {};
    try { raw = (typeof settings === 'function' ? await settings() : settings) ?? {}; } catch { raw = {}; }
    const mode = raw?.mode === 'steer' ? 'steer' : 'observe';
    const lowScoreThreshold = Number.isSafeInteger(raw?.lowScoreThreshold) && (raw.lowScoreThreshold as number) >= 0 ? raw.lowScoreThreshold as number : 1;
    // Confidence required before a low score actually opens the supplemental
    // prompt. The constructor argument is the fallback so a direct caller (and a
    // config without the field) keeps its own floor.
    const confidenceFloor = isProbability(raw?.minConfidence) ? raw.minConfidence : minConfidence;
    // Quality-trend thresholds (unvalidated heuristics; see quality-trend.ts).
    const trendMinConfidence = typeof raw?.trendMinConfidence === 'number' && Number.isFinite(raw.trendMinConfidence) && raw.trendMinConfidence >= 0 && raw.trendMinConfidence <= 1 ? raw.trendMinConfidence : 0.6;
    const trendRun = Number.isSafeInteger(raw?.trendRun) && (raw.trendRun as number) >= 2 ? raw.trendRun as number : 3;
    const trendSevereRun = Number.isSafeInteger(raw?.trendSevereRun) && (raw.trendSevereRun as number) > trendRun ? raw.trendSevereRun as number : Math.max(trendRun + 1, 5);
    return { mode, rubric: boundedRubric(raw?.rubric), lowScoreThreshold, minConfidence: confidenceFloor, trendMinConfidence, trendRun, trendSevereRun };
  };
  const record = (turn: CheckTurn | undefined, outcome: string, detail: Record<string, unknown> = {}, trend?: Trend): void => {
    const id = turn?.agent?.session?.id;
    if (!sessions || typeof id !== 'string' || typeof sessions.recordCheck !== 'function') return;
    try { sessions.recordCheck(id, outcome, trend); } catch { /* telemetry is best effort */ }
    if (typeof sessions.log !== 'function') return;
    try { sessions.log(id, { kind: 'check', outcome, ...detail }); }
    catch { /* logging is best effort */ }
  };
  return {
    async review(turn: CheckTurn | undefined): Promise<CheckResult> {
      const output = typeof turn?.output === 'string' ? turn.output.trim() : '';
      if (!output) return { evaluated: false, lowScore: false, steered: false };
      const id = turn?.agent?.session?.id;
      if (sessions && typeof id === 'string') {
        try { if (sessions.snapshot(id).enabled === false) return { evaluated: false, lowScore: false, steered: false }; }
        catch { return { evaluated: false, lowScore: false, steered: false }; }
      }
      // The request this turn answered, carried onto every log row so a reviewer
      // can tell which turn's output each self-check score belongs to. Same
      // masked, bounded excerpt the other decision rows use.
      const task = taskExcerpt(turn?.userText);
      const taskDetail: { task?: string; turn?: number } = task ? { task } : {};
      if (Number.isSafeInteger(turn?.turn) && (turn?.turn as number) >= 0) taskDetail.turn = turn?.turn;
      const { mode, rubric, lowScoreThreshold, minConfidence: confidenceFloor, trendMinConfidence, trendRun, trendSevereRun } = await resolveSettings();
      let answer;
      try {
        const result = await evaluate(scoreQuestion(output, rubric), { signal: turn?.signal });
        answer = result?.answers?.quality;
      } catch (error) { record(turn, 'error', { ...taskDetail, reason: errorReason(error) }); return { evaluated: false, lowScore: false, steered: false }; }
      if (!answer || answer.type !== 'score' || typeof answer.score !== 'number' || !Number.isFinite(answer.score)) {
        record(turn, 'error', { ...taskDetail, reason: 'invalid-response' });
        return { evaluated: false, lowScore: false, steered: false };
      }
      // A low-confidence Score is a legitimate answer, not a failure: the score
      // stays usable and is recorded as ok/low. Confidence only gates the steer,
      // because only interrupting the user warrants the model being sure.
      const confidence = typeof answer.confidence === 'number' && Number.isFinite(answer.confidence) ? answer.confidence : undefined;
      const detail: { task?: string; turn?: number; confidence?: number; lowConfidence?: boolean } = confidence === undefined ? { ...taskDetail } : { ...taskDetail, confidence };
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
      const confident = confidence !== undefined && confidence >= confidenceFloor;
      // The turn budget is consumed only on a successful steer (createSteerOnce),
      // so a transient host failure does not permanently suppress this turn.
      const steered = mode === 'steer' && confident && typeof steer === 'function' && turn?.agent
        ? steerOnce.attempt(turn, () => steer(turn.agent as AgentLike, STEER_TEXT))
        : false;
      return { evaluated: true, lowScore: true, steered, score: answer.score };
    },
  };
}
