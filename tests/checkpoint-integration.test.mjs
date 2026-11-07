import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
// Defaults to the repository's supported peer; an explicit path also verifies
// the exact installed host, without mounting or restarting its live profile.
const runtimeRoot = process.env.DSH_CHECKPOINT_TEST_RUNTIME_ROOT;
const runtimePackage = name => runtimeRoot ? pathToFileURL(join(runtimeRoot, 'node_modules', '@deepseek-ai', name, 'lib', 'index.js')).href : `@deepseek-ai/${name}`;
const { Context } = await import(runtimePackage('cordis'));
const { SessionStore } = await import(runtimePackage('dsh-session'));
const { createUserMessage, createToolResultMessage } = await import(runtimePackage('dsh-llm'));
import { apply } from '../lib/host/index.js';
import { saveConfig } from '../lib/host/config-store.js';

const tick = () => new Promise(done => setTimeout(done, 5));
async function waitFor(check) {
  for (let i = 0; i < 400; i++) { const value = await check(); if (value) return value; await tick(); }
  assert.fail('isolated checkpoint did not settle');
}

async function fixture(enabled) {
  const directory = await mkdtemp(join(tmpdir(), 'checkpoint-integration-'));
  const configPath = join(directory, 'config.json');
  const config = { apiKey: 'isolated-test-key', features: { gate: false, check: false, complete: false, narrow: false },
    checkpointSettings: { enabled, heartbeatSteps: 2, failureThreshold: 3, timeoutMs: 1000 } };
  await saveConfig(config, configPath);
  const ctx = new Context();
  const sessionFork = ctx.plugin(SessionStore);
  await new Promise(done => setImmediate(done));
  const steps = [], disposers = [], routes = [];
  await apply({ tools: { register() {}, guard() {} }, skills: { register() {} },
    on(event, callback) { if (event === 'agent/pre-step') steps.push(callback); return ctx.on(event, callback); },
    effect(install) { const dispose = install(); if (dispose) disposers.push(dispose); },
    inject(_keys, install) { const dispose = install({ webServer: { port: 0, host: '127.0.0.1', register(route) { routes.push(route); return () => {}; } } }); if (dispose) disposers.push(dispose); },
  }, { configPath, storageDir: directory });
  const session = ctx.sessions.create(`integration-${randomUUID()}`);
  const agent = { session, steer() { assert.fail('checkpoint must not steer'); }, inject() { assert.fail('checkpoint must not inject'); } };
  const abort = new AbortController();
  let step = 0;
  session.append('turn/start', { turn: 1 });
  async function execute({ name = 'read', request, kind = 'user', text = 'PRIVATE FILE RESULT', args = { file_path: 'report.md' } } = {}) {
    step++;
    const messages = request === undefined ? [] : [createUserMessage({ content: [{ type: 'text', text: request }], source: { kind } })];
    const decision = await steps[0]({ agent, turn: 1, step, messages, signal: abort.signal }, async () => ({ kind: 'enter', messages }));
    assert.equal(decision.kind, 'enter');
    assert.deepEqual(decision.messages, messages, 'read-only checkpoints leave model messages intact');
    session.append('step/start', { turn: 1, step });
    for (const message of messages) session.append('user/message', message, { surfaceOp: 'append' });
    const callId = `call-${step}`;
    const call = session.append('tool/call', { turn: 1, step, callId, name, arguments: JSON.stringify(args) });
    session.append('tool/result', { turn: 1, step, message: createToolResultMessage({ callId, content: [{ type: 'text', text }], isError: false }) },
      { surfaceOp: 'append', sourceEventSeqs: [call.seq] });
    session.append('step/end', { turn: 1, step });
  }
  async function request(suffix, body) {
    const route = routes.find(route => route.path.endsWith(`/${suffix}`));
    const req = { method: body ? 'PUT' : 'GET', url: `/plugins/dsh-decision-layer/api/${suffix}?sessionId=${session.id}`,
      headers: { host: '127.0.0.1:1234', ...(body ? { origin: 'http://127.0.0.1:1234', 'content-type': 'application/json' } : {}) }, socket: { remoteAddress: '127.0.0.1' },
      async *[Symbol.asyncIterator]() { if (body) yield Buffer.from(JSON.stringify(body)); } };
    const res = { writeHead(status) { this.status = status; }, end(value) { this.body = value; } };
    await route.handler(req, res);
    assert.equal(res.status, 200, res.body);
    return JSON.parse(res.body).value;
  }
  return { directory, config, configPath, session, agent, abort, execute, request,
    async dispose(checkStored) {
      try {
        for (const dispose of disposers.reverse()) await dispose();
        if (checkStored) await checkStored(directory);
      } finally {
        await sessionFork.dispose();
        // Verify the exact managed temporary target before recursive cleanup.
        assert.ok(resolve(directory).startsWith(`${resolve(tmpdir())}/checkpoint-integration-`));
        await rm(directory, { recursive: true, force: true });
      }
    } };
}

test('real Session event feed produces mid-turn read-only checks, persistence and safe analysis', async () => {
  const previous = globalThis.fetch;
  const outbound = [];
  globalThis.fetch = async (_url, options) => {
    outbound.push(JSON.parse(options.body));
    return new Response(JSON.stringify({ model: 'local-test', answers: { progress: { type: 'choice', choice: 'concern', confidence: 0.9,
      probabilities: { on_track: 0.1, concern: 0.9, insufficient_evidence: 0 } } }, usage: { input_tokens: 12, output_tokens: 2 } }));
  };
  const f = await fixture(true);
  try {
    await f.execute({ request: '评审报告 token=private-token' });
    await f.execute();
    assert.equal(outbound.length, 0, 'publishing step/end never synchronously calls the backend');
    const state = await waitFor(async () => { const value = await f.request('session'); return value.checkpoint?.attempts === 1 ? value : undefined; });
    assert.equal(state.checkpoint.concern, 1, JSON.stringify(state.log));
    assert.equal(state.check, undefined, 'process findings do not enter final-reply trends');
    assert.equal(state.log[0].turn, 1);
    assert.equal(state.log[0].step, 2);
    assert.equal(state.log[0].backendAttempts, 1);
    assert.doesNotMatch(JSON.stringify(outbound), /PRIVATE FILE RESULT|private-token/);
    assert.match(JSON.stringify(outbound), /\[redacted\]/);
    assert.ok(outbound[0].state.evidence.length > 0);
    // Disposal flushes the isolated JSONL sink; no real profile is involved.
    f.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } });
    await tick();
    const snapshot = await f.request('session');
    assert.equal(snapshot.attempts, 0, 'process checks never enter the automatic-decision total');
    assert.equal(snapshot.checkpoint.attempts, 1);
  } finally {
    globalThis.fetch = previous;
    await f.dispose(async directory => {
      const files = await readdir(join(directory, 'logs'));
      const persisted = (await Promise.all(files.map(file => readFile(join(directory, 'logs', file), 'utf8')))).join('');
      assert.match(persisted, /"kind":"checkpoint"/);
      assert.doesNotMatch(persisted, /PRIVATE FILE RESULT|private-token|"evidence":/);
    });
  }
});

test('default-off and notice-only real session turns send no requests; session toggle cancels pending work', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => assert.fail('disabled or unbound checkpoints must not call a backend');
  const off = await fixture(false);
  try {
    await off.execute({ request: '任务' }); await off.execute(); await tick();
    assert.equal((await off.request('session')).attempts, 0);
    await saveConfig({ ...off.config, checkpointSettings: { ...off.config.checkpointSettings, enabled: true } }, off.configPath);
    await off.request('session', { sessionId: off.session.id, enabled: false });
    await off.execute(); await off.execute(); await tick();
    assert.equal((await off.request('session')).attempts, 0);
  } finally { await off.dispose(); }
  const notice = await fixture(true);
  try {
    await notice.execute({ request: 'background notification', kind: 'background-job' }); await notice.execute(); await tick();
    assert.equal((await notice.request('session')).attempts, 0);
  } finally { await notice.dispose(); globalThis.fetch = previous; }
});

test('real bash success without a marker plus an edit drives verification-after-change', async () => {
  const previous = globalThis.fetch;
  const outbound = [];
  globalThis.fetch = async (_url, options) => {
    outbound.push(JSON.parse(options.body));
    return new Response(JSON.stringify({ model: 'local-test', answers: { progress: { type: 'choice', choice: 'concern', confidence: 0.9,
      probabilities: { on_track: 0.1, concern: 0.9, insufficient_evidence: 0 } } } }));
  };
  const f = await fixture(true);
  try {
    await f.execute({ request: '修好测试', name: 'bash', args: { command: 'npm test' }, text: 'all tests passed' });
    await f.execute({ name: 'edit', args: { file_path: 'src/a.ts' }, text: 'patched' });
    const state = await waitFor(async () => {
      const value = await f.request('session');
      return value.checkpoint?.attempts >= 1 ? value : undefined;
    });
    assert.ok(state.log.some(row => row.trigger === 'verification_after_change'),
      'a clean markerless shell command followed by an edit is an expired verification');
    const evidence = outbound.flatMap(body => body.state?.evidence ?? []);
    assert.ok(evidence.some(item => item.tool === 'bash' && item.outcome === 'ok'),
      'a markerless shell result is a clean exit, not unknown');
  } finally { globalThis.fetch = previous; await f.dispose(); }
});
