import assert from 'node:assert/strict';
import { test } from 'node:test';
import { foldSession, buildProfile, backtestTrend, annotationSummary, analyzeSession, analyzeSessionLogs, buildSeed, reconstructSessionSeed, listSessionDecisions } from '../lib/host/log-analyze.js';

const rec = (over) => ({ sessionId: 's1', at: 1, ...over });

test('foldSession keeps decisions by id and the latest annotation per target', () => {
  const records = [
    rec({ id: 'd1', kind: 'gate', outcome: 'deny', at: 10 }),
    rec({ id: 'd2', kind: 'check', outcome: 'low', score: 0, at: 11 }),
    rec({ kind: 'annotation', target: 'd1', rating: 'bad', at: 20 }),
    rec({ kind: 'annotation', target: 'd1', rating: 'good', at: 30 }),
  ];
  const { decisions, annotations } = foldSession(records);
  assert.equal(decisions.size, 2);
  assert.equal(annotations.get('d1').rating, 'good', 'the later annotation wins');
});

test('checkpoint rows restore clean counters, safe browser fields and measurement coverage', async () => {
  const rows = [
    rec({ id: 'p0', kind: 'checkpoint', outcome: 'skipped', reason: 'budget', at: 1 }),
    rec({ id: 'p1', kind: 'checkpoint', outcome: 'concern', at: 2, latencyMs: 20, inputTokens: 0, outputTokens: 2, backendAttempts: 1 }),
    rec({ id: 'p2', kind: 'checkpoint', outcome: 'uncertain', at: 3, latencyMs: 40 }),
    rec({ id: 'c', kind: 'check', outcome: 'ok', at: 4, latencyMs: 0, inputTokens: 3, outputTokens: 1, backendAttempts: 2 }),
  ];
  const result = analyzeSession(rows);
  assert.deepEqual(result.profile.checkpoint, { attempts: 2, concern: 1, uncertain: 1, error: 0, skipped: 1 });
  assert.equal(result.profile.telemetry.measured, 3);
  assert.equal(result.profile.telemetry.usageMeasured, 2);
  assert.equal(result.profile.telemetry.latencyMsP50, 20);
  assert.equal(result.profile.telemetry.latencyMsP95, 40);
  assert.equal(result.profile.telemetry.inputTokens, 3);
  assert.equal(result.profile.telemetry.backendAttempts, 3);
  assert.equal(result.profile.telemetry.transportMeasured, 2);
  const oldOnly = analyzeSession([rec({ id: 'old', kind: 'gate', outcome: 'allow' })]).profile.telemetry;
  assert.equal(oldOnly.transportMeasured, 0);
  const zero = analyzeSession([rec({ id: 'z', kind: 'gate', outcome: 'allow', backendAttempts: 0 })]).profile.telemetry;
  assert.equal(zero.transportMeasured, 1);
  assert.equal(zero.backendAttempts, 0);
  const seed = buildSeed(foldSession(rows).decisions);
  assert.equal(seed.attempts, 1, 'checkpoint rows never enter the automatic-decision total');
  assert.equal(seed.failures, 0);
  assert.equal(seed.checkpoint.attempts, 2);
  assert.equal(seed.checkpoint.skipped, 1);
  const page = await listSessionDecisions('s1', { readStream: async function* () {
    yield { ...rows[1], state: 'secret', evidence: ['secret'], requestId: 'r1' };
  } });
  assert.equal(page.entries[0].requestId, 'r1');
  assert.doesNotMatch(JSON.stringify(page), /secret/);
});

test('buildProfile aggregates per kind with clean denominators', () => {
  const { decisions } = foldSession([
    rec({ id: 'g1', kind: 'gate', outcome: 'deny' }),
    rec({ id: 'g2', kind: 'gate', outcome: 'allow' }),
    rec({ id: 'c1', kind: 'check', outcome: 'low', score: 0, confidence: 0.9 }),
    rec({ id: 'c2', kind: 'check', outcome: 'ok', score: 2, confidence: 0.5 }),
    rec({ id: 'n1', kind: 'narrow', outcome: 'applied', dropped: 3, reason: 'too-many-candidates' }),
    rec({ id: 'k1', kind: 'complete', outcome: 'unsatisfied', satisfied: 1, unsatisfied: 1, insufficient: 0 }),
  ]);
  const profile = buildProfile(decisions);
  assert.equal(profile.gate.attempts, 2);
  assert.equal(profile.gate.deny, 1);
  assert.equal(profile.check.attempts, 2);
  assert.equal(profile.check.low, 1);
  assert.equal(profile.check.scoreCount, 2);
  assert.equal(profile.check.confidence.gte80, 1);
  assert.equal(profile.check.confidence.lt60, 1);
  assert.equal(profile.narrow.droppedSum, 3);
  assert.equal(profile.narrow.tooManyCandidates, 1);
  assert.equal(profile.complete.unsatisfied, 1);
});

test('backtestTrend replays run semantics over check records in time order', () => {
  const checks = [
    rec({ id: 'c1', kind: 'check', outcome: 'low', score: 0, confidence: 0.9, at: 1 }),
    rec({ id: 'c2', kind: 'check', outcome: 'low', score: 0, confidence: 0.9, at: 2 }),
    rec({ id: 'c3', kind: 'check', outcome: 'low', score: 0, confidence: 0.3, at: 3 }), // low-conf: skipped
    rec({ id: 'c4', kind: 'check', outcome: 'low', score: 0, confidence: 0.9, at: 4 }), // run reaches 3 -> warn
    rec({ id: 'c5', kind: 'check', outcome: 'ok', score: 2, confidence: 0.9, at: 5 }),  // reset
  ];
  const result = backtestTrend(checks, { trendMinConfidence: 0.6, trendRun: 3, trendSevereRun: 5 });
  assert.equal(result.warnHits, 1);
  assert.equal(result.severeHits, 0);
  assert.equal(result.maxRun, 3);
});

test('annotationSummary counts ratings on decisions that carry one', () => {
  const { decisions, annotations } = foldSession([
    rec({ id: 'd1', kind: 'gate', outcome: 'deny' }),
    rec({ id: 'd2', kind: 'gate', outcome: 'allow' }),
    rec({ kind: 'annotation', target: 'd1', rating: 'good', at: 9 }),
  ]);
  const { summary, ratings } = annotationSummary(decisions, annotations);
  assert.equal(summary.rated, 1);
  assert.equal(summary.good, 1);
  assert.equal(ratings.d1, 'good', 'the per-decision ratings map carries the rating');
  assert.equal(ratings.d2, undefined);
});

test('analyzeSession returns totals, profile, backtest, and annotation summary', () => {
  const result = analyzeSession([
    rec({ id: 'd1', kind: 'gate', outcome: 'deny' }),
    rec({ kind: 'annotation', target: 'd1', rating: 'bad', at: 9 }),
  ]);
  assert.equal(result.totalDecisions, 1);
  assert.equal(result.annotations.bad, 1);
  assert.ok(result.profile.gate);
  assert.ok(result.trendBacktest);
});

test('analyzeSessionLogs filters by session id over an injected stream', async () => {
  async function* stream() {
    yield { sessionId: 's1', id: 'a', kind: 'gate', outcome: 'deny', at: 1 };
    yield { sessionId: 's2', id: 'b', kind: 'gate', outcome: 'allow', at: 2 };
    yield { sessionId: 's1', kind: 'annotation', target: 'a', rating: 'good', at: 3 };
  }
  const result = await analyzeSessionLogs('s1', { readStream: stream });
  assert.equal(result.totalDecisions, 1, 'only s1 decisions are kept');
  assert.equal(result.annotations.good, 1);
});

test('buildSeed reconstructs the live counter shape from folded decisions', () => {
  const { decisions } = foldSession([
    rec({ id: 'g1', kind: 'gate', outcome: 'deny', at: 1 }),
    rec({ id: 'g2', kind: 'gate', outcome: 'allow', at: 2 }),
    rec({ id: 'g3', kind: 'gate', outcome: 'error', at: 3 }),
    rec({ id: 'c1', kind: 'check', outcome: 'low', confidence: 0.9, at: 4 }),
    rec({ id: 'c2', kind: 'check', outcome: 'low', confidence: 0.9, at: 5 }),
    rec({ id: 'c3', kind: 'check', outcome: 'low', confidence: 0.9, at: 6 }),
    rec({ id: 'n1', kind: 'narrow', outcome: 'applied', dropped: 4, at: 7 }),
    rec({ id: 'k1', kind: 'complete', outcome: 'unsatisfied', satisfied: 1, unsatisfied: 2, insufficient: 1, steered: true, at: 8 }),
  ]);
  const seed = buildSeed(decisions, { trendConfig: { trendMinConfidence: 0.6, trendRun: 3, trendSevereRun: 5 } });
  assert.equal(seed.attempts, 8);
  assert.equal(seed.failures, 1, 'only the gate error counts as a failure');
  assert.equal(seed.gate.attempts, 3);
  assert.equal(seed.gate.deny, 1);
  assert.equal(seed.gate.allow, 1);
  assert.equal(seed.gate.failures, 1);
  assert.deepEqual(seed.gate.actual, { allow: 0, deny: 0, error: 0 }, 'actual is not reconstructable, starts at zero');
  assert.equal(seed.check.attempts, 3);
  assert.equal(seed.check.low, 3);
  assert.equal(seed.check.run, 3, 'three high-confidence lows in a row');
  assert.equal(seed.check.severity, 'warn');
  assert.equal(seed.narrow.applied, 1);
  assert.equal(seed.narrow.dropped, 4);
  assert.equal(seed.complete.satisfied, 1);
  assert.equal(seed.complete.unsatisfied, 2);
  assert.equal(seed.complete.insufficient, 1);
  assert.equal(seed.complete.steered, 1);
  assert.equal(seed.log.length, 8);
  assert.equal(seed.log.at(-1).id, 'k1', 'newest-last, in time order');
  assert.equal(seed.log[0].sessionId, undefined, 'the sessionId wrapper field is dropped');
});

test('reconstructSessionSeed streams, filters by session, and returns undefined with no history', async () => {
  async function* stream() {
    yield { sessionId: 's1', id: 'a', kind: 'gate', outcome: 'deny', at: 1 };
    yield { sessionId: 's2', id: 'b', kind: 'gate', outcome: 'allow', at: 2 };
  }
  const seed = await reconstructSessionSeed('s1', { readStream: stream });
  assert.equal(seed.attempts, 1);
  assert.equal(seed.gate.deny, 1);
  const none = await reconstructSessionSeed('nope', { readStream: stream });
  assert.equal(none, undefined);
});

test('listSessionDecisions pages newest-first, filters by session, strips sessionId', async () => {
  async function* stream() {
    for (let i = 1; i <= 5; i++) yield { sessionId: 's1', id: `a${i}`, kind: 'gate', outcome: 'allow', at: i };
    yield { sessionId: 's2', id: 'b', kind: 'gate', outcome: 'deny', at: 99 };
    yield { sessionId: 's1', kind: 'annotation', target: 'a1', rating: 'good', at: 100 };
  }
  const page1 = await listSessionDecisions('s1', { page: 1, pageSize: 2, readStream: stream });
  assert.equal(page1.total, 5, 'only s1 decisions counted, annotation excluded');
  assert.equal(page1.pages, 3);
  assert.equal(page1.page, 1);
  assert.deepEqual(page1.entries.map(e => e.id), ['a5', 'a4'], 'newest first');
  assert.equal(page1.entries[0].sessionId, undefined, 'internal sessionId stripped');
  const page3 = await listSessionDecisions('s1', { page: 3, pageSize: 2, readStream: stream });
  assert.deepEqual(page3.entries.map(e => e.id), ['a1'], 'last page holds the remainder');
  // Out-of-range and malformed page/size are clamped to a valid page.
  const clamped = await listSessionDecisions('s1', { page: 99, pageSize: 2, readStream: stream });
  assert.equal(clamped.page, 3);
  const defSize = await listSessionDecisions('s1', { pageSize: 0, readStream: stream });
  assert.equal(defSize.pageSize, 100);
  assert.equal(defSize.pages, 1);
});

test('listSessionDecisions folds a re-logged id (latest wins, no double count)', async () => {
  async function* stream() {
    yield { sessionId: 's1', id: 'd1', kind: 'check', outcome: 'ok', at: 1 };
    yield { sessionId: 's1', id: 'd1', kind: 'check', outcome: 'low', at: 2 };
  }
  const page = await listSessionDecisions('s1', { readStream: stream });
  assert.equal(page.total, 1);
  assert.equal(page.entries[0].outcome, 'low', 'the later record wins');
});

test('listSessionDecisions filters to low self-check scores before pagination', async () => {
  async function* stream() {
    yield { sessionId: 's1', id: 'g1', kind: 'gate', outcome: 'deny', at: 1 };
    yield { sessionId: 's1', id: 'c1', kind: 'check', outcome: 'low', at: 2, turn: 3 };
    yield { sessionId: 's1', id: 'c2', kind: 'check', outcome: 'ok', at: 3 };
    yield { sessionId: 's1', id: 'c3', kind: 'check', outcome: 'low', at: 4, turn: 9 };
    yield { sessionId: 's1', id: 'c4', kind: 'check', outcome: 'error', at: 5 };
    yield { sessionId: 's2', id: 'other', kind: 'check', outcome: 'low', at: 6 };
  }
  const filtered = await listSessionDecisions('s1', { lowOnly: true, pageSize: 1, readStream: stream });
  assert.equal(filtered.total, 2, 'only this session’s low self-check rows remain');
  assert.equal(filtered.pages, 2, 'pagination counts the filtered set, not the whole log');
  assert.deepEqual(filtered.entries.map(e => e.id), ['c3'], 'newest low row first');
  const second = await listSessionDecisions('s1', { lowOnly: true, pageSize: 1, page: 2, readStream: stream });
  assert.deepEqual(second.entries.map(e => e.id), ['c1']);
  // The same stream without the filter still returns every decision kind.
  const all = await listSessionDecisions('s1', { readStream: stream });
  assert.equal(all.total, 5);
  assert.deepEqual(all.entries.map(e => e.id), ['c4', 'c3', 'c2', 'c1', 'g1']);
});
