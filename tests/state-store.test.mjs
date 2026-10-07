import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, writeFile, readFile, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { createStateStore, safeStateId } from '../service/state-store.mjs';

const roots = [];
async function freshDir() {
  const dir = await mkdtemp(join(tmpdir(), 'decision-state-'));
  roots.push(dir);
  return dir;
}
after(() => Promise.all(roots.map(dir => rm(dir, { recursive: true, force: true }))));

test('safeStateId accepts session ids and rejects path-escaping values', () => {
  assert.equal(safeStateId('session-884159c9-83da-45ce-8792-4b0724190f91'), 'session-884159c9-83da-45ce-8792-4b0724190f91');
  assert.equal(safeStateId('a.b_c-1'), 'a.b_c-1');
  assert.equal(safeStateId('../etc/passwd'), undefined);
  assert.equal(safeStateId('a/b'), undefined);
  assert.equal(safeStateId('a..b'), undefined);
  assert.equal(safeStateId('.hidden'), undefined);
  assert.equal(safeStateId(''), undefined);
  assert.equal(safeStateId('x'.repeat(201)), undefined);
  assert.equal(safeStateId(42), undefined);
});

test('save then flush then load round-trips the latest state', async () => {
  const dir = await freshDir();
  const store = createStateStore({ dir });
  store.save('session-1', { attempts: 1 });
  store.save('session-1', { attempts: 7, gate: { allow: 3 } }); // latest wins
  await store.flush();
  const loaded = await store.load('session-1');
  assert.deepEqual(loaded, { attempts: 7, gate: { allow: 3 } });
  // The file is one JSON object with a version + timestamp wrapper.
  const [name] = (await readdir(dir)).filter(n => n.endsWith('.json'));
  assert.equal(name, 'session-1.json');
  const wrapper = JSON.parse(await readFile(join(dir, name), 'utf8'));
  assert.equal(wrapper.v, 1);
  assert.ok(Number.isFinite(wrapper.at));
});

test('load returns undefined for missing, malformed, or unsafe ids', async () => {
  const dir = await freshDir();
  const store = createStateStore({ dir });
  assert.equal(await store.load('session-missing'), undefined);
  await writeFile(join(dir, 'session-bad.json'), '{not json', { mode: 0o600 });
  assert.equal(await store.load('session-bad'), undefined);
  await writeFile(join(dir, 'session-noState.json'), JSON.stringify({ v: 1 }), { mode: 0o600 });
  assert.equal(await store.load('session-noState'), undefined);
  assert.equal(await store.load('../escape'), undefined);
});

test('an unsafe id is never written to disk', async () => {
  const dir = await freshDir();
  const store = createStateStore({ dir });
  store.save('../escape', { attempts: 1 });
  store.save('ok-id', { attempts: 1 });
  await store.flush();
  const names = (await readdir(dir)).filter(n => n.endsWith('.json'));
  assert.deepEqual(names, ['ok-id.json']);
});

test('dispose flushes pending writes and clears the timer', async () => {
  const dir = await freshDir();
  const store = createStateStore({ dir, flushIntervalMs: 60_000 });
  store.save('session-9', { attempts: 42 });
  await store.dispose();
  assert.deepEqual(await store.load('session-9'), { attempts: 42 });
});

test('prune removes state files older than the retention window', async () => {
  const dir = await freshDir();
  const day = 24 * 60 * 60 * 1000;
  // Seed the injected clock from real time so it is comparable to the real file
  // mtimes that prune() reads via stat().
  let clock = Date.now();
  const store = createStateStore({ dir, retentionDays: 30, now: () => clock });
  store.save('session-old', { attempts: 1 });
  await store.flush();
  // Backdate the old file past the retention window, then advance the clock past
  // the hourly prune gate so the next flush prunes it; the new file stays.
  await utimes(join(dir, 'session-old.json'), new Date(clock - 40 * day), new Date(clock - 40 * day));
  clock += 2 * 60 * 60 * 1000;
  store.save('session-new', { attempts: 1 });
  await store.flush();
  const names = (await readdir(dir)).filter(n => n.endsWith('.json'));
  assert.ok(names.includes('session-new.json'));
  assert.ok(!names.includes('session-old.json'), 'the stale file was pruned');
});
