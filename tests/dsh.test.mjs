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
      assert.ok(['tools/pre-execute', 'tools/post-execute'].includes(event));
      if (event === 'tools/pre-execute') listeners.push(listener);
      return () => {};
    }, effect: setup => { disposers.push(setup()); }, inject: () => {} }, { configPath: path });
    assert.equal(listeners.length, 1);
    assert.equal(disposers.length, 1);
    const exec = { name: 'shell', arguments: { command: 'rm -rf /tmp/build' }, callId: 'gate-call', token: Symbol('token'),
      signal: AbortSignal.timeout(1000), agent: { session: { id: 'gate-session' } } };
    const result = await listeners[0](exec, async () => ({ kind: 'allow' }));
    assert.equal(result.kind, 'deny');
    assert.equal(guards.length, 1);
    assert.match(guards[0](exec), /rejected/);
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
