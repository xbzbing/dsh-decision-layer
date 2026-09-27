import assert from 'node:assert/strict';
import { test } from 'node:test';
import { foldSession, buildProfile, backtestTrend, annotationSummary, analyzeSession, analyzeSessionLogs } from '../service/log-analyze.mjs';

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
  const summary = annotationSummary(decisions, annotations);
  assert.equal(summary.rated, 1);
  assert.equal(summary.good, 1);
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
