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

test('deterministic guard denies only after the repeat threshold, no backend', () => {
  const guard = createLoopGuard({ threshold: 3 });
  const call = exec('bash', { command: 'ls' });
  assert.equal(guard.check(call), undefined);
  assert.equal(guard.check(call), undefined);
  assert.match(guard.check(call), /repeat|loop/i);
});

test('a different call resets nothing but is tracked independently per session', () => {
  const guard = createLoopGuard({ threshold: 2 });
  assert.equal(guard.check(exec('bash', { command: 'a' }, 's1')), undefined);
  assert.equal(guard.check(exec('bash', { command: 'b' }, 's1')), undefined);
  assert.equal(guard.check(exec('bash', { command: 'a' }, 's2')), undefined);
  assert.match(guard.check(exec('bash', { command: 'a' }, 's1')), /repeat|loop/i);
});

test('successful varied progress does not trip the guard', () => {
  const guard = createLoopGuard({ threshold: 3 });
  for (const command of ['a', 'b', 'c', 'd', 'e']) {
    assert.equal(guard.check(exec('bash', { command })), undefined);
  }
});

test('per-session fingerprint memory is bounded', () => {
  const guard = createLoopGuard({ threshold: 100, maxTracked: 8 });
  for (let i = 0; i < 200; i++) guard.check(exec('bash', { command: `cmd-${i}` }));
  assert.equal(guard.trackedSize('s1') <= 8, true);
});
