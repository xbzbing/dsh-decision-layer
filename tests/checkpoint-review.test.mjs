import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCheckpointReview } from '../lib/host/checkpoint-review.js';

const answer = (choice = 'on_track', confidence = 0.9) => ({ model: 'test-model', answers: { progress: {
  type: 'choice', choice, confidence, probabilities: { on_track: choice === 'on_track' ? 1 : 0, concern: choice === 'concern' ? 1 : 0, insufficient_evidence: choice === 'insufficient_evidence' ? 1 : 0 },
} } });
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
let counter = 0;
function fixture({ config = { enabled: true, heartbeatSteps: 2 }, evaluate = async () => answer(), now, settings: settingsOverride } = {}) {
  const logs = [], counts = [], requests = [];
  let settings = config;
  let enabled = true;
  const review = createCheckpointReview({
    evaluate: (input, options) => { requests.push({ input, options }); return evaluate(input, options); },
    sessions: { snapshot: () => ({ enabled }), log: (id, row) => logs.push({ id, ...row }), recordCheckpoint: (id, outcome) => counts.push({ id, outcome }) },
    settings: settingsOverride ?? (async () => settings),
    ...(now ? { now } : {}),
  });
  const session = { id: `checkpoint-${++counter}` };
  const agent = { session, steer: () => assert.fail('observe must not steer'), inject: () => assert.fail('observe must not inject'), ctx: { tools: { restrict: () => assert.fail('observe must not restrict') } } };
  let seq = 0;
  let step = 0;
  review.enter(agent, { turn: 1, step: 1, request: '修复测试 token=private-token' });
  const emit = (type, data, rest = {}, subject = session) => review.observe(subject, { seq: ++seq, type, data,
    ...(type === 'tool/result' ? { surfaceOp: { op: 'append' } } : {}), ...rest });
  const execute = ({ name = 'read', args = { file_path: 'a.ts' }, text = 'PRIVATE FILE', error = false, code, turn = 1 } = {}) => {
    step++;
    review.enter(agent, { turn, step, request: '修复测试 token=private-token' });
    const id = `c${step}`;
    emit('tool/call', { turn, step, callId: id, name, arguments: JSON.stringify(args) });
    emit('tool/result', { turn, step, message: { role: 'tool', toolCallId: id, isError: error, content: [{ type: 'text', text }] }, ...(code ? { error: { code } } : {}) });
    emit('step/end', { turn, step });
  };
  return { review, logs, counts, requests, agent, session, emit, execute, setConfig: value => { settings = value; }, setEnabled: value => { enabled = value; } };
}

test('default-off, disabled sessions, unavailable settings and empty requests send zero backend requests', async () => {
  for (const config of [undefined, {}, { enabled: false }, { enabled: true, heartbeatSteps: -1 }]) {
    const f = fixture({ config: config ?? {} });
    for (let i = 0; i < 8; i++) f.execute();
    await f.review.idle();
    assert.equal(f.requests.length, 0);
    f.review.dispose();
  }
  const f = fixture(); f.setEnabled(false); f.execute(); f.execute(); await f.review.idle(); assert.equal(f.requests.length, 0); f.review.dispose();
  const empty = fixture(); empty.review.enter(empty.agent, { turn: 1, step: 1, request: '', changed: true }); empty.emit('step/end', { turn: 1, step: 1 }); await empty.review.idle(); assert.equal(empty.requests.length, 0); empty.review.dispose();
});

test('heartbeat sends only after new tool-evidence steps and never from the synchronous event callback', async () => {
  const f = fixture();
  f.emit('assistant/message', { turn: 1, step: 1, message: { content: [{ type: 'reasoning', text: 'PRIVATE REASONING' }] } });
  f.emit('step/end', { turn: 1, step: 1 });
  f.execute(); await f.review.idle(); assert.equal(f.requests.length, 0);
  f.execute(); assert.equal(f.requests.length, 0, 'evaluation must be deferred');
  await f.review.idle();
  assert.equal(f.requests.length, 1);
  assert.equal(f.logs.at(-1).trigger, 'heartbeat');
  assert.equal(f.logs.at(-1).evidenceCount, 2);
  assert.equal(f.logs.at(-1).outcome, 'ok');
  assert.doesNotMatch(JSON.stringify(f.requests), /PRIVATE FILE|PRIVATE REASONING|private-token/);
  assert.equal(f.requests[0].input.questions.progress.type, 'choice');
  f.review.dispose();
});

test('observer only accepts the exact registered session object and current turn, with duplicate seq ignored', async () => {
  const f = fixture();
  for (let step = 1; step <= 10; step++) {
    f.emit('tool/call', { turn: 1, step, callId: `x${step}`, name: 'read', arguments: '{}' }, {}, { id: f.session.id });
    f.emit('step/end', { turn: 1, step }, {}, { id: f.session.id });
  }
  f.execute(); f.execute(); await f.review.idle(); assert.equal(f.requests.length, 1);
  const original = f.logs.at(-1);
  f.review.observe(f.session, { seq: 1, type: 'step/end', data: { turn: 1, step: 100 } });
  await f.review.idle(); assert.equal(f.logs.at(-1), original);
  f.review.dispose();
});

test('three unresolved repetitions trigger an anomaly, while normal single probing failures and successful recovery do not', async () => {
  const f = fixture({ config: { enabled: true, heartbeatSteps: 100, failureThreshold: 3 } });
  const failure = { name: 'bash', args: { command: 'npm test' }, text: '[exit code: 1]' };
  f.execute(failure); await f.review.idle(); assert.equal(f.requests.length, 0);
  f.execute(failure); await f.review.idle(); assert.equal(f.requests.length, 0);
  f.execute(failure); await f.review.idle();
  assert.equal(f.requests.length, 1); assert.equal(f.logs.at(-1).trigger, 'unresolved_failure');
  f.execute({ ...failure, text: 'passed' }); await f.review.idle(); assert.equal(f.requests.length, 1);
  f.execute(failure); await f.review.idle(); assert.equal(f.requests.length, 1);
  f.review.dispose();
});

test('verification after change observes stale validation without treating normal pending work as a failed task', async () => {
  const f = fixture({ config: { enabled: true, heartbeatSteps: 100 } });
  f.execute({ name: 'bash', args: { command: 'npm test' }, text: 'passed' }); await f.review.idle();
  f.execute({ name: 'edit', args: { file_path: 'a.ts' }, text: 'patched' }); await f.review.idle();
  assert.equal(f.requests.length, 1); assert.equal(f.logs.at(-1).trigger, 'verification_after_change');
  assert.match(JSON.stringify(f.requests[0].input.questions), /验证|verification/);
  f.execute(); await f.review.idle(); assert.equal(f.requests.length, 1, 'same invalidated generation does not re-trigger');
  f.review.dispose();
});

test('low-confidence concern and insufficient evidence are uncertain; invalid responses are errors', async () => {
  for (const [reply, outcome, lowConfidence] of [[answer('concern', 0.59), 'uncertain', true], [answer('concern', 0.6), 'concern', false], [answer('insufficient_evidence'), 'uncertain', false], [{ model: 'bad', answers: { progress: { type: 'choice', choice: 'concern', confidence: 1, probabilities: { concern: 1 } } } }, 'error', false]]) {
    const f = fixture({ evaluate: async () => reply }); f.execute(); f.execute(); await f.review.idle();
    assert.equal(f.logs.at(-1).outcome, outcome);
    assert.equal(f.logs.at(-1).lowConfidence === true, lowConfidence);
    f.review.dispose();
  }
});

test('rolling 24-step budget allows four checks and resumes as the window advances', async () => {
  const f = fixture();
  for (let step = 1; step <= 24; step++) { f.execute(); await f.review.idle(); }
  assert.equal(f.requests.length, 4);
  assert.equal(f.logs.filter(row => row.outcome === 'skipped').length, 0, 'budget exhaustion stays silent');
  assert.equal(f.counts.length, 4);
  f.execute(); await f.review.idle(); f.execute(); await f.review.idle();
  assert.equal(f.requests.length, 5);
  f.review.dispose();
});

test('single flight retains only the newest pending snapshot and suppresses stale result', async () => {
  const first = deferred();
  let calls = 0;
  const f = fixture({ evaluate: async () => ++calls === 1 ? first.promise : answer() });
  f.execute(); f.execute(); await tick(); assert.equal(f.requests.length, 1);
  for (let i = 0; i < 6; i++) f.execute();
  await tick(); assert.equal(f.requests.length, 1);
  first.resolve(answer()); await f.review.idle();
  assert.equal(f.requests.length, 2);
  assert.equal(f.logs.filter(row => row.outcome === 'ok').length, 1);
  assert.equal(f.logs.at(-1).step, 8);
  f.review.dispose();
});

test('global cap is four across sessions and queued sessions eventually run', async () => {
  const deferreds = Array.from({ length: 6 }, deferred);
  const fixtures = deferreds.map(d => fixture({ evaluate: async () => d.promise }));
  try {
    for (const f of fixtures) { f.execute(); f.execute(); }
    await tick();
    assert.equal(fixtures.reduce((sum, f) => sum + f.requests.length, 0), 4);
    deferreds[0].resolve(answer()); deferreds[1].resolve(answer());
    await tick(); await tick();
    assert.equal(fixtures.reduce((sum, f) => sum + f.requests.length, 0), 6);
    for (const d of deferreds) d.resolve(answer());
    await Promise.all(fixtures.map(f => f.review.idle()));
  } finally { for (const f of fixtures) f.review.dispose(); for (const d of deferreds) d.resolve(answer()); }
});

test('deadline race completes logical idle but holds the physical slot until an abort-ignoring evaluator settles', async () => {
  const raw = deferred();
  const f = fixture({ config: { enabled: true, heartbeatSteps: 2, timeoutMs: 100 }, evaluate: async () => raw.promise });
  f.execute(); f.execute();
  await f.review.idle();
  assert.equal(f.logs.at(-1).outcome, 'error'); assert.equal(f.logs.at(-1).reason, 'timeout');
  assert.equal(f.requests[0].options.signal.aborted, true);
  f.execute(); f.execute(); await f.review.idle(); assert.equal(f.requests.length, 1);
  f.review.close(f.session.id);
  raw.resolve(answer()); await tick();
  assert.equal(f.logs.filter(row => row.outcome === 'ok').length, 0);
  f.review.dispose();
});

for (const invalidate of ['input', 'turn/end', 'compaction/start', 'rewind', 'replace', 'close', 'dispose', 'disabled', 'config-off', 'abort']) {
  test(`in-flight result is suppressed after ${invalidate}`, async () => {
    const raw = deferred(); const controller = new AbortController();
    const f = fixture({ evaluate: async () => raw.promise });
    f.review.enter(f.agent, { turn: 1, step: 1, request: '修复测试 token=private-token', signal: controller.signal });
    f.execute(); f.execute(); await tick(); assert.equal(f.requests.length, 1);
    if (invalidate === 'input') f.review.enter(f.agent, { turn: 1, step: 3, request: '取消之前任务', changed: true });
    else if (invalidate === 'close') f.review.close(f.session.id);
    else if (invalidate === 'dispose') f.review.dispose();
    else if (invalidate === 'disabled') f.setEnabled(false);
    else if (invalidate === 'config-off') f.setConfig({ enabled: false });
    else if (invalidate === 'abort') controller.abort();
    else if (invalidate === 'replace') f.emit('tool/result', { turn: 1, step: 2 }, { surfaceOp: { op: 'replace', startSeq: 1, endSeq: 3 }, sourceEventSeqs: [1] });
    else f.emit(invalidate, { turn: 1 });
    raw.resolve(answer()); await f.review.idle();
    assert.equal(f.logs.filter(row => ['ok', 'concern', 'uncertain'].includes(row.outcome)).length, 0);
    if (invalidate !== 'dispose') {
      assert.equal(f.logs.length, 1, 'issued requests retain a neutral cost record');
      assert.equal(f.logs[0].outcome, 'skipped', 'a canceled check is not a backend failure');
      assert.ok(['stale', 'canceled'].includes(f.logs[0].reason));
      assert.equal(f.logs[0].confidence, undefined, 'the obsolete finding is not published');
      assert.equal(f.counts[0].outcome, 'skipped');
    }
    f.review.dispose();
  });
}

for (const boundary of ['input', 'compaction', 'close']) {
  test(`same-turn budget survives ${boundary} invalidation`, async () => {
    const f = fixture();
    for (let i = 0; i < 12; i++) {
      f.execute(); f.execute(); await f.review.idle();
      if (boundary === 'input') f.review.enter(f.agent, { turn: 1, request: '修复测试 token=private-token', changed: true });
      else if (boundary === 'compaction') f.emit('compaction/end', { turn: 1 });
      else f.review.close(f.session.id);
    }
    assert.equal(f.requests.length, 4);
    f.review.dispose();
  });
}

for (const boundary of ['input', 'compaction']) {
  test(`turn AbortSignal remains bound after ${boundary} invalidates a snapshot`, async () => {
    const raw = deferred(); const controller = new AbortController();
    const f = fixture({ evaluate: async () => raw.promise });
    f.review.enter(f.agent, { turn: 1, request: '修复测试 token=private-token', signal: controller.signal });
    if (boundary === 'input') f.review.enter(f.agent, { turn: 1, request: '修复测试 token=private-token', changed: true, signal: controller.signal });
    else f.emit('compaction/end', { turn: 1 });
    f.execute(); f.execute(); await tick();
    assert.equal(f.requests.length, 1);
    controller.abort();
    await f.review.idle();
    assert.equal(f.requests[0].options.signal.aborted, true);
    assert.equal(f.logs.at(-1).reason, 'canceled');
    raw.resolve(answer()); await tick();
    f.review.dispose();
  });
}

test('pending microtask is discarded on close and a new session instance waits for the old physical lease', async () => {
  const raw = deferred(); let calls = 0;
  const f = fixture({ evaluate: async () => ++calls === 1 ? raw.promise : answer() });
  f.execute(); f.execute(); f.review.close(f.session.id); await f.review.idle(); assert.equal(f.requests.length, 0);
  f.execute(); f.execute(); await tick(); assert.equal(f.requests.length, 1);
  f.review.close(f.session.id);
  const replacement = { session: { id: f.session.id } };
  f.review.enter(replacement, { turn: 1, request: 'new request' });
  for (let step = 1; step <= 2; step++) {
    const base = 100 + step * 3;
    f.review.observe(replacement.session, { seq: base, type: 'tool/call', data: { turn: 1, step, callId: `new${step}`, name: 'read', arguments: '{}' } });
    f.review.observe(replacement.session, { seq: base + 1, type: 'tool/result', data: { turn: 1, step, message: { role: 'tool', toolCallId: `new${step}`, content: [] } } });
    f.review.observe(replacement.session, { seq: base + 2, type: 'step/end', data: { turn: 1, step } });
  }
  await f.review.idle(); assert.equal(f.requests.length, 1);
  raw.resolve(answer()); await tick(); await f.review.idle(); assert.equal(f.requests.length, 2);
  f.review.dispose();
});

test('configuration changes are read again before dispatch and result recording; telemetry is bounded and preserved', async () => {
  let time = 10;
  const f = fixture({ now: () => time, evaluate: async () => {
    time = 30;
    return { ...answer(), telemetry: { requestId: 'request-1', latencyMs: 17, requestBytes: 123, model: 'real-model', inputTokens: 10, outputTokens: 2, backendAttempts: 2 } };
  } });
  f.execute(); f.execute(); f.setConfig({ enabled: false }); await f.review.idle(); assert.equal(f.requests.length, 0);
  f.setConfig({ enabled: true, heartbeatSteps: 2 }); f.execute(); await f.review.idle();
  assert.equal(f.requests.length, 1);
  const row = f.logs.at(-1);
  assert.equal(row.requestId, 'request-1'); assert.equal(row.latencyMs, 17); assert.equal(row.inputTokens, 10); assert.equal(row.outputTokens, 2); assert.equal(row.requestBytes, 123); assert.equal(row.model, 'real-model'); assert.equal(row.backendAttempts, 2);
  assert.equal(row.mode, 'observe'); assert.doesNotMatch(row.task, /private-token/);
  f.review.dispose();
});

test('an undefined or failing settings source keeps process checks off', async () => {
  for (const settings of [async () => undefined, async () => { throw new Error('config unavailable'); }]) {
    const f = fixture({ settings });
    f.execute(); f.execute(); await f.review.idle();
    assert.equal(f.requests.length, 0);
    assert.equal(f.counts.length, 0);
    f.review.dispose();
  }
});
