import { createReadStream } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { logsDir } from './log-store.mjs';

// Stream the persisted decision JSONL logs line by line, yielding one parsed
// record per line. Files are read sequentially so a large corpus is never fully
// buffered. A malformed line is skipped, not fatal. Only this port's files are
// read when `port` is given (matching the log-store naming); otherwise all
// `decisions-*.jsonl` files are read.
export async function* createReadableStream({ dir = logsDir(), port } = {}) {
  const prefix = Number.isInteger(port) && port > 0 ? `decisions-${port}-` : 'decisions-';
  let names;
  try { names = await readdir(dir); } catch { return; }
  const files = names.filter(name => name.startsWith(prefix) && name.endsWith('.jsonl')).sort();
  for (const name of files) {
    const stream = createReadStream(join(dir, name), { encoding: 'utf8' });
    const lines = createInterface({ input: stream, crlfDelay: Infinity });
    try {
      for await (const line of lines) {
        if (!line.trim()) continue;
        try { yield JSON.parse(line); } catch { /* skip malformed line */ }
      }
    } finally { lines.close(); stream.close(); }
  }
}
