import { mkdir, appendFile, readdir, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function logsDir(): string {
  return join(homedir(), '.config', 'dsh-decision-layer', 'logs');
}

const dayStamp = (date: Date): string => date.toISOString().slice(0, 10);

export type LogStoreOptions = {
  port?: number;
  dir?: string;
  flushIntervalMs?: number;
  maxBuffer?: number;
  retentionDays?: number;
  now?: () => Date;
};

// Batched, rolling JSONL log writer keyed by the running instance's port. One
// file per UTC day: `decisions-<port>-YYYY-MM-DD.jsonl`. Entries are buffered and
// flushed on an interval or when the buffer fills; every flush prunes this port's
// files older than the retention window. Writing is best-effort: a failed flush
// drops that batch rather than throwing into the decision path.
export function createLogStore({ port, dir = logsDir(), flushIntervalMs = 5000,
  maxBuffer = 200, retentionDays = 30, now = () => new Date() }: LogStoreOptions = {}) {
  const safePort = Number.isInteger(port) && (port as number) > 0 && (port as number) < 65536 ? port as number : 0;
  const prefix = `decisions-${safePort}-`;
  let buffer: Record<string, unknown>[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let flushing = false;

  const fileFor = (date: Date): string => join(dir, `${prefix}${dayStamp(date)}.jsonl`);

  const prune = async (): Promise<void> => {
    let names: string[];
    try { names = await readdir(dir); } catch { return; }
    const cutoff = now().getTime() - retentionDays * 24 * 60 * 60 * 1000;
    await Promise.all(names.map(async name => {
      if (!name.startsWith(prefix) || !name.endsWith('.jsonl')) return;
      const stamp = name.slice(prefix.length, -'.jsonl'.length);
      const day = Date.parse(`${stamp}T00:00:00Z`);
      if (Number.isFinite(day) && day < cutoff) await rm(join(dir, name), { force: true }).catch(() => {});
    }));
  };

  const flush = async (): Promise<void> => {
    if (flushing || buffer.length === 0) return;
    flushing = true;
    const pending = buffer;
    buffer = [];
    try {
      await mkdir(dir, { recursive: true, mode: 0o700 });
      const byFile = new Map<string, string[]>();
      for (const entry of pending) {
        const at = Number.isFinite(entry.at) ? entry.at as number : now().getTime();
        const file = fileFor(new Date(at));
        (byFile.get(file) ?? byFile.set(file, []).get(file))!.push(`${JSON.stringify(entry)}\n`);
      }
      for (const [file, lines] of byFile) await appendFile(file, lines.join(''), { mode: 0o600 });
      await prune();
    } catch { /* best effort; a dropped batch must never break the decision path */ }
    finally { flushing = false; }
  };

  return {
    append(entry: unknown): void {
      if (entry === null || typeof entry !== 'object') return;
      buffer.push(entry as Record<string, unknown>);
      if (buffer.length >= maxBuffer) { void flush(); return; }
      if (!timer) timer = setTimeout(() => { timer = undefined; void flush(); }, flushIntervalMs);
    },
    // An annotation is an explicit user action, not telemetry: write it
    // immediately (not batched) and surface failure to the caller instead of
    // dropping it. It lands in the same JSONL directory as a `kind:"annotation"`
    // event and is pruned with the decision logs on the next flush.
    async appendAnnotation(entry: Record<string, unknown>): Promise<Record<string, unknown>> {
      if (entry === null || typeof entry !== 'object') throw new Error('Invalid annotation');
      const at = Number.isFinite(entry.at) ? entry.at as number : now().getTime();
      const record = { ...entry, at };
      await mkdir(dir, { recursive: true, mode: 0o700 });
      await appendFile(fileFor(new Date(at)), `${JSON.stringify(record)}\n`, { mode: 0o600 });
      return record;
    },
    flush,
    dispose(): Promise<void> {
      if (timer) { clearTimeout(timer); timer = undefined; }
      return flush();
    },
  };
}
