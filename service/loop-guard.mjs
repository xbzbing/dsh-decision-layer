import { createHash } from 'node:crypto';

const MAX_FINGERPRINT_INPUT = 16 * 1024;

export function fingerprintCall(exec) {
  const name = typeof exec?.name === 'string' ? exec.name : '';
  let args = '';
  try { args = JSON.stringify(exec?.arguments ?? null); } catch { args = ''; }
  return createHash('sha256').update(name).update('\0').update(args.slice(0, MAX_FINGERPRINT_INPUT)).digest('hex');
}

// Deterministic, backend-free loop guard: it denies only a run of the SAME tool
// call repeated consecutively past a threshold. Any different intervening call
// resets the run, so a legitimate identical call reached again later is allowed.
export function createLoopGuard({ threshold = 3, maxSessions = 1024, sessions } = {}) {
  if (!Number.isSafeInteger(threshold) || threshold < 2) throw new Error('Invalid loop threshold');
  const runs = new Map();
  const runFor = id => {
    let run = runs.get(id);
    if (!run) {
      if (runs.size >= maxSessions) runs.delete(runs.keys().next().value);
      run = { key: undefined, count: 0 };
      runs.set(id, run);
    }
    return run;
  };
  return {
    check(exec) {
      const id = exec?.agent?.session?.id;
      if (typeof id !== 'string') return undefined;
      // The master switch pauses automatic intervention (mirrors the danger gate);
      // capacity overflow still guards, since that is involuntary, not a user choice.
      if (sessions) {
        try {
          const snapshot = sessions.snapshot(id);
          if (snapshot.enabled === false && !snapshot.capacityExceeded) return undefined;
        } catch { /* fall through and guard */ }
      }
      const run = runFor(id);
      const key = fingerprintCall(exec);
      run.count = key === run.key ? run.count + 1 : 1;
      run.key = key;
      if (run.count >= threshold) {
        return `Identical tool call repeated ${run.count} times in a row; blocked to break a loop`;
      }
      return undefined;
    },
    runLength(id) {
      return runs.get(id)?.count ?? 0;
    },
  };
}
