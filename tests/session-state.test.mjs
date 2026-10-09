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

test('reading unknown sessions does not allocate, and a full store evicts the oldest (FIFO)', () => {
  const sessions = createSessionState({ maxSessions: 2 });
  // Reads never allocate, so 500 unseen ids do not consume the budget.
  for (let i = 0; i < 500; i++) assert.equal(sessions.snapshot(`read-${i}`).enabled, true);
  sessions.setEnabled('one', false);
  sessions.setEnabled('two', false);
  // Admitting 'three' with the store full evicts the oldest ('one').
  sessions.setEnabled('three', false);
  assert.equal(sessions.snapshot('three').enabled, false, 'newest is kept');
  assert.equal(sessions.snapshot('two').enabled, false, 'second-newest is kept');
  assert.equal(sessions.snapshot('one').enabled, true, 'oldest was evicted and rebuilds as default enabled');
  // No capacity-exceeded state exists anymore: writes never throw on a full store.
  assert.equal(sessions.snapshot('three').capacityExceeded, undefined);
  sessions.record('four', 'gate', 'deny');
  assert.equal(sessions.snapshot('four').gate.deny, 1, 'a new session is admitted by evicting the oldest');
});

test('self-check records low scores and failures separately from the gate', () => {
  const sessions = createSessionState();
  sessions.recordCheck('one', 'ok');
  sessions.recordCheck('one', 'low');
  sessions.recordCheck('one', 'error');
  const snapshot = sessions.snapshot('one');
  assert.equal(snapshot.check.attempts, 3);
  assert.equal(snapshot.check.failures, 1);
  assert.equal(snapshot.check.low, 1);
  assert.equal(snapshot.gate, undefined);
  assert.equal(snapshot.attempts, 3);
  assert.equal(snapshot.failures, 1);
  assert.throws(() => sessions.recordCheck('one', 'bogus'), /self-check/i);
});

test('self-check trend run grows on high-confidence low scores and resets on a good score', () => {
  const sessions = createSessionState();
  const trend = { confident: true, trendRun: 3, trendSevereRun: 5 };
  sessions.recordCheck('one', 'low', trend);
  sessions.recordCheck('one', 'low', trend);
  assert.equal(sessions.snapshot('one').check.trend.run, 2);
  assert.equal(sessions.snapshot('one').check.trend.severity, 'normal');
  sessions.recordCheck('one', 'low', trend);
  assert.equal(sessions.snapshot('one').check.trend.run, 3, 'three in a row');
  assert.equal(sessions.snapshot('one').check.trend.severity, 'warn');
  // a low-confidence low score is skipped, leaving the run unchanged
  sessions.recordCheck('one', 'low', { confident: false, trendRun: 3, trendSevereRun: 5 });
  assert.equal(sessions.snapshot('one').check.trend.run, 3);
  sessions.recordCheck('one', 'low', trend);
  sessions.recordCheck('one', 'low', trend);
  assert.equal(sessions.snapshot('one').check.trend.run, 5);
  assert.equal(sessions.snapshot('one').check.trend.severity, 'severe');
  // a good score resets the run to normal
  sessions.recordCheck('one', 'ok', { confident: false, trendRun: 3, trendSevereRun: 5 });
  assert.equal(sessions.snapshot('one').check.trend.run, 0);
  assert.equal(sessions.snapshot('one').check.trend.severity, 'normal');
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

test('task completion records three-state tallies separately, error is a failure not unsatisfied', () => {
  const sessions = createSessionState();
  sessions.recordComplete('one', 'ok', { satisfied: 2, insufficient: 1 });
  sessions.recordComplete('one', 'unsatisfied', { satisfied: 1, unsatisfied: 1, steered: true });
  sessions.recordComplete('one', 'error');
  const snapshot = sessions.snapshot('one');
  assert.deepEqual(snapshot.complete, { attempts: 3, failures: 1, unsatisfied: 1, satisfied: 3, insufficient: 1, steered: 1 });
  assert.equal(snapshot.gate, undefined);
  assert.equal(snapshot.attempts, 3);
  assert.equal(snapshot.failures, 1, 'only the error counts as a failure');
  assert.throws(() => sessions.recordComplete('one', 'bogus'), /task-completion/i);
});

test('complete log entries keep condition counts and steer flag', () => {
  const sessions = createSessionState();
  sessions.log('one', { kind: 'complete', outcome: 'unsatisfied', conditions: 3, satisfied: 1, unsatisfied: 1, insufficient: 1, steered: true });
  const entry = sessions.snapshot('one').log.at(-1);
  assert.equal(entry.kind, 'complete');
  assert.equal(entry.conditions, 3);
  assert.equal(entry.unsatisfied, 1);
  assert.equal(entry.insufficient, 1);
  assert.equal(entry.steered, true);
});

test('narrow log entries keep mode and dropped count', () => {
  const sessions = createSessionState();
  sessions.log('one', { kind: 'narrow', outcome: 'applied', mode: 'enforce', dropped: 3 });
  const entry = sessions.snapshot('one').log.at(-1);
  assert.equal(entry.kind, 'narrow');
  assert.equal(entry.mode, 'enforce');
  assert.equal(entry.dropped, 3);
});

test('every decision record carries a stable unique id shared by panel and sink', () => {
  const sunk = [];
  const sessions = createSessionState({ onLog: entry => sunk.push(entry) });
  sessions.log('one', { kind: 'gate', outcome: 'deny', tool: 'bash' });
  sessions.log('one', { kind: 'check', outcome: 'low', score: 0 });
  const log = sessions.snapshot('one').log;
  assert.ok(typeof log[0].id === 'string' && log[0].id.length >= 8, 'first record has a string id');
  assert.ok(typeof log[1].id === 'string' && log[1].id.length >= 8, 'second record has a string id');
  assert.notEqual(log[0].id, log[1].id, 'ids are unique per record');
  // The in-memory panel copy and the persisted sink record share the same id.
  assert.equal(sunk[0].id, log[0].id, 'sink record id matches the panel record id');
  assert.equal(sunk[1].id, log[1].id);
});

test('narrow log keeps the optional-candidate count for the too-many reason', () => {
  const sessions = createSessionState();
  sessions.log('c', { kind: 'narrow', outcome: 'ok', mode: 'observe', dropped: 0, kept: 53, reason: 'too-many-candidates', candidates: 40 });
  const entry = sessions.snapshot('c').log.at(-1);
  assert.equal(entry.candidates, 40);
  assert.equal(entry.reason, 'too-many-candidates');
});

test('gate log keeps a bounded, whitespace-collapsed command/path for human review', () => {
  const sessions = createSessionState();
  sessions.log('g', { kind: 'gate', outcome: 'deny', tool: 'bash', command: 'rm -rf \n   /tmp/build' });
  const denied = sessions.snapshot('g').log.at(-1);
  assert.equal(denied.command, 'rm -rf /tmp/build', 'newlines/indent collapse to single spaces');
  assert.equal(denied.path, undefined);
  sessions.log('g', { kind: 'gate', outcome: 'error', tool: 'edit', path: '/etc/passwd', reason: 'unreachable' });
  assert.equal(sessions.snapshot('g').log.at(-1).path, '/etc/passwd');
  // Over-long command is capped for storage.
  sessions.log('g', { kind: 'gate', outcome: 'deny', tool: 'bash', command: 'x'.repeat(900) });
  assert.equal(sessions.snapshot('g').log.at(-1).command.length, 512);
});

test('onLog sink receives the full untruncated record with session id', () => {
  const sunk = [];
  const sessions = createSessionState({ onLog: entry => sunk.push(entry) });
  const many = Array.from({ length: 20 }, (_, i) => `tool_${i}`);
  sessions.log('sess-1', { kind: 'narrow', outcome: 'applied', dropped: 20, kept: 2, mode: 'observe', tools: many });
  assert.equal(sessions.snapshot('sess-1').log.at(-1).tools.length, 12, 'panel record stays capped at 12 names');
  assert.equal(sunk.length, 1);
  assert.equal(sunk[0].sessionId, 'sess-1');
  assert.equal(sunk[0].tools.length, 20, 'sink gets every dropped tool name');
  assert.equal(sunk[0].kind, 'narrow');
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

test('persistState receives the latest state after every mutation', () => {
  const saved = new Map();
  const sessions = createSessionState({ persistState: (id, state) => saved.set(id, structuredClone(state)) });
  sessions.record('s', 'gate', 'deny');
  sessions.recordActual('s', 'allow');
  sessions.recordCheck('s', 'low', { confident: true, trendRun: 3, trendSevereRun: 5 });
  sessions.recordNarrow('s', 'applied', 2);
  sessions.recordComplete('s', 'unsatisfied', { satisfied: 1, unsatisfied: 1, steered: true });
  sessions.log('s', { kind: 'gate', outcome: 'deny', tool: 'bash' });
  sessions.setEnabled('s', false);
  const persisted = saved.get('s');
  assert.equal(persisted.enabled, false);
  assert.equal(persisted.gate.deny, 1);
  assert.equal(persisted.gate.actual.allow, 1);
  assert.equal(persisted.check.low, 1);
  assert.equal(persisted.narrow.applied, 1);
  assert.equal(persisted.narrow.dropped, 2);
  assert.equal(persisted.complete.unsatisfied, 1);
  assert.equal(persisted.complete.steered, 1);
  assert.equal(persisted.log.at(-1).tool, 'bash');
});

test('ensureLoaded seeds live counters/log from the durable store, once per id', async () => {
  let calls = 0;
  const stored = {
    enabled: false, attempts: 4, failures: 1,
    gate: { attempts: 2, failures: 0, ask: 0, deny: 1, allow: 1, actual: { allow: 1, deny: 0, error: 0 } },
    check: { attempts: 2, failures: 1, low: 1, run: 2, severity: 'warn' },
    log: [{ id: 'd1', at: 1, kind: 'gate', outcome: 'deny', tool: 'bash' }],
  };
  const sessions = createSessionState({ loadState: id => { calls++; return id === 's' ? stored : undefined; } });
  await sessions.ensureLoaded('s');
  await sessions.ensureLoaded('s'); // memoized: no second load
  assert.equal(calls, 1);
  const snapshot = sessions.snapshot('s');
  assert.equal(snapshot.enabled, false);
  assert.equal(snapshot.attempts, 4);
  assert.equal(snapshot.gate.deny, 1);
  assert.equal(snapshot.gate.actual.allow, 1);
  assert.equal(snapshot.check.trend.run, 2);
  assert.equal(snapshot.check.trend.severity, 'warn');
  assert.equal(snapshot.log.at(-1).id, 'd1');
  // New events accumulate on top of the restored totals.
  sessions.record('s', 'gate', 'allow');
  assert.equal(sessions.snapshot('s').attempts, 5);
  assert.equal(sessions.snapshot('s').gate.allow, 2);
});

test('ensureLoaded never clobbers live state created before it runs', async () => {
  const stored = { attempts: 99, gate: { attempts: 99, failures: 0, ask: 0, deny: 99, allow: 0, actual: { allow: 0, deny: 0, error: 0 } } };
  const sessions = createSessionState({ loadState: () => stored });
  // A live event arrives first (e.g. a race), creating in-memory state.
  sessions.record('s', 'gate', 'allow');
  await sessions.ensureLoaded('s');
  // The disk seed is discarded; the live counters stand.
  assert.equal(sessions.snapshot('s').attempts, 1);
  assert.equal(sessions.snapshot('s').gate.allow, 1);
  assert.equal(sessions.snapshot('s').gate.deny, 0);
});

test('ensureLoaded is a no-op without a loader and tolerates invalid ids', async () => {
  const sessions = createSessionState();
  await sessions.ensureLoaded('s'); // no loadState: returns immediately
  assert.equal(sessions.snapshot('s').attempts, 0);
  const withLoader = createSessionState({ loadState: () => { throw new Error('should not be called for an invalid id'); } });
  await withLoader.ensureLoaded(''); // invalid id: swallowed, no throw
});

test('a corrupt persisted state is coerced into shape, not trusted verbatim', async () => {
  const sessions = createSessionState({ loadState: () => ({
    attempts: -5, failures: 'x',
    gate: { attempts: 1, allow: 2.5, deny: 1, actual: { allow: 'nope' } },
    check: { attempts: 1, severity: 'boom', run: -1 },
    log: [{ kind: 'gate', outcome: 'deny' }, 'junk', { noKind: true }],
  }) });
  await sessions.ensureLoaded('s');
  const snapshot = sessions.snapshot('s');
  assert.equal(snapshot.attempts, 0, 'negative count coerced to 0');
  assert.equal(snapshot.failures, 0, 'non-integer coerced to 0');
  assert.equal(snapshot.gate.allow, 0, 'fractional coerced to 0');
  assert.equal(snapshot.gate.deny, 1);
  assert.equal(snapshot.gate.actual.allow, 0);
  assert.equal(snapshot.check.trend.severity, 'normal', 'invalid severity falls back to normal');
  assert.equal(snapshot.check.trend.run, 0);
  assert.equal(snapshot.log.length, 1, 'only well-formed log entries survive');
});
