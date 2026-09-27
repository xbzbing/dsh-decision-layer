import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLoopGuard, fingerprintCall } from '../service/loop-guard.mjs';

const exec = (name, args, sessionId = 's1') => ({ name, arguments: args, agent: { session: { id: sessionId } } });

test('identical repeated calls produce a stable fingerprint', () => {
  const a = fingerprintCall(exec('bash', { command: 'ls' }));
  const b = fingerprintCall(exec('bash', { command: 'ls' }));
  assert.equal(a, b);
  assert.notEqual(a, fingerprintCall(exec('bash', { command: 'pwd' })));
});

test('only consecutive repeats trip the guard; an intervening call resets the run', () => {
  const guard = createLoopGuard({ threshold: 3 });
  const a = exec('bash', { command: 'ls' });
  assert.equal(guard.check(a), undefined);
  assert.equal(guard.check(a), undefined);
  assert.equal(guard.check(exec('bash', { command: 'pwd' })), undefined);
  // The run of identical 'ls' calls was broken, so the count restarts.
  assert.equal(guard.check(a), undefined);
  assert.equal(guard.check(a), undefined);
  assert.match(guard.check(a), /repeat|loop/i);
});

test('deterministic guard denies only after the repeat threshold, no backend', () => {
  const guard = createLoopGuard({ threshold: 3 });
  const call = exec('bash', { command: 'ls' });
  assert.equal(guard.check(call), undefined);
  assert.equal(guard.check(call), undefined);
  assert.match(guard.check(call), /repeat|loop/i);
});

test('runs are tracked independently per session', () => {
  const guard = createLoopGuard({ threshold: 2 });
  assert.equal(guard.check(exec('bash', { command: 'a' }, 's1')), undefined);
  assert.equal(guard.check(exec('bash', { command: 'a' }, 's2')), undefined);
  assert.match(guard.check(exec('bash', { command: 'a' }, 's1')), /repeat|loop/i);
  assert.match(guard.check(exec('bash', { command: 'a' }, 's2')), /repeat|loop/i);
});

test('successful varied progress does not trip the guard', () => {
  const guard = createLoopGuard({ threshold: 3 });
  for (const command of ['a', 'b', 'c', 'd', 'e']) {
    assert.equal(guard.check(exec('bash', { command })), undefined);
  }
});

test('the master switch pauses the loop guard', () => {
  const off = createLoopGuard({ threshold: 2, sessions: { snapshot: () => ({ enabled: false }) } });
  const a = exec('bash', { command: 'ls' });
  assert.equal(off.check(a), undefined);
  assert.equal(off.check(a), undefined, 'a disabled session is not guarded');
});

test('per-session run memory is bounded across many sessions', () => {
  const guard = createLoopGuard({ threshold: 100, maxSessions: 8 });
  for (let i = 0; i < 200; i++) guard.check(exec('bash', { command: 'x' }, `session-${i}`));
  assert.equal(guard.runLength('session-0'), 0);
  assert.equal(guard.runLength('session-199'), 1);
});
