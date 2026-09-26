import { createHash } from 'node:crypto';

const MAX_FINGERPRINT_INPUT = 16 * 1024;

export function fingerprintCall(exec) {
  const name = typeof exec?.name === 'string' ? exec.name : '';
  let args = '';
  try { args = JSON.stringify(exec?.arguments ?? null); } catch { args = ''; }
  return createHash('sha256').update(name).update('\0').update(args.slice(0, MAX_FINGERPRINT_INPUT)).digest('hex');
}

export function createLoopGuard({ threshold = 3, maxSessions = 1024, maxTracked = 256 } = {}) {
  if (!Number.isSafeInteger(threshold) || threshold < 2) throw new Error('Invalid loop threshold');
  const sessions = new Map();
  const countsFor = id => {
    let counts = sessions.get(id);
    if (!counts) {
      if (sessions.size >= maxSessions) sessions.delete(sessions.keys().next().value);
      counts = new Map();
      sessions.set(id, counts);
    }
    return counts;
  };
  return {
    check(exec) {
      const id = exec?.agent?.session?.id;
      if (typeof id !== 'string') return undefined;
      const counts = countsFor(id);
      const key = fingerprintCall(exec);
      const next = (counts.get(key) ?? 0) + 1;
      counts.delete(key);
      counts.set(key, next);
      if (counts.size > maxTracked) counts.delete(counts.keys().next().value);
      if (next >= threshold) {
        return `Identical tool call repeated ${next} times; blocked to break a loop`;
      }
      return undefined;
    },
    trackedSize(id) {
      return sessions.get(id)?.size ?? 0;
    },
  };
}
