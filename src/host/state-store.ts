import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isObject } from './types.js';

export function stateDir(): string {
  return join(homedir(), '.config', 'dsh-decision-layer', 'state');
}

// A session id is persisted only when it is safe as a single path segment, so a
// crafted id can never escape the state directory. dsh session ids are
// `session-<uuid>`, which pass; anything with separators, leading dot, `..`, or
// an unreasonable length is skipped (that session simply stays in-memory only).
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;
export function safeStateId(id: unknown): string | undefined {
  return typeof id === 'string' && SAFE_ID.test(id) && !id.includes('..') ? id : undefined;
}

export type StateStoreOptions = {
  dir?: string;
  flushIntervalMs?: number;
  retentionDays?: number;
  now?: () => number;
};

// Durable per-session mirror of the live decision counters + recent log. One
// small JSON file per session id (`<id>.json`), written debounced and atomically
// (unique tmp + rename), pruned by age on an occasional flush. This is separate
// from the JSONL research log: it exists only so a resumed session's live panel
// (dock count, metric cards, recent log) keeps its totals across an instance
// restart instead of resetting to zero. All IO is best-effort — a failure never
// throws into the decision path; at worst the panel loses the last few seconds
// of counters.
export function createStateStore({ dir = stateDir(), flushIntervalMs = 2000,
  retentionDays = 30, now = () => Date.now() }: StateStoreOptions = {}) {
  const pending = new Map<string, Record<string, unknown>>(); // id -> latest live state awaiting a flush
  let timer: ReturnType<typeof setTimeout> | undefined;
  let flushing = false;
  let lastPrune = 0;

  const fileFor = (id: string): string => join(dir, `${id}.json`);

  const writeOne = async (id: string, state: Record<string, unknown>): Promise<void> => {
    const temporary = join(dir, `${id}.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, `${JSON.stringify({ v: 1, at: now(), state })}\n`, { mode: 0o600, flag: 'wx' });
      await rename(temporary, fileFor(id));
    } finally {
      await rm(temporary, { force: true }).catch(() => {});
    }
  };

  const prune = async (): Promise<void> => {
    let names: string[];
    try { names = await readdir(dir); } catch { return; }
    const cutoff = now() - retentionDays * 24 * 60 * 60 * 1000;
    await Promise.all(names.map(async name => {
      if (!name.endsWith('.json')) return;
      try {
        const info = await stat(join(dir, name));
        if (info.mtimeMs < cutoff) await rm(join(dir, name), { force: true }).catch(() => {});
      } catch { /* a file vanishing under us is fine */ }
    }));
  };

  const flush = async (): Promise<void> => {
    if (flushing || pending.size === 0) return;
    flushing = true;
    // Snapshot ids now; each state is JSON.stringify'd at write time so the file
    // reflects the latest counters, which is exactly what we want.
    const batch = [...pending.entries()];
    pending.clear();
    try {
      await mkdir(dir, { recursive: true, mode: 0o700 });
      for (const [id, state] of batch) await writeOne(id, state).catch(() => {});
      // Prune at most about once per hour of activity, not on every flush.
      if (now() - lastPrune > 60 * 60 * 1000) { lastPrune = now(); await prune(); }
    } catch { /* best effort; a dropped flush must never break the decision path */ }
    finally { flushing = false; }
  };

  return {
    // Read a session's persisted state, or undefined when there is no usable file.
    async load(id: unknown): Promise<Record<string, unknown> | undefined> {
      const safe = safeStateId(id);
      if (!safe) return undefined;
      try {
        const parsed: unknown = JSON.parse(await readFile(fileFor(safe), 'utf8'));
        if (isObject(parsed) && isObject(parsed.state)) {
          return parsed.state;
        }
      } catch { /* missing or malformed: no seed, start empty */ }
      return undefined;
    },
    // Register the latest live state for a session and schedule a debounced flush.
    save(id: unknown, state: unknown): void {
      const safe = safeStateId(id);
      if (!safe || state === null || typeof state !== 'object' || Array.isArray(state)) return;
      pending.set(safe, state as Record<string, unknown>);
      if (!timer) timer = setTimeout(() => { timer = undefined; void flush(); }, flushIntervalMs);
    },
    flush,
    dispose(): Promise<void> {
      if (timer) { clearTimeout(timer); timer = undefined; }
      return flush();
    },
  };
}
