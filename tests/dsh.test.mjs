import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { saveConfig } from '../lib/host/config-store.js';
import { apply, inject, name } from '../lib/host/index.js';

const directory = await mkdtemp(join(tmpdir(), 'decision-plugin-'));
after(() => rm(directory, { recursive: true, force: true }));

test('plugin registers only manual decision actions and skill without agent or web server', async () => {
  const tools = [];
  const skills = [];
  const ctx = { tools: { register: action => tools.push(action) }, skills: { register: skill => skills.push(skill) },
    inject: (names, handler) => { assert.deepEqual(names, ['webServer']); }, effect: () => {} };
  assert.equal(name, 'dsh-decision-layer');
  assert.deepEqual(inject, ['tools', 'skills']);
  await apply(ctx, { configPath: join(directory, 'config.json') });
  assert.ok(tools.some(tool => tool.name === 'decision_evaluate'));
  assert.ok(skills.some(skill => skill.name === 'decision-layer'));
  assert.match(skills[0].content, /decision_evaluate/);
  assert.equal(skills[0].name, 'decision-layer');
});

test('v0.2 gate installs on pre-execute and denies model-rejected dangerous calls', async () => {
  const path = join(directory, 'gate-config.json');
  await saveConfig({ apiKey: 'local-test-key' }, path);
  const listeners = [];
  const guards = [];
  const disposers = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ model: 'jev-latest', answers: {
    verdict: { type: 'choice', choice: 'deny', confidence: 1, probabilities: { allow: 0, ask: 0, deny: 1 } },
  } }));
  try {
    await apply({ tools: { register: () => {}, guard: guard => { guards.push(guard); return () => {}; } }, skills: { register: () => {} }, on: (event, listener) => {
      assert.ok(['tools/pre-execute', 'tools/post-execute', 'agent/turn-stopping', 'agent/pre-step', 'session/event'].includes(event));
      if (event === 'tools/pre-execute') listeners.push(listener);
      return () => {};
    }, effect: setup => { disposers.push(setup()); }, inject: () => {} }, { configPath: path });
    assert.equal(listeners.length, 1);
    assert.equal(disposers.length, 6);
    const exec = { name: 'shell', arguments: { command: 'rm -rf /tmp/build' }, callId: 'gate-call', token: Symbol('token'),
      signal: AbortSignal.timeout(1000), agent: { session: { id: 'gate-session' } } };
    const result = await listeners[0](exec, async () => ({ kind: 'allow' }));
    assert.equal(result.kind, 'deny');
    assert.equal(guards.length, 2);
    assert.match(guards[1](exec), /rejected/);
  } finally { globalThis.fetch = realFetch; }
});

test('v0.3 self-check installs on turn-stopping, observes by default, and steers the payload agent when configured', async () => {
  const observePath = join(directory, 'check-observe.json');
  await saveConfig({ apiKey: 'local-test-key' }, observePath);
  const steerPath = join(directory, 'check-steer.json');
  await saveConfig({ apiKey: 'local-test-key', checkSettings: { mode: 'steer' } }, steerPath);
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ model: 'jev-latest', answers: {
    quality: { type: 'score', score: 0, confidence: 1, probabilities: { '0': 1, '1': 0, '2': 0 } },
  } }));
  const runWith = async configPath => {
    const turnListeners = [];
    const steered = [];
    await apply({ tools: { register: () => {}, guard: () => () => {} }, skills: { register: () => {} },
      on: (event, listener) => { if (event === 'agent/turn-stopping') turnListeners.push(listener); return () => {}; },
      effect: setup => setup(), inject: () => {} }, { configPath });
    assert.equal(turnListeners.length, 2, 'self-check and task-completion listen on turn-stopping');
    const agent = { steer: message => steered.push(message),
      session: { id: 'check-session', deriveMessages: () => [
        { role: 'user', content: [{ type: 'text', text: '修复登录问题' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'final answer' }] },
      ] } };
    // The self-check is the first turn-stopping listener registered.
    await turnListeners[0]({ agent, turn: 1, signal: AbortSignal.timeout(1000) });
    return steered;
  };
  try {
    assert.equal((await runWith(observePath)).length, 0, 'observe mode never steers');
    const steered = await runWith(steerPath);
    assert.equal(steered.length, 1, 'steer mode steers the turn payload agent');
    assert.equal(steered[0].role, 'user');
    assert.ok(Array.isArray(steered[0].content) && steered[0].content[0].type === 'text');
    assert.ok(steered[0].id, 'steer message carries a framework identity');
  } finally { globalThis.fetch = realFetch; }
});

test('v0.4 loop guard denies an identical repeated tool call without a backend call', async () => {
  const path = join(directory, 'loop-config.json');
  await saveConfig({ apiKey: 'local-test-key' }, path);
  const guards = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('loop guard must not call the backend'); };
  try {
    await apply({ tools: { register: () => {}, guard: guard => { guards.push(guard); return () => {}; } }, skills: { register: () => {} },
      on: () => () => {}, effect: setup => setup(), inject: () => {} }, { configPath: path });
    const loopGuard = guards[0];
    const call = { name: 'read', arguments: { path: '/tmp/x' }, agent: { session: { id: 'loop-session' } } };
    assert.equal(loopGuard(call), undefined);
    assert.equal(loopGuard(call), undefined);
    assert.match(loopGuard(call), /repeat|loop/i);
  } finally { globalThis.fetch = realFetch; }
});

test('v0.4b narrowing installs on pre-step and enforces a restriction only in enforce mode', async () => {
  const path = join(directory, 'narrow-config.json');
  await saveConfig({ apiKey: 'local-test-key', narrowSettings: { mode: 'enforce', threshold: 0.5 } }, path);
  const realFetch = globalThis.fetch;
  // Only optional (non-core) tools are judged; core tools (read/write/edit/bash…) are always kept.
  globalThis.fetch = async () => new Response(JSON.stringify({ model: 'jev-latest', answers: {
    web_search: { type: 'noul', noul: 0.9 }, web_fetch: { type: 'noul', noul: 0.8 }, image_gen: { type: 'noul', noul: 0.05 },
  } }));
  const preStep = [];
  const restrictions = [];
  const schemas = [
    { name: 'read', description: 'read a file' }, { name: 'write', description: 'write a file' }, { name: 'edit', description: 'edit a file' }, { name: 'bash', description: 'run a shell command' },
    { name: 'web_search', description: 'search the web' }, { name: 'web_fetch', description: 'fetch a url' }, { name: 'image_gen', description: 'generate an image' },
  ];
  try {
    await apply({ tools: { register: () => {}, guard: () => () => {}, schemas: () => schemas },
      skills: { register: () => {} },
      on: (event, listener) => { if (event === 'agent/pre-step') preStep.push(listener); return () => {}; },
      effect: setup => setup(), inject: () => {} }, { configPath: path });
    assert.equal(preStep.length, 1);
    const agent = { session: { id: 'narrow-session' }, ctx: { tools: { restrict: filter => { restrictions.push(filter); return () => {}; } } } };
    let advanced = false;
    await preStep[0]({ agent, turn: 1, step: 0, signal: AbortSignal.timeout(1000),
      messages: [{ role: 'user', content: [{ type: 'text', text: 'search the web and read a page' }] }] }, async () => { advanced = true; return { kind: 'enter', messages: [] }; });
    assert.equal(advanced, true, 'the step always proceeds');
    assert.equal(restrictions.length, 1, 'enforce mode restricts once');
    // core tools survive; only the irrelevant optional tool (image_gen) is dropped
    assert.deepEqual(restrictions[0].allow.sort(), ['bash', 'edit', 'read', 'web_fetch', 'web_search', 'write']);
  } finally { globalThis.fetch = realFetch; }
});

test('narrowing in observe mode never restricts the agent tools', async () => {
  const path = join(directory, 'narrow-observe.json');
  await saveConfig({ apiKey: 'local-test-key', narrowSettings: { mode: 'observe' } }, path);
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ model: 'jev-latest', answers: {
    web_search: { type: 'noul', noul: 0.9 }, image_gen: { type: 'noul', noul: 0.05 },
  } }));
  const preStep = [];
  const restrictions = [];
  try {
    await apply({ tools: { register: () => {}, guard: () => () => {}, schemas: () => [
      { name: 'read', description: '' }, { name: 'write', description: '' }, { name: 'edit', description: '' }, { name: 'bash', description: '' },
      { name: 'web_search', description: '' }, { name: 'image_gen', description: '' },
    ] },
      skills: { register: () => {} },
      on: (event, listener) => { if (event === 'agent/pre-step') preStep.push(listener); return () => {}; },
      effect: setup => setup(), inject: () => {} }, { configPath: path });
    const agent = { session: { id: 'observe-session' }, ctx: { tools: { restrict: filter => { restrictions.push(filter); return () => {}; } } } };
    await preStep[0]({ agent, turn: 1, step: 0, signal: AbortSignal.timeout(1000),
      messages: [{ role: 'user', content: [{ type: 'text', text: 'search the web' }] }] }, async () => ({ kind: 'enter', messages: [] }));
    assert.equal(restrictions.length, 0, 'observe mode records but never restricts');
  } finally { globalThis.fetch = realFetch; }
});

test('a turn with narrowing switched off releases the previous turn restriction', async () => {
  const path = join(directory, 'narrow-release.json');
  await saveConfig({ apiKey: 'local-test-key', narrowSettings: { mode: 'enforce', threshold: 0.5 } }, path);
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ model: 'jev-latest', answers: {
    web_search: { type: 'noul', noul: 0.9 }, web_fetch: { type: 'noul', noul: 0.8 }, image_gen: { type: 'noul', noul: 0.05 },
  } }));
  const preStep = [];
  const restrictions = [];
  let released = 0;
  try {
    await apply({ tools: { register: () => {}, guard: () => () => {}, schemas: () => [
      { name: 'read', description: '' }, { name: 'write', description: '' }, { name: 'edit', description: '' }, { name: 'bash', description: '' },
      { name: 'web_search', description: '' }, { name: 'web_fetch', description: '' }, { name: 'image_gen', description: '' },
    ] },
      skills: { register: () => {} },
      on: (event, listener) => { if (event === 'agent/pre-step') preStep.push(listener); return () => {}; },
      effect: setup => setup(), inject: () => {} }, { configPath: path });
    const agent = { session: { id: 'release-session' }, ctx: { tools: { restrict: filter => { restrictions.push(filter); return () => { released += 1; }; } } } };
    const step = turn => preStep[0]({ agent, turn, step: 0, signal: AbortSignal.timeout(1000),
      messages: [{ role: 'user', content: [{ type: 'text', text: 'search the web' }] }] }, async () => ({ kind: 'enter', messages: [] }));
    await step(1);
    assert.equal(restrictions.length, 1, 'the first turn restricts');
    assert.equal(released, 0);
    // Turning the feature off must not leave the agent-scoped restriction in force.
    await saveConfig({ apiKey: 'local-test-key', features: { gate: true, check: true, narrow: false, complete: true } }, path);
    await step(2);
    assert.equal(released, 1, 'the previous turn restriction is disposed before the feature check');
    assert.equal(restrictions.length, 1, 'the disabled turn adds no restriction');
  } finally { globalThis.fetch = realFetch; }
});

test('per-feature switch off skips a decision point entirely', async () => {
  const path = join(directory, 'features-off.json');
  await saveConfig({ apiKey: 'local-test-key', features: { gate: false, check: false, narrow: false, complete: false } }, path);
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('disabled features must not call the backend'); };
  const preExecute = [];
  const turnStopping = [];
  const preStep = [];
  try {
    await apply({ tools: { register: () => {}, guard: () => () => {}, schemas: () => [{ name: 'web_search', description: '' }, { name: 'web_fetch', description: '' }] },
      skills: { register: () => {} },
      on: (event, listener) => {
        if (event === 'tools/pre-execute') preExecute.push(listener);
        if (event === 'agent/turn-stopping') turnStopping.push(listener);
        if (event === 'agent/pre-step') preStep.push(listener);
        return () => {};
      }, effect: setup => setup(), inject: () => {} }, { configPath: path });
    // gate off: a dangerous call passes straight through next() without a backend call
    const exec = { name: 'shell', arguments: { command: 'rm -rf /tmp/build' }, callId: 'c', signal: AbortSignal.timeout(1000), agent: { session: { id: 'off-session' } } };
    assert.deepEqual(await preExecute[0](exec, async () => ({ kind: 'allow' })), { kind: 'allow' });
    // check off + complete off: both turn-stopping listeners return without a backend call
    const agent = { session: { id: 'off-session', deriveMessages: () => [
      { role: 'user', content: [{ type: 'text', text: '1. 改配置\n2. 跑测试' }] },
      { role: 'tool', name: 'bash', content: [{ type: 'text', text: 'ok' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'done' }] },
    ] } };
    for (const listener of turnStopping) await listener({ agent, turn: 1, signal: AbortSignal.timeout(1000) });
    // narrow off: pre-step advances without restricting
    let advanced = false;
    const narrowAgent = { session: { id: 'off-session' }, ctx: { tools: { restrict: () => { throw new Error('must not restrict'); } } } };
    await preStep[0]({ agent: narrowAgent, turn: 1, step: 0, signal: AbortSignal.timeout(1000),
      messages: [{ role: 'user', content: [{ type: 'text', text: 'do work' }] }] }, async () => { advanced = true; return { kind: 'enter', messages: [] }; });
    assert.equal(advanced, true);
  } finally { globalThis.fetch = realFetch; }
});

test('v0.5 task-completion installs on turn-stopping and records a per-condition verdict', async () => {
  const path = join(directory, 'complete-config.json');
  await saveConfig({ apiKey: 'local-test-key' }, path);
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ model: 'jev-latest', answers: {
    c0: { type: 'choice', choice: 'satisfied', confidence: 0.9, probabilities: { satisfied: 1, unsatisfied: 0, insufficient_evidence: 0 } },
    c1: { type: 'choice', choice: 'unsatisfied', confidence: 0.9, probabilities: { satisfied: 0, unsatisfied: 1, insufficient_evidence: 0 } },
  } }));
  const turnListeners = [];
  try {
    await apply({ tools: { register: () => {}, guard: () => () => {} }, skills: { register: () => {} },
      on: (event, listener) => { if (event === 'agent/turn-stopping') turnListeners.push(listener); return () => {}; },
      effect: setup => setup(), inject: () => {} }, { configPath: path });
    assert.equal(turnListeners.length, 2, 'self-check and task-completion both listen');
    const agent = { session: { id: 'complete-session', deriveMessages: () => [
      { role: 'user', content: [{ type: 'text', text: '1. 改配置\n2. 跑测试' }] },
      { role: 'tool', name: 'bash', content: [{ type: 'text', text: 'ok' }] },
      { role: 'assistant', content: [{ type: 'text', text: '都做完了' }] },
    ] } };
    // The task-completion listener is the second turn-stopping listener registered.
    const result = await turnListeners[1]({ agent, turn: 1, signal: AbortSignal.timeout(1000) });
    assert.equal(result.evaluated, true);
    assert.equal(result.satisfied, 1);
    assert.equal(result.unsatisfied, 1);
  } finally { globalThis.fetch = realFetch; }
});

test('manual evaluation through registered tool does not increment automatic metrics', async () => {
  const path = join(directory, 'manual-config.json');
  await saveConfig({ apiKey: 'local-test-key' }, path);
  const tools = [];
  const routes = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ model: 'jev-latest',
    answers: { check: { type: 'noul', noul: 0.7 } }, usage: { input_tokens: 2, output_tokens: 1 } }));
  try {
    await apply({ tools: { register: tool => tools.push(tool) }, skills: { register: () => {} },
      inject: (_names, setup) => setup({ webServer: { host: '127.0.0.1', register: route => { routes.push(route); return () => {}; } } }),
    }, { configPath: path });
    const answer = await tools.find(tool => tool.name === 'decision_evaluate').execute({
      state: 'Hello', questions: { check: { type: 'noul', instructions: 'Is this a greeting?' } },
    }, { signal: AbortSignal.timeout(1000) });
    assert.equal(answer.answers.check.noul, 0.7);
    const metric = routes.find(route => route.path.endsWith('/metrics'));
    let serialized;
    await metric.handler({ method: 'GET', url: '/metrics?sessionId=a', headers: { host: 'localhost:3080' }, socket: { remoteAddress: '127.0.0.1' } }, {
      writeHead: () => {}, end: value => { serialized = JSON.parse(value); },
    });
    assert.equal(serialized.value.attempts, 0);
  } finally { globalThis.fetch = realFetch; }
});

// Blast-radius guard: the per-feature flag is read inside the host's
// tools/pre-execute waterfall, where a throw becomes a FAILED tool call (the tool
// never dispatches, so even `read`/`edit` stop working and the user cannot repair
// the file). A config that fails validation must therefore degrade to "all
// features on" and pass the call through, not take the agent's tools away.
test('an invalid config does not fail tool calls; the gate degrades and passes through', async () => {
  const path = join(directory, 'invalid-config.json');
  const { writeFile } = await import('node:fs/promises');
  // bypasses saveConfig's validation on purpose: this is what a hand-edited file
  // with a typo or an out-of-range value looks like on disk
  await writeFile(path, JSON.stringify({ url: 'https://api.typesafe.ai', apiKey: 'k', gateSettings: { minConfidence: 1.5 } }));
  const listeners = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('the backend must not be reachable through an invalid config'); };
  try {
    await apply({ tools: { register: () => {}, guard: () => () => {} }, skills: { register: () => {} },
      on: (event, listener) => { if (event === 'tools/pre-execute') listeners.push(listener); return () => {}; },
      effect: setup => setup(), inject: () => {} }, { configPath: path });
    assert.equal(listeners.length, 1);
    const exec = { name: 'shell', arguments: { command: 'rm -rf /tmp/build' }, callId: 'invalid-config-call', token: Symbol('token'),
      signal: AbortSignal.timeout(1000), agent: { session: { id: 'invalid-config-session' } } };
    // what matters is that this RESOLVES at all: before the guard,
    // featureOn re-threw `Invalid gate settings` out of the hook
    const result = await listeners[0](exec, async () => ({ kind: 'allow' }));
    assert.equal(result.kind, 'allow', 'an unreadable config degrades to pass-through, not a broken tool call');
  } finally { globalThis.fetch = realFetch; }
});

test('the real wiring feeds masked task excerpts into gate and self-check rows, lazily', async () => {
  const path = join(directory, 'wiring-config.json');
  await saveConfig({ apiKey: 'local-test-key' }, path);
  const routes = [];
  const pre = [];
  const stops = [];
  const bodies = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    bodies.push(body);
    const answers = body.questions?.verdict
      ? { verdict: { type: 'choice', choice: 'deny', confidence: 1, probabilities: { allow: 0, ask: 0, deny: 1 } } }
      : { quality: { type: 'score', score: 2, confidence: 1, probabilities: { '0': 0, '1': 0, '2': 1 } } };
    return new Response(JSON.stringify({ model: 'jev-latest', answers }));
  };
  try {
    let reads = 0;
    const agent = { session: { id: 'wiring', deriveMessages: () => {
      reads += 1;
      return [
        { role: 'user', content: [{ type: 'text', text: '上位任务：整理报告' }] },
        { role: 'assistant', content: [{ type: 'text', text: '报告已整理' }] },
        { role: 'user', content: [{ type: 'text', text: '清理构建产物 token=ghp_secret，然后汇报' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'done' }] },
      ];
    } } };
    await apply({
      tools: { register: () => {}, guard: () => () => {} },
      skills: { register: () => {} },
      on: (event, listener) => {
        if (event === 'tools/pre-execute') pre.push(listener);
        if (event === 'agent/turn-stopping') stops.push(listener);
        return () => {};
      },
      effect: setup => setup(),
      inject: (_names, install) => install({ webServer: { port: 0, host: '127.0.0.1', register: route => { routes.push(route); return () => {}; } } }),
    }, { configPath: path });
    assert.equal(pre.length, 1);
    assert.equal(stops.length, 2, 'self-check and completion both listen on turn-stopping');

    const dangerous = { name: 'shell', arguments: { command: 'rm -rf dist' }, callId: 'w1', signal: AbortSignal.timeout(2000), agent };
    const denied = await pre[0](dangerous, () => 'ran');
    assert.equal(denied.kind, 'deny');
    assert.equal(reads, 1, 'the gate derives the task only for a dangerous call');
    const safe = { name: 'read', arguments: { path: '/tmp/x' }, callId: 'w2', signal: AbortSignal.timeout(2000), agent };
    assert.equal(await pre[0](safe, () => 'ran'), 'ran');
    assert.equal(reads, 1, 'a safe call never scans the message history');

    // The turn-stopping listener reads the snapshot and the last assistant text,
    // each from the derived history.
    await stops[0]({ agent, turn: 5, signal: AbortSignal.timeout(2000) });
    assert.equal(reads, 3, 'two reads for the snapshot and the output, none extra for the excerpt');

    const route = routes.find(item => item.path.endsWith('/log'));
    assert.ok(route, 'the management route is registered');
    const req = { method: 'GET', url: '/plugins/dsh-decision-layer/api/log?sessionId=wiring',
      headers: { host: '127.0.0.1:1234' }, socket: { remoteAddress: '127.0.0.1' } };
    const res = { status: 0, body: '', writeHead(status) { this.status = status; return this; }, end(body) { this.body = body; } };
    await route.handler(req, res);
    const entries = JSON.parse(res.body).value.entries;
    const gateRow = entries.find(entry => entry.kind === 'gate');
    const checkRow = entries.find(entry => entry.kind === 'check');
    assert.equal(gateRow.task, '清理构建产物 token=[redacted]，然后汇报');
    assert.equal(gateRow.turn, undefined, 'the gate has no turn number');
    assert.equal(checkRow.task, gateRow.task);
    assert.equal(checkRow.turn, 5);
    // ADR-0016: the self-check now receives the request (masked) so it can detect an
    // off-topic answer. The gate still sends only the call summary, and credentials
    // never leave the machine.
    const outbound = JSON.stringify(bodies);
    assert.doesNotMatch(outbound, /ghp_secret/, 'credentials are masked before the request leaves');
    assert.match(outbound, /token=\[redacted\]/);
    assert.match(JSON.stringify(bodies[1].state), /清理构建产物/, 'the self-check judges the answer against the request');
    assert.match(JSON.stringify(bodies[1].state.background), /上位任务：整理报告/, 'the necessary background is sent with the request');
    assert.doesNotMatch(JSON.stringify(bodies[0].state), /清理构建产物/, 'the gate carries no task text');
  } finally { globalThis.fetch = realFetch; }
});

// ADR-0016: a new real request inside the same turn must re-judge the tool set,
// and the previous agent-scoped restriction must be released first — otherwise
// the earlier allow-list would hide tools the new request needs. A notice
// (background job, time context) is not a new request and must not re-run.
test('a new user request mid-turn re-narrows after releasing the old restriction', async () => {
  const path = join(directory, 'narrow-refresh.json');
  await saveConfig({ apiKey: 'local-test-key', narrowSettings: { mode: 'enforce', threshold: 0.5 } }, path);
  const realFetch = globalThis.fetch;
  const bodies = [];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    bodies.push(body);
    const wantsImage = String(body.state?.request ?? '').includes('图');
    return new Response(JSON.stringify({ model: 'jev-latest', answers: {
      web_search: { type: 'noul', noul: wantsImage ? 0.1 : 0.9 },
      web_fetch: { type: 'noul', noul: wantsImage ? 0.1 : 0.8 },
      image_gen: { type: 'noul', noul: wantsImage ? 0.9 : 0.1 },
      // Kept in both passes so the keep count stays above the low-keep guard.
      weather: { type: 'noul', noul: 0.9 },
      video_search: { type: 'noul', noul: 0.9 },
    } }));
  };
  const preStep = [];
  const restrictions = [];
  let released = 0;
  try {
    await apply({ tools: { register: () => {}, guard: () => () => {}, schemas: () => [
      { name: 'read', description: '' }, { name: 'bash', description: '' },
      { name: 'web_search', description: '' }, { name: 'web_fetch', description: '' }, { name: 'image_gen', description: '' },
      { name: 'weather', description: '' }, { name: 'video_search', description: '' },
    ] },
      skills: { register: () => {} },
      on: (event, listener) => { if (event === 'agent/pre-step') preStep.push(listener); return () => {}; },
      effect: setup => setup(), inject: () => {} }, { configPath: path });
    // Record the release count at the moment each restriction is installed: the
    // second pass must be installed only after the first was released.
    const order = [];
    const agent = { session: { id: 'refresh-session', deriveMessages: () => history },
      ctx: { tools: { restrict: filter => {
        restrictions.push(filter);
        order.push(`restrict@${released}`);
        return () => { released += 1; order.push('release'); };
      } } } };
    const history = [];
    const step = async (messages, stepNo) => {
      let advanced = false;
      await preStep[0]({ agent, turn: 3, step: stepNo, signal: AbortSignal.timeout(2000), messages },
        async () => { advanced = true; return { kind: 'enter', messages: [] }; });
      assert.equal(advanced, true);
    };
    await step([{ role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '搜索网页' }] }], 0);
    assert.equal(restrictions.length, 1, 'the first step narrows');
    assert.deepEqual(restrictions[0].allow.sort(), ['bash', 'read', 'video_search', 'weather', 'web_fetch', 'web_search']);

    // A background notice in the same turn must not re-judge or release.
    const before = bodies.length;
    await step([{ role: 'user', source: { kind: 'background-job' }, content: [{ type: 'text', text: 'job finished' }] }], 1);
    assert.equal(bodies.length, before, 'a notice never calls the adjudication backend');
    assert.equal(released, 0, 'a notice keeps the existing restriction');

    // The turn's own activity must reach the next pass as progress.
    history.push(
      { role: 'assistant', content: [{ type: 'tool-call', id: 'searched', name: 'bash', arguments: '{"command":"curl example.com"}' }] },
      { role: 'tool', toolCallId: 'searched', source: { kind: 'tool', callId: 'searched' }, content: [{ type: 'text', text: 'ok' }] },
    );

    // A real new request must release first, then narrow against the full set.
    const firstNewRequest = bodies.length;
    await step([{ role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '生成一张图' }] }], 2);
    assert.equal(released, 1, 'the old restriction is released before re-judging');
    assert.deepEqual(order, ['restrict@0', 'release', 'restrict@1'], 'release happens before the new restriction');
    assert.equal(restrictions.length, 2, 'the new request narrows again');
    assert.deepEqual(restrictions[1].allow.sort(), ['bash', 'image_gen', 'read', 'video_search', 'weather']);
    assert.equal(bodies[firstNewRequest].state.progress[0].tool, 'bash', 'recent progress reaches the narrowing request');
    assert.equal(bodies[firstNewRequest].state.progress[0].command, 'curl example.com');
  } finally { globalThis.fetch = realFetch; }
});

// ADR-0016: completion evidence is scoped to the current turn. An earlier task's
// successful tool result must not vouch for this turn's unmet condition.
test('task completion evaluates only the current turn evidence and request', async () => {
  const path = join(directory, 'complete-scope.json');
  await saveConfig({ apiKey: 'local-test-key' }, path);
  const realFetch = globalThis.fetch;
  const bodies = [];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    bodies.push(body);
    return new Response(JSON.stringify({ model: 'jev-latest', answers: {
      c0: { type: 'choice', choice: 'satisfied', confidence: 0.9, probabilities: { satisfied: 1, unsatisfied: 0, insufficient_evidence: 0 } },
      c1: { type: 'choice', choice: 'unsatisfied', confidence: 0.9, probabilities: { satisfied: 0, unsatisfied: 1, insufficient_evidence: 0 } },
    } }));
  };
  const preStep = [];
  const stops = [];
  const history = [
    { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '上一个任务' }] },
    { role: 'assistant', content: [{ type: 'tool-call', id: 'old', name: 'bash', arguments: '{"command":"make"}' }] },
    { role: 'tool', toolCallId: 'old', source: { kind: 'tool', callId: 'old' }, content: [{ type: 'text', text: 'old build ok' }], isError: false },
    { role: 'assistant', content: [{ type: 'text', text: '上一任务完成' }] },
  ];
  try {
    await apply({ tools: { register: () => {}, guard: () => () => {} }, skills: { register: () => {} },
      on: (event, listener) => {
        if (event === 'agent/pre-step') preStep.push(listener);
        if (event === 'agent/turn-stopping') stops.push(listener);
        return () => {};
      }, effect: setup => setup(), inject: () => {} }, { configPath: path });
    const agent = { session: { id: 'scope-session', deriveMessages: () => history } };
    await preStep[0]({ agent, turn: 2, step: 0, signal: AbortSignal.timeout(2000),
      messages: [{ role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '1. 改配置\n2. 跑测试' }] }] },
    async () => ({ kind: 'enter', messages: [] }));
    history.push(
      { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '1. 改配置\n2. 跑测试' }] },
      { role: 'assistant', content: [{ type: 'tool-call', id: 'new', name: 'bash', arguments: '{"command":"npm test"}' }] },
      { role: 'tool', toolCallId: 'new', source: { kind: 'tool', callId: 'new' }, content: [{ type: 'text', text: '1 failing' }], isError: true },
      { role: 'assistant', content: [{ type: 'text', text: '都做完了' }] },
    );
    const result = await stops[1]({ agent, turn: 2, signal: AbortSignal.timeout(2000) });
    assert.equal(result.evaluated, true);
    assert.equal(result.unsatisfied, 1);
    const state = bodies.at(-1).state;
    assert.equal(state.request, '1. 改配置\n2. 跑测试');
    assert.match(JSON.stringify(state.background), /上一个任务/, 'the pre-turn context is sent as background only');
    assert.equal(state.toolEvidence.length, 1, 'only this turn evidence is sent');
    assert.equal(state.toolEvidence[0].command, 'npm test');
    assert.equal(state.toolEvidence[0].outcome, 'error');
    assert.equal(state.toolEvidence[0].result, '1 failing');
  } finally { globalThis.fetch = realFetch; }
});

// The host resolves a step's tool set before agent/pre-step runs, so a restriction
// must be lifted when the turn ends — not at the next turn's first step, which
// would already have been resolved under the stale allow-list (and a one-step
// turn would never recover). turn/end is written in the loop's finally, so it
// also covers aborted and failed turns.
test('turn/end releases the restriction before the next turn resolves tools', async () => {
  const path = join(directory, 'narrow-turn-end.json');
  await saveConfig({ apiKey: 'local-test-key', narrowSettings: { mode: 'enforce', threshold: 0.5 } }, path);
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ model: 'jev-latest', answers: {
    web_search: { type: 'noul', noul: 0.9 }, web_fetch: { type: 'noul', noul: 0.9 },
    image_gen: { type: 'noul', noul: 0.1 }, weather: { type: 'noul', noul: 0.9 }, video_search: { type: 'noul', noul: 0.9 },
  } }));
  const preStep = [];
  const sessionEvents = [];
  const restrictions = [];
  let released = 0;
  try {
    await apply({ tools: { register: () => {}, guard: () => () => {}, schemas: () => [
      { name: 'read', description: '' }, { name: 'bash', description: '' },
      { name: 'web_search', description: '' }, { name: 'web_fetch', description: '' }, { name: 'image_gen', description: '' },
      { name: 'weather', description: '' }, { name: 'video_search', description: '' },
    ] },
      skills: { register: () => {} },
      on: (event, listener) => {
        if (event === 'agent/pre-step') preStep.push(listener);
        if (event === 'session/event') sessionEvents.push(listener);
        return () => {};
      },
      effect: setup => setup(), inject: () => {} }, { configPath: path });
    assert.equal(sessionEvents.length, 1, 'one turn/end listener releases the restriction');
    const agent = { session: { id: 'turn-end-session', deriveMessages: () => [] },
      ctx: { tools: { restrict: filter => { restrictions.push(filter); return () => { released += 1; }; } } } };
    const step = turn => preStep[0]({ agent, turn, step: 0, signal: AbortSignal.timeout(2000),
      messages: [{ role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '搜索网页' }] }] },
    async () => ({ kind: 'enter', messages: [] }));
    await step(1);
    assert.equal(restrictions.length, 1);
    assert.equal(released, 0);
    // Another session's turn/end must not lift this session's restriction.
    sessionEvents[0]({ id: 'other-session' }, { type: 'turn/end' });
    assert.equal(released, 0);
    sessionEvents[0]({ id: 'turn-end-session' }, { type: 'turn/end' });
    assert.equal(released, 1, 'turn end releases the restriction');
    await step(2);
    assert.equal(released, 1, 'the next turn starts without a stale restriction entry');
    assert.equal(restrictions.length, 2, 'the new turn narrows afresh');
  } finally { globalThis.fetch = realFetch; }
});
