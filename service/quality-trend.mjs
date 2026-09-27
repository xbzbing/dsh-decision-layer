// Pure helpers for the output-quality trend alarm. A run counts consecutive
// high-confidence low self-check scores; the run length maps to a severity that
// the trigger icon renders (normal → warn → severe). All thresholds are
// unvalidated heuristics, tuned later on real decision logs.

export const DEFAULT_TREND_MIN_CONFIDENCE = 0.6;
export const DEFAULT_TREND_RUN = 3;
export const DEFAULT_TREND_SEVERE_RUN = 5;

// Advance the run over ONE evaluated self-check:
//   - a good score (not low) resets the run to 0;
//   - a high-confidence low score increments it;
//   - a low-confidence low score is skipped (neither resets nor increments);
//   - an unevaluated/absent verdict must not call this at all.
// `sample` is { lowScore: boolean, confident: boolean }.
export function advanceRun(run, sample) {
  const current = Number.isSafeInteger(run) && run >= 0 ? run : 0;
  if (!sample || sample.lowScore !== true) return 0;
  if (sample.confident === true) return current + 1;
  return current;
}

// Map a run length to a severity, given the warn/severe thresholds.
export function severityOf(run, { trendRun = DEFAULT_TREND_RUN, trendSevereRun = DEFAULT_TREND_SEVERE_RUN } = {}) {
  const value = Number.isSafeInteger(run) && run >= 0 ? run : 0;
  if (value >= trendSevereRun) return 'severe';
  if (value >= trendRun) return 'warn';
  return 'normal';
}
