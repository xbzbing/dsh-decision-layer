import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { after, test } from 'node:test';
import { createManagerRoutes } from '../service/manager-api.mjs';
import { createSessionState } from '../service/session-state.mjs';

const directory = await mkdtemp(join(tmpdir(), 'decision-http-'));
after(() => rm(directory, { recursive: true, force: true }));
const path = join(directory, 'config.json');
const sessions = createSessionState();
const routes = createManagerRoutes({ path, sessions, env: {}, backend: { evaluate: async () => ({ model: 'jev-latest', answers: {}, usage: {} }) } });
const server = createServer((req, res) => {
  const route = routes.find(route => route.path === new URL(req.url, 'http://localhost').pathname);
  if (!route) { res.writeHead(404).end(); return; }
  void route.handler(req, res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
after(() => new Promise(resolve => server.close(resolve)));
const base = `http://127.0.0.1:${server.address().port}/plugins/dsh-decision-layer/api`;
const json = response => response.json();
const origin = new URL(base).origin;

test('read default configuration and session state without disclosing credentials', async () => {
  const config = await json(await fetch(`${base}/config`));
  assert.equal(config.ok, true);
  assert.equal(config.value.apiKeySet, false);
  assert.equal(config.value.effectiveUrl, 'https://api.typesafe.ai');
  const response = await fetch(`${base}/session?sessionId=s1`);
  assert.equal((await json(response)).value.enabled, true);
  const count = await json(await fetch(`${base}/metrics?sessionId=s1`));
  assert.equal(count.value.hasAutomaticDecisions, false);
  const log = await json(await fetch(`${base}/log?sessionId=s1`));
  assert.equal(log.ok, true);
  assert.deepEqual(log.value.entries, []);
});

test('origin-free mutations cannot change backend or trigger a probe', async () => {
  const update = await fetch(`${base}/config`, { method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: 'http://attacker.test', confirmHttpUrl: 'http://attacker.test' }) });
  assert.equal(update.status, 403);
  const probe = await fetch(`${base}/probe`, { method: 'POST' });
  assert.equal(probe.status, 403);
  assert.notEqual((await json(await fetch(`${base}/config`))).value.url, 'http://attacker.test');
});

test('routes refuse remote binding even when an Origin matches', async () => {
  const publicRoute = createManagerRoutes({ path, sessions, backend: { evaluate: async () => { throw new Error('must not run'); } }, bindHost: '0.0.0.0' })
    .find(route => route.path.endsWith('/probe'));
  let code;
  await publicRoute.handler({ method: 'POST', headers: { host: `127.0.0.1:${server.address().port}`, origin },
    socket: { remoteAddress: '127.0.0.1' } }, { writeHead: status => { code = status; }, end: () => {} });
  assert.equal(code, 403);
});

test('save key, reject cross-origin and preserve manual zero counters', async () => {
  const submit = await fetch(`${base}/config`, { method: 'PUT', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ apiKey: 'secret', model: 'dev' }) });
  assert.equal(submit.status, 200);
  assert.ok(!(await submit.text()).includes('secret'));
  const crossOrigin = await fetch(`${base}/session`, { method: 'PUT', headers: { origin: 'https://attacker.test', 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: 's1', enabled: false }) });
  assert.equal(crossOrigin.status, 403);
  const valid = await fetch(`${base}/session`, { method: 'PUT', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: 's1', enabled: false }) });
  assert.equal(valid.status, 200);
  assert.equal((await json(await fetch(`${base}/metrics?sessionId=s1`))).value.attempts, 0);
  const probe = await json(await fetch(`${base}/probe`, { method: 'POST', headers: { origin } }));
  assert.equal(probe.value.connected, true);
  assert.equal((await json(await fetch(`${base}/metrics?sessionId=s1`))).value.attempts, 0);
});
