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
const annotations = [];
const analyzeCalls = [];
const listRowsCalls = [];
const routes = createManagerRoutes({ path, sessions, env: {},
  backend: { evaluate: async () => ({ model: 'jev-latest', answers: {}, usage: {} }) },
  logStore: { appendAnnotation: async entry => { annotations.push(entry); return entry; } },
  analyze: async sessionId => { analyzeCalls.push(sessionId); return { totalDecisions: 0, profile: {}, trendBacktest: {}, annotations: { rated: 0 } }; },
  listRows: async (sessionId, opts) => { listRowsCalls.push({ sessionId, ...opts }); return { entries: [{ id: 'd1', at: 1, kind: 'gate', outcome: 'deny' }], total: 150, page: opts.page, pageSize: opts.pageSize, pages: 2 }; } });
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

test('logs analysis route returns aggregates for the session, never raw rows', async () => {
  const response = await json(await fetch(`${base}/logs?sessionId=s1`));
  assert.equal(response.ok, true);
  assert.equal(response.value.totalDecisions, 0);
  assert.ok(response.value.profile);
  assert.ok(response.value.annotations);
  assert.deepEqual(analyzeCalls.at(-1), 's1', 'analyze is called with the session id');
  // no sessionId is a bad request
  assert.equal((await fetch(`${base}/logs`)).status, 400);
});

test('annotate appends a validated annotation and rejects bad input', async () => {
  const ok = await fetch(`${base}/annotate`, { method: 'POST', headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ target: 'decision-1', rating: 'good', sessionId: 's1' }) });
  assert.equal(ok.status, 200);
  assert.equal(annotations.at(-1).target, 'decision-1');
  assert.equal(annotations.at(-1).rating, 'good');
  assert.equal(annotations.at(-1).kind, 'annotation');
  const badRating = await fetch(`${base}/annotate`, { method: 'POST', headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ target: 'd', rating: 'meh', sessionId: 's1' }) });
  assert.equal(badRating.status, 400);
  const noTarget = await fetch(`${base}/annotate`, { method: 'POST', headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ rating: 'good', sessionId: 's1' }) });
  assert.equal(noTarget.status, 400);
  // cross-origin annotate is rejected
  const cross = await fetch(`${base}/annotate`, { method: 'POST', headers: { origin: 'https://attacker.test', 'content-type': 'application/json' },
    body: JSON.stringify({ target: 'd', rating: 'good', sessionId: 's1' }) });
  assert.equal(cross.status, 403);
});

test('CSRF guard: a cross-site fetch-metadata request is rejected even from loopback', async () => {
  const response = await fetch(`${base}/session?sessionId=s1`, { headers: { 'sec-fetch-site': 'cross-site' } });
  assert.equal(response.status, 403, 'sec-fetch-site: cross-site is refused');
});

test('CSRF guard: a mutation with a non-JSON content-type is rejected', async () => {
  // A form/text content-type is the classic simple-request CSRF vector; readBody
  // requires application/json, so the PUT is refused before any state change.
  const response = await fetch(`${base}/session`, { method: 'PUT', headers: { origin, 'content-type': 'text/plain' },
    body: JSON.stringify({ sessionId: 's1', enabled: false }) });
  assert.equal(response.status, 400);
});

test('CSRF guard: an over-limit request body is rejected', async () => {
  // Bodies above BODY_LIMIT (32 KiB) are refused so a client cannot stream an
  // unbounded payload into the annotation writer.
  const huge = 'x'.repeat(40 * 1024);
  const response = await fetch(`${base}/annotate`, { method: 'POST', headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ target: huge, rating: 'good', sessionId: 's1' }) });
  assert.equal(response.status, 400);
});

test('CSRF guard: an origin-free non-GET mutation is rejected', async () => {
  // The origin===undefined branch only trusts GET; a PUT with no Origin header
  // (a non-browser or stripped-origin caller) cannot mutate state.
  let code;
  const putRoute = routes.find(route => route.path.endsWith('/session'));
  await putRoute.handler({ method: 'PUT', headers: { host: `127.0.0.1:${server.address().port}`, 'content-type': 'application/json' },
    socket: { remoteAddress: '127.0.0.1' } }, { writeHead: status => { code = status; }, end: () => {} });
  assert.equal(code, 403, 'a non-GET request without an Origin is refused');
});

test('an internal analysis fault surfaces as 500, not a client 400', async () => {
  // A validated /logs request whose analyzer throws is an internal fault; the
  // client must see 500, not a misleading 400.
  const faulting = createManagerRoutes({ path, sessions, env: {},
    backend: { evaluate: async () => ({ model: 'x', answers: {}, usage: {} }) },
    analyze: async () => { throw new Error('disk gone'); } })
    .find(route => route.path.endsWith('/logs'));
  let code;
  await faulting.handler({ method: 'GET', url: '/plugins/dsh-decision-layer/api/logs?sessionId=s1',
    headers: { host: `127.0.0.1:${server.address().port}`, origin }, socket: { remoteAddress: '127.0.0.1' } },
    { writeHead: status => { code = status; }, end: () => {} });
  assert.equal(code, 500, 'an analyzer throw is an internal error');
});

test('logrows returns a paginated page and forwards page/pageSize', async () => {
  const response = await fetch(`${base}/logrows?sessionId=s1&page=2&pageSize=100`);
  const body = await json(response);
  assert.equal(body.ok, true);
  assert.equal(body.value.total, 150);
  assert.equal(body.value.pages, 2);
  assert.equal(body.value.entries.length, 1);
  assert.deepEqual(listRowsCalls.at(-1), { sessionId: 's1', page: 2, pageSize: 100 });
});

test('logrows defaults page/pageSize when the query is absent or malformed', async () => {
  await json(await fetch(`${base}/logrows?sessionId=s1`));
  assert.deepEqual(listRowsCalls.at(-1), { sessionId: 's1', page: 1, pageSize: 100 });
  await json(await fetch(`${base}/logrows?sessionId=s1&page=abc&pageSize=xyz`));
  assert.deepEqual(listRowsCalls.at(-1), { sessionId: 's1', page: 1, pageSize: 100 });
});

test('logrows requires a sessionId', async () => {
  const response = await fetch(`${base}/logrows`);
  assert.equal(response.status, 400);
});
