import assert from 'node:assert/strict';
import { test } from 'node:test';
import { advanceRun, severityOf, DEFAULT_TREND_RUN, DEFAULT_TREND_SEVERE_RUN } from '../service/quality-trend.mjs';

test('a good score resets the run to zero', () => {
  assert.equal(advanceRun(4, { lowScore: false, confident: false }), 0);
  assert.equal(advanceRun(4, { lowScore: false, confident: true }), 0);
});

test('a high-confidence low score increments the run', () => {
  assert.equal(advanceRun(0, { lowScore: true, confident: true }), 1);
  assert.equal(advanceRun(2, { lowScore: true, confident: true }), 3);
});

test('a low-confidence low score is skipped, neither resets nor increments', () => {
  assert.equal(advanceRun(2, { lowScore: true, confident: false }), 2, 'low confidence leaves the run unchanged');
});

test('a bad-highconf / bad-lowconf / bad-highconf sequence counts as a run of two', () => {
  let run = 0;
  run = advanceRun(run, { lowScore: true, confident: true });   // 1
  run = advanceRun(run, { lowScore: true, confident: false });  // skipped -> 1
  run = advanceRun(run, { lowScore: true, confident: true });   // 2
  assert.equal(run, 2);
});

test('severity maps run length to normal / warn / severe with defaults', () => {
  assert.equal(severityOf(0), 'normal');
  assert.equal(severityOf(DEFAULT_TREND_RUN - 1), 'normal');
  assert.equal(severityOf(DEFAULT_TREND_RUN), 'warn');
  assert.equal(severityOf(DEFAULT_TREND_SEVERE_RUN - 1), 'warn');
  assert.equal(severityOf(DEFAULT_TREND_SEVERE_RUN), 'severe');
  assert.equal(severityOf(99), 'severe');
});

test('severity honors configured thresholds', () => {
  assert.equal(severityOf(2, { trendRun: 2, trendSevereRun: 4 }), 'warn');
  assert.equal(severityOf(4, { trendRun: 2, trendSevereRun: 4 }), 'severe');
});

test('invalid run values are treated as zero', () => {
  assert.equal(advanceRun(-1, { lowScore: true, confident: true }), 1);
  assert.equal(advanceRun('x', { lowScore: false }), 0);
  assert.equal(severityOf(-5), 'normal');
});
