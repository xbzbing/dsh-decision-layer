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

test('gate suggestions and actual outcomes remain separate', () => {
  const sessions = createSessionState();
  sessions.record('one', 'gate', 'allow');
  sessions.recordActual('one', 'allow');
  const snapshot = sessions.snapshot('one');
  assert.deepEqual(snapshot.gate, { attempts: 1, failures: 0, ask: 0, deny: 0, allow: 1, actual: { allow: 1, deny: 0, error: 0 } });
  assert.deepEqual(snapshot.gate.actual, { allow: 1, deny: 0, error: 0 });
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
