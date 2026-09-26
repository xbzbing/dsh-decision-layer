const MAX_OUTPUT = 24 * 1024;

export const DEFAULT_RUBRIC = Object.freeze([
  '明显答非所问，或存在严重遗漏 / 自相矛盾',
  '基本答到问题，但有可察觉的遗漏或不严谨',
  '完整、准确、无自相矛盾地回应了请求',
]);

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

export function createSelfCheck({ evaluate, sessions, steer, rubric = DEFAULT_RUBRIC, mode = 'observe', lowScoreThreshold = 1, minConfidence = 0.6 } = {}) {
  if (typeof evaluate !== 'function') throw new Error('Self-check requires an evaluator');
  const steeredTurns = new Set();
  const steerKey = turn => {
    const id = turn?.agent?.session?.id;
    return typeof id === 'string' && Number.isInteger(turn?.turn) ? `${id}:${turn.turn}` : undefined;
  };
  const resolveRubric = async () => {
    if (typeof rubric !== 'function') return rubric;
    try { return (await rubric()) ?? DEFAULT_RUBRIC; } catch { return DEFAULT_RUBRIC; }
  };
  const record = (turn, outcome) => {
    const id = turn?.agent?.session?.id;
    if (!sessions || typeof id !== 'string' || typeof sessions.recordCheck !== 'function') return;
    try { sessions.recordCheck(id, outcome); } catch { /* telemetry is best effort */ }
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
      let answer;
      try {
        const result = await evaluate(scoreQuestion(output, await resolveRubric()), { signal: turn.signal });
        answer = result?.answers?.quality;
      } catch { record(turn, 'error'); return { evaluated: false, lowScore: false, steered: false }; }
      if (!answer || answer.type !== 'score' || !Number.isSafeInteger(answer.score) ||
        typeof answer.confidence !== 'number' || answer.confidence < minConfidence) {
        record(turn, 'error');
        return { evaluated: false, lowScore: false, steered: false };
      }
      const lowScore = answer.score <= lowScoreThreshold;
      record(turn, lowScore ? 'low' : 'ok');
      if (!lowScore) return { evaluated: true, lowScore: false, steered: false, score: answer.score };
      if (mode === 'steer' && typeof steer === 'function') {
        const key = steerKey(turn);
        if (key !== undefined && !steeredTurns.has(key)) {
          steeredTurns.add(key);
          if (steeredTurns.size > 4096) steeredTurns.delete(steeredTurns.values().next().value);
          steer({ role: 'user', content: '本回合自检得分偏低：请复核是否答到了用户的问题、有无遗漏或自相矛盾，并在需要时补完。' });
          return { evaluated: true, lowScore: true, steered: true, score: answer.score };
        }
      }
      return { evaluated: true, lowScore: true, steered: false, score: answer.score };
    },
  };
}
