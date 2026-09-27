import { createReadableStream } from './log-read.mjs';

// Offline analysis over the persisted decision JSONL logs. Pure aggregation:
// given a stream of records (decision events + annotation events) for one
// session, fold annotations onto decisions by id (latest wins) and build a
// process-metrics profile plus a quality-trend threshold backtest.
//
// Reading is separated (log-read.mjs) so this module stays pure and testable
// without touching the filesystem.

const DECISION_KINDS = new Set(['gate', 'check', 'narrow', 'complete']);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// Reduce one session's records into decisions (with the latest annotation
// attached) and per-kind aggregates. `records` is any iterable of parsed rows.
export function foldSession(records) {
  const decisions = new Map();          // id → decision record
  const annotations = new Map();        // target id → latest annotation
  for (const record of records) {
    if (!isObject(record)) continue;
    if (record.kind === 'annotation') {
      const target = typeof record.target === 'string' ? record.target : undefined;
      if (!target) continue;
      const prev = annotations.get(target);
      if (!prev || (Number.isFinite(record.at) && record.at >= (prev.at ?? 0))) {
        annotations.set(target, { rating: record.rating, at: Number.isFinite(record.at) ? record.at : 0 });
      }
      continue;
    }
    if (DECISION_KINDS.has(record.kind) && typeof record.id === 'string') {
      decisions.set(record.id, record);
    }
  }
  return { decisions, annotations };
}

// A confidence bucket label for the [0,1] range, coarse enough to be useful.
function confidenceBucket(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  if (value < 0.4) return 'lt40';
  if (value < 0.6) return 'lt60';
  if (value < 0.8) return 'lt80';
  return 'gte80';
}

function emptyProfile() {
  return {
    gate: { attempts: 0, allow: 0, ask: 0, deny: 0, error: 0 },
    check: { attempts: 0, ok: 0, low: 0, error: 0, scoreSum: 0, scoreCount: 0, confidence: { lt40: 0, lt60: 0, lt80: 0, gte80: 0 } },
    narrow: { attempts: 0, applied: 0, error: 0, droppedSum: 0, tooManyCandidates: 0 },
    complete: { attempts: 0, satisfied: 0, unsatisfied: 0, insufficient: 0, error: 0, steered: 0 },
  };
}

// Build the process-metrics profile from the folded decisions. Clean denominators:
// each `attempts` counts real evaluations of that kind; averages (e.g. mean
// dropped) are reported as-is, never mislabeled as percentages.
export function buildProfile(decisions) {
  const profile = emptyProfile();
  for (const record of decisions.values()) {
    const kind = record.kind;
    const bucket = profile[kind];
    if (!bucket) continue;
    bucket.attempts++;
    if (kind === 'gate') {
      if (record.outcome === 'error') bucket.error++;
      else if (['allow', 'ask', 'deny'].includes(record.outcome)) bucket[record.outcome]++;
    } else if (kind === 'check') {
      if (record.outcome === 'error') bucket.error++;
      else if (record.outcome === 'low') bucket.low++;
      else bucket.ok++;
      if (typeof record.score === 'number' && Number.isFinite(record.score)) { bucket.scoreSum += record.score; bucket.scoreCount++; }
      const cb = confidenceBucket(record.confidence);
      if (cb) bucket.confidence[cb]++;
    } else if (kind === 'narrow') {
      if (record.outcome === 'error') bucket.error++;
      else if (record.outcome === 'applied') bucket.applied++;
      if (Number.isSafeInteger(record.dropped) && record.dropped > 0) bucket.droppedSum += record.dropped;
      if (record.reason === 'too-many-candidates') bucket.tooManyCandidates++;
    } else if (kind === 'complete') {
      if (record.outcome === 'error') bucket.error++;
      if (Number.isSafeInteger(record.satisfied)) bucket.satisfied += record.satisfied;
      if (Number.isSafeInteger(record.unsatisfied)) bucket.unsatisfied += record.unsatisfied;
      if (Number.isSafeInteger(record.insufficient)) bucket.insufficient += record.insufficient;
      if (record.steered === true) bucket.steered++;
    }
  }
  return profile;
}

// Replay the quality-trend thresholds over this session's check records in time
// order: how many times would the alarm have fired at warn / severe? Uses the
// same run semantics as quality-trend.mjs (good resets, high-confidence low
// grows, low-confidence low and non-low are skipped for the run — but a good
// score still resets). This is a calibration aid, not a live signal.
export function backtestTrend(checkRecords, { trendMinConfidence = 0.6, trendRun = 3, trendSevereRun = 5, lowScoreThreshold = 1 } = {}) {
  const ordered = [...checkRecords].filter(r => isObject(r) && r.kind === 'check').sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
  let run = 0, warnHits = 0, severeHits = 0, maxRun = 0;
  for (const record of ordered) {
    if (record.outcome === 'error') continue; // unevaluated: skip
    const isLow = record.outcome === 'low' || (typeof record.score === 'number' && record.score <= lowScoreThreshold);
    if (!isLow) { run = 0; continue; }
    const confident = typeof record.confidence === 'number' && Number.isFinite(record.confidence) && record.confidence >= trendMinConfidence;
    if (!confident) continue; // low-confidence low: skip, run unchanged
    run++;
    maxRun = Math.max(maxRun, run);
    if (run === trendSevereRun) severeHits++;
    else if (run === trendRun) warnHits++;
  }
  return { warnHits, severeHits, maxRun };
}

// Attach annotation summary: how many decisions carry a good/bad/unsure rating.
// Also returns a per-decision ratings map (id → rating) so a UI can show the
// persisted annotation state on each decision, whichever surface renders it.
export function annotationSummary(decisions, annotations) {
  const summary = { rated: 0, good: 0, bad: 0, unsure: 0 };
  const ratings = Object.create(null);
  for (const [id] of decisions) {
    const annotation = annotations.get(id);
    if (!annotation || typeof annotation.rating !== 'string') continue;
    summary.rated++;
    if (annotation.rating === 'good') summary.good++;
    else if (annotation.rating === 'bad') summary.bad++;
    else if (annotation.rating === 'unsure') summary.unsure++;
    ratings[id] = annotation.rating;
  }
  return { summary, ratings };
}

// One-call analysis over an iterable of records for a single session.
export function analyzeSession(records, trendConfig) {
  const { decisions, annotations } = foldSession(records);
  const annotation = annotationSummary(decisions, annotations);
  return {
    totalDecisions: decisions.size,
    profile: buildProfile(decisions),
    trendBacktest: backtestTrend([...decisions.values()], trendConfig),
    annotations: annotation.summary,
    ratings: annotation.ratings,
  };
}

// Read the persisted logs for one session id and analyze them. Streams files so
// a large corpus is never fully buffered; only rows whose sessionId matches are
// kept. `readStream` is injected for tests; production reads the logs dir.
export async function analyzeSessionLogs(sessionId, { dir, port, trendConfig, readStream = createReadableStream } = {}) {
  if (typeof sessionId !== 'string' || !sessionId.trim()) throw new Error('Invalid session id');
  const records = [];
  for await (const record of readStream({ dir, port })) {
    if (!isObject(record)) continue;
    if (record.sessionId === sessionId) records.push(record);
  }
  return analyzeSession(records, trendConfig);
}
