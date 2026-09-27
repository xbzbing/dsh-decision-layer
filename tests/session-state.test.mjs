import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSessionState } from '../service/session-state.mjs';

test('session switch defaults on and counters stay empty for manual work', () => {
  const sessions = createSessionState();
  assert.deepEqual(sessions.snapshot('one'), { enabled: true, hasAutomaticDecisions: false, attempts: 0, failures: 0 });
  sessions.setEnabled('one', false);
  assert.equal(sessions.snapshot('one').enabled, false);
  assert.equal(sessions.snapshot('two').enabled, true);
  assert.equal(sessions.snapshot('one').attempts, 0);
});

test('reading unknown sessions does not consume the bounded state budget', () => {
  const sessions = createSessionState({ maxSessions: 2 });
  for (let i = 0; i < 500; i++) assert.equal(sessions.snapshot(`read-${i}`).enabled, true);
  sessions.setEnabled('one', false);
  sessions.setEnabled('two', false);
  sessions.setEnabled('three', false);
  assert.equal(sessions.snapshot('one').enabled, false);
  assert.equal(sessions.snapshot('three').enabled, false);
  assert.equal(sessions.snapshot('three').capacityExceeded, true);
  assert.throws(() => sessions.setEnabled('three', true), /limit/i);
  assert.throws(() => sessions.record('three', 'gate', 'deny'), /limit/i);
});

test('self-check records low scores and failures separately from the gate', () => {
  const sessions = createSessionState();
  sessions.recordCheck('one', 'ok');
  sessions.recordCheck('one', 'low');
  sessions.recordCheck('one', 'error');
  const snapshot = sessions.snapshot('one');
  assert.deepEqual(snapshot.check, { attempts: 3, failures: 1, low: 1 });
  assert.equal(snapshot.gate, undefined);
  assert.equal(snapshot.attempts, 3);
  assert.equal(snapshot.failures, 1);
  assert.throws(() => sessions.recordCheck('one', 'bogus'), /self-check/i);
});

test('gate suggestions and actual outcomes remain separate', () => {
  const sessions = createSessionState();
  sessions.record('one', 'gate', 'allow');
  sessions.recordActual('one', 'allow');
  const snapshot = sessions.snapshot('one');
  assert.deepEqual(snapshot.gate, { attempts: 1, failures: 0, ask: 0, deny: 0, allow: 1, actual: { allow: 1, deny: 0, error: 0 } });
  assert.deepEqual(snapshot.gate.actual, { allow: 1, deny: 0, error: 0 });
});

test('narrowing records applied passes and dropped tool counts separately from the gate', () => {
  const sessions = createSessionState();
  sessions.recordNarrow('one', 'ok');
  sessions.recordNarrow('one', 'applied', 2);
  sessions.recordNarrow('one', 'error');
  const snapshot = sessions.snapshot('one');
  assert.deepEqual(snapshot.narrow, { attempts: 3, failures: 1, applied: 1, dropped: 2 });
  assert.equal(snapshot.gate, undefined);
  assert.equal(snapshot.attempts, 3);
  assert.equal(snapshot.failures, 1);
  assert.throws(() => sessions.recordNarrow('one', 'bogus'), /narrowing/i);
});

test('narrow log entries keep mode and dropped count', () => {
  const sessions = createSessionState();
  sessions.log('one', { kind: 'narrow', outcome: 'applied', mode: 'enforce', dropped: 3 });
  const entry = sessions.snapshot('one').log.at(-1);
  assert.equal(entry.kind, 'narrow');
  assert.equal(entry.mode, 'enforce');
  assert.equal(entry.dropped, 3);
});

test('each automatic attempt counts once and failure is separate', () => {
  const sessions = createSessionState();
  sessions.record('one', 'gate', 'error');
  sessions.record('one', 'gate', 'ask');
  assert.deepEqual(sessions.snapshot('one'), { enabled: true, hasAutomaticDecisions: true, attempts: 2, failures: 1,
    gate: { attempts: 2, failures: 1, ask: 1, deny: 0, allow: 0, actual: { allow: 0, deny: 0, error: 0 } } });
  assert.equal(sessions.snapshot('two').hasAutomaticDecisions, false);
  assert.throws(() => sessions.record('', 'gate', 'error'), /session/i);
});

test('decision log keeps a bounded newest-last ring and validates entries', () => {
  const sessions = createSessionState({ maxLogEntries: 3 });
  assert.equal(sessions.snapshot('one').log, undefined);
  sessions.log('one', { kind: 'gate', outcome: 'deny', tool: 'bash', suggestion: 'deny' });
  sessions.log('one', { kind: 'check', outcome: 'low', score: 0 });
  const first = sessions.snapshot('one').log;
  assert.equal(first.length, 2);
  assert.equal(first[0].kind, 'gate');
  assert.equal(first[0].tool, 'bash');
  assert.equal(first[0].suggestion, 'deny');
  assert.ok(Number.isSafeInteger(first[0].at));
  assert.equal(first[1].score, 0);
  sessions.log('one', { kind: 'check', outcome: 'low', score: 1.4266, confidence: 0.351 });
  const withFraction = sessions.snapshot('one').log.at(-1);
  assert.equal(withFraction.score, 1.43, 'fractional scores are kept and rounded to two decimals');
  assert.equal(withFraction.confidence, 0.35, 'confidence is kept and rounded to two decimals');
  for (let i = 0; i < 5; i++) sessions.log('one', { kind: 'gate', outcome: 'ask', tool: `t${i}` });
  const bounded = sessions.snapshot('one').log;
  assert.equal(bounded.length, 3);
  assert.equal(bounded[2].tool, 't4');
  assert.throws(() => sessions.log('one', { kind: 'bogus', outcome: 'x' }), /log entry/i);
});
