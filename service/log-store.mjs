import { mkdir, appendFile, readdir, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function logsDir() {
  return join(homedir(), '.config', 'dsh-decision-layer', 'logs');
}

const dayStamp = date => date.toISOString().slice(0, 10);

// Batched, rolling JSONL log writer keyed by the running instance's port. One
// file per UTC day: `decisions-<port>-YYYY-MM-DD.jsonl`. Entries are buffered and
// flushed on an interval or when the buffer fills; every flush prunes this port's
// files older than the retention window. Writing is best-effort: a failed flush
// drops that batch rather than throwing into the decision path.
export function createLogStore({ port, dir = logsDir(), flushIntervalMs = 5000,
  maxBuffer = 200, retentionDays = 30, now = () => new Date() } = {}) {
  const safePort = Number.isInteger(port) && port > 0 && port < 65536 ? port : 0;
  const prefix = `decisions-${safePort}-`;
  let buffer = [];
  let timer;
  let flushing = false;

  const fileFor = date => join(dir, `${prefix}${dayStamp(date)}.jsonl`);

  const prune = async () => {
    let names;
    try { names = await readdir(dir); } catch { return; }
    const cutoff = now().getTime() - retentionDays * 24 * 60 * 60 * 1000;
    await Promise.all(names.map(async name => {
      if (!name.startsWith(prefix) || !name.endsWith('.jsonl')) return;
      const stamp = name.slice(prefix.length, -'.jsonl'.length);
      const day = Date.parse(`${stamp}T00:00:00Z`);
      if (Number.isFinite(day) && day < cutoff) await rm(join(dir, name), { force: true }).catch(() => {});
    }));
  };

  const flush = async () => {
    if (flushing || buffer.length === 0) return;
    flushing = true;
    const pending = buffer;
    buffer = [];
    try {
      await mkdir(dir, { recursive: true, mode: 0o700 });
      const byFile = new Map();
      for (const entry of pending) {
        const at = Number.isFinite(entry?.at) ? entry.at : now().getTime();
        const file = fileFor(new Date(at));
        (byFile.get(file) ?? byFile.set(file, []).get(file)).push(`${JSON.stringify(entry)}\n`);
      }
      for (const [file, lines] of byFile) await appendFile(file, lines.join(''), { mode: 0o600 });
      await prune();
    } catch { /* best effort; a dropped batch must never break the decision path */ }
    finally { flushing = false; }
  };

  return {
    append(entry) {
      if (entry === null || typeof entry !== 'object') return;
      buffer.push(entry);
      if (buffer.length >= maxBuffer) { void flush(); return; }
      if (!timer) timer = setTimeout(() => { timer = undefined; void flush(); }, flushIntervalMs);
    },
    flush,
    dispose() {
      if (timer) { clearTimeout(timer); timer = undefined; }
      return flush();
    },
  };
}
