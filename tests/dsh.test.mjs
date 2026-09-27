import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { saveConfig } from '../service/config-store.mjs';
import { apply, inject, name } from '../service/dsh.mjs';

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
      assert.ok(['tools/pre-execute', 'tools/post-execute', 'agent/turn-stopping', 'agent/pre-step'].includes(event));
      if (event === 'tools/pre-execute') listeners.push(listener);
      return () => {};
    }, effect: setup => { disposers.push(setup()); }, inject: () => {} }, { configPath: path });
    assert.equal(listeners.length, 1);
    assert.equal(disposers.length, 3);
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
    assert.equal(turnListeners.length, 1);
    const agent = { steer: message => steered.push(message),
      session: { id: 'check-session', deriveMessages: () => [{ role: 'assistant', content: [{ type: 'text', text: 'final answer' }] }] } };
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

test('per-feature switch off skips a decision point entirely', async () => {
  const path = join(directory, 'features-off.json');
  await saveConfig({ apiKey: 'local-test-key', features: { gate: false, check: false, narrow: false } }, path);
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
    // check off: turn-stopping returns without scoring
    const agent = { session: { id: 'off-session', deriveMessages: () => [{ role: 'assistant', content: [{ type: 'text', text: 'done' }] }] } };
    await turnStopping[0]({ agent, turn: 1, signal: AbortSignal.timeout(1000) });
    // narrow off: pre-step advances without restricting
    let advanced = false;
    const narrowAgent = { session: { id: 'off-session' }, ctx: { tools: { restrict: () => { throw new Error('must not restrict'); } } } };
    await preStep[0]({ agent: narrowAgent, turn: 1, step: 0, signal: AbortSignal.timeout(1000),
      messages: [{ role: 'user', content: [{ type: 'text', text: 'do work' }] }] }, async () => { advanced = true; return { kind: 'enter', messages: [] }; });
    assert.equal(advanced, true);
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
