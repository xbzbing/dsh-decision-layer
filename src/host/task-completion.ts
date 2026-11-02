import { taskExcerpt } from './excerpt.js';
import { createSteerOnce } from './steer-once.js';
import { errorReason, isObject, isProbability } from './types.js';
import type { AgentLike, CompleteSettings, DecisionContext, EvaluateInput, Evaluator, SessionsFace } from './types.js';

const MAX_STATE = 8 * 1024;
const MAX_CONDITION = 512;
const MAX_CONDITIONS = 20;
const MAX_EVIDENCE = 40;

const STEER_TEXT = '本回合任务完成核对发现有明确交付条件尚未满足：请对照用户列出的条件逐项复核，补完未完成的部分。';

// Deterministic extraction of the explicit deliverable conditions a user listed.
// Only structured forms are recognized — numbered lists, bullet lists, and a
// single line of comma/、-separated multiple commands. Implicit or inferred
// expectations are deliberately out of scope for the first version.
export function extractConditions(userText: unknown): string[] {
  const text = typeof userText === 'string' ? userText : '';
  if (!text.trim()) return [];
  const conditions: string[] = [];
  const push = (value: string): void => {
    const item = value.trim().replace(/\s+/g, ' ').slice(0, MAX_CONDITION);
    if (item && !conditions.includes(item)) conditions.push(item);
  };
  const lines = text.split(/\r?\n/);
  let matchedStructured = false;
  for (const line of lines) {
    // Numbered: `1. `, `1) `, `1、`, `（1）`, `(1)`; or bullets: `- `, `* `, `• `.
    const numbered = line.match(/^\s*(?:[（(]?\d+[)）.、]|\d+\s*[.)、])\s+(.*)$/)?.[1];
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/)?.[1];
    if (numbered?.trim()) { push(numbered); matchedStructured = true; }
    else if (bullet?.trim()) { push(bullet); matchedStructured = true; }
  }
  // Fallback: a single instruction line joining multiple commands. A 、-joined
  // list needs two items; a comma-joined one needs three, because two clauses of
  // ordinary prose ("取消前面任务，只做只读评审") are not a delivery checklist and
  // would otherwise become conditions the user never listed.
  if (!matchedStructured) {
    const compact = text.trim();
    if (!/[\r\n]/.test(compact)) {
      const parts = compact.split(/[、，,]/).map(part => part.trim()).filter(Boolean);
      const floor = compact.includes('、') ? 2 : 3;
      if (parts.length >= floor) for (const part of parts) push(part);
    }
  }
  return conditions.slice(0, MAX_CONDITIONS);
}

// Build one choice question per explicit condition. The state carries the
// conditions, the turn's tool evidence, and the final reply. Tool evidence is
// primary; the reply's own claims are explicitly NOT treated as proof, so the
// model can answer insufficient_evidence when only the reply asserts completion.
export function completionQuestions(conditions: unknown, evidence: unknown, answer: unknown, context?: DecisionContext): EvaluateInput {
  const items = Array.isArray(conditions) ? (conditions as string[]).slice(0, MAX_CONDITIONS) : [];
  const tools = Array.isArray(evidence)
    ? evidence.filter(item => isObject(item) && typeof item.tool === 'string').slice(0, MAX_EVIDENCE)
      .map(item => {
        const source = item as Record<string, unknown>;
        const entry: { tool: string; outcome: 'ok' | 'error'; command?: string; path?: string; result?: string } = {
          tool: (source.tool as string).slice(0, 128),
          outcome: source.outcome === 'error' ? 'error' as const : 'ok' as const,
        };
        // What was run or found, so a condition can be tied to an action instead of
        // to a bare tool name. `result` is only a bounded shell excerpt.
        for (const key of ['command', 'path', 'result'] as const) {
          const value = source[key];
          if (typeof value === 'string' && value.trim()) entry[key] = value.slice(0, 256);
        }
        return entry;
      })
    : [];
  const state = {
    ...(context?.request ? { request: context.request } : {}),
    ...(context?.background?.length ? { background: context.background } : {}),
    conditions: items.map((text, index) => ({ id: `c${index}`, text })),
    toolEvidence: tools,
    finalReply: String(answer ?? '').slice(0, MAX_STATE),
    note: '工具证据（toolEvidence）是判定依据；finalReply 自称完成不作为证据，background 只是背景而不是本轮要求。缺少证据时选 insufficient_evidence。',
  };
  const questions = Object.fromEntries(items.map((text, index) => [`c${index}`, {
    type: 'choice' as const,
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

// The confidence floor for interrupting the user with a supplemental prompt.
// Named rather than inlined because config-store's `completeSettings.minConfidence`
// and the config form both document this value; a bare literal in three places
// drifts silently on the next tuning pass.
export const DEFAULT_MIN_CONFIDENCE = 0.4;

export type CompletionTurn = {
  agent?: AgentLike;
  turn?: number;
  signal?: AbortSignal;
  output?: unknown;
  userText?: unknown;
  evidence?: unknown;
  context?: DecisionContext;
};

export type CompletionResult = { evaluated: boolean; steered: boolean; satisfied?: number; unsatisfied?: number; insufficient?: number };

export type TaskCompletionOptions = {
  evaluate?: Evaluator;
  sessions?: SessionsFace;
  steer?: (agent: AgentLike, text: string) => unknown;
  settings?: CompleteSettings | (() => Promise<CompleteSettings | undefined>);
  minConfidence?: number;
};

// Orchestrates one task-completion pass at turn end. Read-only by default: it
// records a per-condition verdict and only steers when explicitly configured,
// the model is confident, and at least one condition is not satisfied. A steer
// opens a supplemental step; it never rewrites the already-committed reply.
export function createTaskCompletion({ evaluate, sessions, steer, settings, minConfidence = DEFAULT_MIN_CONFIDENCE }: TaskCompletionOptions = {}) {
  if (typeof evaluate !== 'function') throw new Error('Task completion requires an evaluator');
  const steerOnce = createSteerOnce();
  const resolveSettings = async () => {
    let raw: CompleteSettings = {};
    try { raw = (typeof settings === 'function' ? await settings() : settings) ?? {}; } catch { raw = {}; }
    const mode = raw?.mode === 'steer' ? 'steer' : 'observe';
    const minConditions = Number.isSafeInteger(raw?.minConditions) && (raw.minConditions as number) >= 2 ? raw.minConditions as number : 2;
    // Confidence required before an unmet condition actually opens the
    // supplemental step; the constructor argument is the fallback when the
    // config does not set it.
    const confidenceFloor = isProbability(raw?.minConfidence) ? raw.minConfidence : minConfidence;
    return { mode, minConditions, minConfidence: confidenceFloor };
  };
  const record = (turn: CompletionTurn | undefined, outcome: string, detail: Record<string, unknown> = {}): void => {
    const id = turn?.agent?.session?.id;
    if (!sessions || typeof id !== 'string' || typeof sessions.recordComplete !== 'function') return;
    try { sessions.recordComplete(id, outcome, detail); } catch { /* telemetry is best effort */ }
    if (typeof sessions.log !== 'function') return;
    try { sessions.log(id, { kind: 'complete', outcome, ...detail }); }
    catch { /* logging is best effort */ }
  };
  const skip: CompletionResult = { evaluated: false, steered: false };
  return {
    async review(turn: CompletionTurn | undefined): Promise<CompletionResult> {
      const output = typeof turn?.output === 'string' ? turn.output.trim() : '';
      // The request these conditions came from, so a completion row says which
      // turn it checked. Same masked, bounded excerpt as the other rows.
      const task = taskExcerpt(turn?.context?.request ?? turn?.userText);
      const taskDetail: { task?: string; turn?: number } = task ? { task } : {};
      if (Number.isSafeInteger(turn?.turn) && (turn?.turn as number) >= 0) taskDetail.turn = turn?.turn;
      const { mode, minConditions, minConfidence: confidenceFloor } = await resolveSettings();
      const conditions = extractConditions(turn?.userText);
      if (conditions.length < minConditions) return { ...skip };
      const evidence = Array.isArray(turn?.evidence) ? turn.evidence : [];
      if (evidence.length === 0) return { ...skip };
      const id = turn?.agent?.session?.id;
      if (sessions && typeof id === 'string') {
        try { if (sessions.snapshot(id).enabled === false) return { ...skip }; }
        catch { return { ...skip }; }
      }
      let answers: Record<string, unknown> | undefined;
      try {
        const result = await evaluate(completionQuestions(conditions, evidence, output, turn?.context), { signal: turn?.signal });
        answers = isObject(result?.answers) ? result.answers : undefined;
      } catch (error) {
        record(turn, 'error', { ...taskDetail, reason: errorReason(error) });
        return { ...skip };
      }
      if (!answers) { record(turn, 'error', { ...taskDetail, reason: 'invalid-response' }); return { ...skip }; }
      let satisfied = 0, unsatisfied = 0, insufficient = 0;
      // Track the minimum confidence over the `unsatisfied` verdicts only: a steer
      // fires on a confident unsatisfied finding, so a low-confidence satisfied /
      // insufficient verdict on another condition must not suppress it.
      let unsatisfiedMinConf = 1;
      for (let index = 0; index < conditions.length; index++) {
        const answer = answers[`c${index}`];
        if (!isObject(answer) || answer.type !== 'choice' || typeof answer.choice !== 'string') {
          insufficient++; continue;
        }
        if (answer.choice === 'satisfied') satisfied++;
        else if (answer.choice === 'unsatisfied') {
          unsatisfied++;
          if (isProbability(answer.confidence)) unsatisfiedMinConf = Math.min(unsatisfiedMinConf, answer.confidence);
        }
        else insufficient++;
      }
      const outcome = unsatisfied > 0 ? 'unsatisfied' : 'ok';
      const detail: { task?: string; turn?: number; conditions: number; satisfied: number; unsatisfied: number; insufficient: number; steered?: boolean } = { ...taskDetail, conditions: conditions.length, satisfied, unsatisfied, insufficient };
      // A steer is only for a confident finding that a listed condition is not met.
      const confident = unsatisfied > 0 && unsatisfiedMinConf >= confidenceFloor;
      // The turn budget is consumed only on a successful steer (createSteerOnce),
      // so a transient host failure does not permanently suppress this turn.
      const steered = mode === 'steer' && confident && typeof steer === 'function' && turn?.agent
        ? steerOnce.attempt(turn, () => steer(turn.agent as AgentLike, STEER_TEXT))
        : false;
      if (steered) detail.steered = true;
      record(turn, outcome, detail);
      return { evaluated: true, steered, satisfied, unsatisfied, insufficient };
    },
  };
}
