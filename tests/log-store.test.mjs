import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLogStore } from '../service/log-store.mjs';

const dir = async () => mkdtemp(join(tmpdir(), 'decision-logs-'));

test('log store writes buffered JSONL keyed by day, flushed on dispose', async () => {
  const base = await dir();
  const at = Date.parse('2026-09-27T10:00:00Z');
  const store = createLogStore({ port: 3080, dir: base, now: () => new Date(at) });
  store.append({ kind: 'gate', outcome: 'deny', at });
  store.append({ kind: 'check', outcome: 'ok', score: 2, at });
  await store.dispose();
  const names = await readdir(base);
  assert.deepEqual(names, ['decisions-3080-2026-09-27.jsonl']);
  const lines = (await readFile(join(base, names[0]), 'utf8')).trim().split('\n');
  assert.equal(lines.length, 2);
  assert.deepEqual(JSON.parse(lines[0]), { kind: 'gate', outcome: 'deny', at });
});

test('the file name carries the instance port so instances do not collide', async () => {
  const base = await dir();
  const at = Date.parse('2026-09-27T10:00:00Z');
  const a = createLogStore({ port: 3080, dir: base, now: () => new Date(at) });
  const b = createLogStore({ port: 4000, dir: base, now: () => new Date(at) });
  a.append({ kind: 'narrow', outcome: 'applied', at });
  b.append({ kind: 'narrow', outcome: 'applied', at });
  await a.dispose(); await b.dispose();
  const names = (await readdir(base)).sort();
  assert.deepEqual(names, ['decisions-3080-2026-09-27.jsonl', 'decisions-4000-2026-09-27.jsonl']);
});

test('entries split across day-stamped files by their own timestamp', async () => {
  const base = await dir();
  const store = createLogStore({ port: 3080, dir: base });
  store.append({ kind: 'gate', outcome: 'ask', at: Date.parse('2026-09-26T23:00:00Z') });
  store.append({ kind: 'gate', outcome: 'ask', at: Date.parse('2026-09-27T01:00:00Z') });
  await store.dispose();
  const names = (await readdir(base)).sort();
  assert.deepEqual(names, ['decisions-3080-2026-09-26.jsonl', 'decisions-3080-2026-09-27.jsonl']);
});

test('a full buffer flushes without waiting for the interval', async () => {
  const base = await dir();
  const at = Date.parse('2026-09-27T10:00:00Z');
  const store = createLogStore({ port: 3080, dir: base, maxBuffer: 3, flushIntervalMs: 60_000, now: () => new Date(at) });
  for (let i = 0; i < 3; i++) store.append({ kind: 'gate', outcome: 'deny', at });
  // give the fire-and-forget flush a tick to settle
  await new Promise(resolve => setTimeout(resolve, 20));
  const lines = (await readFile(join(base, 'decisions-3080-2026-09-27.jsonl'), 'utf8')).trim().split('\n');
  assert.equal(lines.length, 3);
  await store.dispose();
});

test('retention prunes this port files older than the window on flush', async () => {
  const base = await dir();
  await writeFile(join(base, 'decisions-3080-2026-08-01.jsonl'), '{}\n');
  await writeFile(join(base, 'decisions-3080-2026-09-27.jsonl'), '{}\n');
  await writeFile(join(base, 'decisions-4000-2026-08-01.jsonl'), '{}\n');
  const at = Date.parse('2026-09-27T10:00:00Z');
  const store = createLogStore({ port: 3080, dir: base, retentionDays: 30, now: () => new Date(at) });
  store.append({ kind: 'gate', outcome: 'deny', at });
  await store.dispose();
  const names = (await readdir(base)).sort();
  // the old 3080 file is pruned; the recent one stays; another port's file is untouched
  assert.deepEqual(names, ['decisions-3080-2026-09-27.jsonl', 'decisions-4000-2026-08-01.jsonl']);
});
