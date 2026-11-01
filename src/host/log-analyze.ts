import { createReadableStream } from './log-read.js';
import { advanceRun, severityOf } from './quality-trend.js';
import { narrowApplied } from './narrowing.js';
import { isObject } from './types.js';
import type { LogRow, SessionSeed, TrendConfig } from './types.js';

// Offline analysis over the persisted decision JSONL logs. Pure aggregation:
// given a stream of records (decision events + annotation events) for one
// session, fold annotations onto decisions by id (latest wins) and build a
// process-metrics profile plus a quality-trend threshold backtest.
//
// Reading is separated (log-read.ts) so this module stays pure and testable
// without touching the filesystem.

export type PersistedRecord = Record<string, unknown>;
export type Annotation = { rating?: unknown; at: number };
export type TrendBacktest = { warnHits: number; severeHits: number; maxRun: number };

const DECISION_KINDS = new Set<string>(['gate', 'check', 'narrow', 'complete']);

const atOf = (record: PersistedRecord): number => {
  const value = record.at;
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
};

// Reduce one session's records into decisions (with the latest annotation
// attached) and per-kind aggregates. `records` is any iterable of parsed rows.
export function foldSession(records: Iterable<unknown>): { decisions: Map<string, PersistedRecord>; annotations: Map<string, Annotation> } {
  const decisions = new Map<string, PersistedRecord>(); // id → decision record
  const annotations = new Map<string, Annotation>(); // target id → latest annotation
  for (const record of records) {
    if (!isObject(record)) continue;
    if (record.kind === 'annotation') {
      const target = typeof record.target === 'string' ? record.target : undefined;
      if (!target) continue;
      const prev = annotations.get(target);
      if (!prev || (Number.isFinite(record.at) && (record.at as number) >= (prev.at ?? 0))) {
        annotations.set(target, { rating: record.rating, at: Number.isFinite(record.at) ? record.at as number : 0 });
      }
      continue;
    }
    if (DECISION_KINDS.has(record.kind as string) && typeof record.id === 'string') {
      decisions.set(record.id, record);
    }
  }
  return { decisions, annotations };
}

// A confidence bucket label for the [0,1] range, coarse enough to be useful.
function confidenceBucket(value: unknown): 'lt40' | 'lt60' | 'lt80' | 'gte80' | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  if (value < 0.4) return 'lt40';
  if (value < 0.6) return 'lt60';
  if (value < 0.8) return 'lt80';
  return 'gte80';
}

export type Profile = {
  gate: { attempts: number; allow: number; ask: number; deny: number; error: number };
  check: { attempts: number; ok: number; low: number; error: number; scoreSum: number; scoreCount: number; confidence: { lt40: number; lt60: number; lt80: number; gte80: number } };
  narrow: { attempts: number; applied: number; error: number; droppedSum: number; tooManyCandidates: number };
  complete: { attempts: number; satisfied: number; unsatisfied: number; insufficient: number; error: number; steered: number };
};

function emptyProfile(): Profile {
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
export function buildProfile(decisions: ReadonlyMap<string, PersistedRecord> | Iterable<PersistedRecord>): Profile {
  const profile = emptyProfile();
  const rows = decisions instanceof Map ? [...decisions.values()] : [...decisions];
  for (const record of rows) {
    const kind = record.kind;
    switch (kind) {
      case 'gate': {
        const bucket = profile.gate;
        bucket.attempts++;
        if (record.outcome === 'error') bucket.error++;
        else if (record.outcome === 'allow') bucket.allow++;
        else if (record.outcome === 'ask') bucket.ask++;
        else if (record.outcome === 'deny') bucket.deny++;
        break;
      }
      case 'check': {
        const bucket = profile.check;
        bucket.attempts++;
        if (record.outcome === 'error') bucket.error++;
        else if (record.outcome === 'low') bucket.low++;
        else bucket.ok++;
        if (typeof record.score === 'number' && Number.isFinite(record.score)) { bucket.scoreSum += record.score; bucket.scoreCount++; }
        const cb = confidenceBucket(record.confidence);
        if (cb) bucket.confidence[cb]++;
        break;
      }
      case 'narrow': {
        const bucket = profile.narrow;
        bucket.attempts++;
        if (record.outcome === 'error') bucket.error++;
        else if (narrowApplied(record)) bucket.applied++;
        if (Number.isSafeInteger(record.dropped) && (record.dropped as number) > 0) bucket.droppedSum += record.dropped as number;
        if (record.reason === 'too-many-candidates') bucket.tooManyCandidates++;
        break;
      }
      case 'complete': {
        const bucket = profile.complete;
        bucket.attempts++;
        if (record.outcome === 'error') bucket.error++;
        if (Number.isSafeInteger(record.satisfied)) bucket.satisfied += record.satisfied as number;
        if (Number.isSafeInteger(record.unsatisfied)) bucket.unsatisfied += record.unsatisfied as number;
        if (Number.isSafeInteger(record.insufficient)) bucket.insufficient += record.insufficient as number;
        if (record.steered === true) bucket.steered++;
        break;
      }
      default: break;
    }
  }
  return profile;
}

// Replay the quality-trend thresholds over this session's check records in time
// order: how many times would the alarm have fired at warn / severe? Uses the
// same run semantics as quality-trend.ts (good resets, high-confidence low
// grows, low-confidence low and non-low are skipped for the run — but a good
// score still resets). This is a calibration aid, not a live signal.
export function backtestTrend(checkRecords: Iterable<unknown>, { trendMinConfidence = 0.6, trendRun = 3, trendSevereRun = 5, lowScoreThreshold = 1 }: TrendConfig = {}): TrendBacktest {
  const ordered = [...checkRecords].filter((record): record is PersistedRecord => isObject(record) && record.kind === 'check').sort((a, b) => atOf(a) - atOf(b));
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
export function annotationSummary(decisions: ReadonlyMap<string, PersistedRecord>, annotations: ReadonlyMap<string, Annotation>): {
  summary: { rated: number; good: number; bad: number; unsure: number };
  ratings: Record<string, unknown>;
} {
  const summary = { rated: 0, good: 0, bad: 0, unsure: 0 };
  const ratings: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
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
export function analyzeSession(records: Iterable<unknown>, trendConfig?: TrendConfig) {
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

export type ReadStream = (options: { dir?: string; port?: number }) => AsyncIterable<unknown>;

// Read the persisted logs for one session id and analyze them. Streams files so
// a large corpus is never fully buffered; only rows whose sessionId matches are
// kept. `readStream` is injected for tests; production reads the logs dir.
export async function analyzeSessionLogs(sessionId: unknown, { dir, port, trendConfig, readStream = createReadableStream }: {
  dir?: string;
  port?: number;
  trendConfig?: TrendConfig;
  readStream?: ReadStream;
} = {}) {
  if (typeof sessionId !== 'string' || !sessionId.trim()) throw new Error('Invalid session id');
  const records: PersistedRecord[] = [];
  for await (const record of readStream({ dir, port })) {
    if (!isObject(record)) continue;
    if (record.sessionId === sessionId) records.push(record);
  }
  return analyzeSession(records, trendConfig);
}

// Reconstruct a live session-state seed (the counter shape session-state keeps,
// plus the recent decision log) from this session's folded decisions. Used to
// bridge a restart for a session that has persisted JSONL history but no state
// snapshot yet, so its panel resumes from its real totals instead of from zero.
//
// Faithful for every counter because each feature logs exactly one record per
// record*() call with the same outcome — with one documented exception:
// gate.actual (observed tool outcomes) is never logged, so it starts at zero and
// resumes as new tool results arrive. The check trend run/severity is replayed
// with the same advanceRun/severityOf semantics the live path uses.
export function buildSeed(decisions: ReadonlyMap<string, PersistedRecord>, { maxLog = 50, trendConfig = {} }: { maxLog?: number; trendConfig?: TrendConfig } = {}): SessionSeed {
  const ordered = [...decisions.values()].filter(record => DECISION_KINDS.has(record.kind as string)).sort((a, b) => atOf(a) - atOf(b));
  const seed: SessionSeed = {
    attempts: 0, failures: 0,
    gate: { attempts: 0, failures: 0, ask: 0, deny: 0, allow: 0, actual: { allow: 0, deny: 0, error: 0 } },
    check: { attempts: 0, failures: 0, low: 0, run: 0, severity: 'normal' },
    narrow: { attempts: 0, failures: 0, applied: 0, dropped: 0 },
    complete: { attempts: 0, failures: 0, unsatisfied: 0, satisfied: 0, insufficient: 0, steered: 0 },
    log: [],
  };
  const minConfidence = typeof trendConfig.trendMinConfidence === 'number' ? trendConfig.trendMinConfidence : 0.6;
  const thresholds = { trendRun: trendConfig.trendRun ?? 3, trendSevereRun: trendConfig.trendSevereRun ?? 5 };
  let run = 0;
  for (const record of ordered) {
    seed.attempts++;
    const isError = record.outcome === 'error';
    if (isError) seed.failures++;
    if (record.kind === 'gate') {
      seed.gate.attempts++;
      if (isError) seed.gate.failures++;
      if (record.outcome === 'allow') seed.gate.allow++;
      else if (record.outcome === 'ask') seed.gate.ask++;
      else if (record.outcome === 'deny') seed.gate.deny++;
    } else if (record.kind === 'check') {
      seed.check.attempts++;
      if (isError) seed.check.failures++;
      if (!isError) {
        if (record.outcome === 'low') seed.check.low++;
        // Replay the trend run exactly as recordCheck does: lowScore keys off the
        // 'low' outcome, confident off the logged confidence vs the threshold.
        const confident = typeof record.confidence === 'number' && Number.isFinite(record.confidence) && record.confidence >= minConfidence;
        run = advanceRun(run, { lowScore: record.outcome === 'low', confident });
      }
    } else if (record.kind === 'narrow') {
      seed.narrow.attempts++;
      if (isError) seed.narrow.failures++;
      if (record.outcome === 'applied') {
        if (narrowApplied(record)) seed.narrow.applied++;
        if (Number.isSafeInteger(record.dropped) && (record.dropped as number) > 0) seed.narrow.dropped += record.dropped as number;
      }
    } else if (record.kind === 'complete') {
      seed.complete.attempts++;
      if (isError) seed.complete.failures++;
      if (!isError) {
        if (Number.isSafeInteger(record.satisfied)) seed.complete.satisfied += record.satisfied as number;
        if (Number.isSafeInteger(record.unsatisfied)) seed.complete.unsatisfied += record.unsatisfied as number;
        if (Number.isSafeInteger(record.insufficient)) seed.complete.insufficient += record.insufficient as number;
        if (record.steered === true) seed.complete.steered++;
      }
    }
  }
  seed.check.run = run;
  seed.check.severity = severityOf(run, thresholds);
  // The recent-log list: the newest decisions, as plain records (drop sessionId,
  // which the live log does not carry). Already in the panel-record shape.
  seed.log = ordered.slice(-maxLog).map(record => {
    const rest: LogRow = { ...record } as LogRow;
    delete (rest as PersistedRecord).sessionId;
    return rest;
  });
  return seed;
}

// Read one session's persisted JSONL and reconstruct its live state seed, or
// undefined when it has no decision history. Streams files like analyzeSessionLogs.
export async function reconstructSessionSeed(sessionId: unknown, { dir, port, trendConfig, maxLog, readStream = createReadableStream }: {
  dir?: string;
  port?: number;
  trendConfig?: TrendConfig;
  maxLog?: number;
  readStream?: ReadStream;
} = {}): Promise<SessionSeed | undefined> {
  if (typeof sessionId !== 'string' || !sessionId.trim()) return undefined;
  const records: PersistedRecord[] = [];
  for await (const record of readStream({ dir, port })) {
    if (!isObject(record)) continue;
    if (record.sessionId === sessionId) records.push(record);
  }
  if (records.length === 0) return undefined;
  const { decisions } = foldSession(records);
  if (decisions.size === 0) return undefined;
  return buildSeed(decisions, { maxLog, trendConfig });
}

// Read one session's persisted decision rows and return a single newest-first
// page. Backs the analysis tab's full decision log (the dock panel still shows
// only the in-memory recent rows). Decisions are folded by id (latest wins) so a
// re-logged id is not double-counted. Rows carry only the panel fields, including
// the gate's redacted, length-bounded command/path. The internal sessionId tag is
// stripped before the row leaves the server.
export async function listSessionDecisions(sessionId: unknown, { dir, port, page = 1, pageSize = 100, readStream = createReadableStream }: {
  dir?: string;
  port?: number;
  page?: number;
  pageSize?: number;
  readStream?: ReadStream;
} = {}): Promise<{ entries: LogRow[]; total: number; page: number; pageSize: number; pages: number }> {
  if (typeof sessionId !== 'string' || !sessionId.trim()) throw new Error('Invalid session id');
  const size = Number.isSafeInteger(pageSize) && pageSize > 0 && pageSize <= 500 ? pageSize : 100;
  const records: PersistedRecord[] = [];
  for await (const record of readStream({ dir, port })) {
    if (!isObject(record)) continue;
    if (record.sessionId === sessionId) records.push(record);
  }
  const { decisions } = foldSession(records);
  const rows = [...decisions.values()].sort((a, b) => atOf(b) - atOf(a)); // newest first
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, Number.isSafeInteger(page) ? page : 1), pages);
  const start = (current - 1) * size;
  const entries = rows.slice(start, start + size).map(record => {
    const rest: LogRow = { ...record } as LogRow;
    delete (rest as PersistedRecord).sessionId;
    return rest;
  });
  return { entries, total, page: current, pageSize: size, pages };
}
