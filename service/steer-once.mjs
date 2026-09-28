// Shared "steer at most once per turn" gate for the turn-stopping decision
// points (self-check, task-completion). A steer opens a supplemental step, so it
// must fire at most once per (session, turn) — but a transient host failure must
// NOT burn that budget, or one flaky steer permanently suppresses the turn.
//
// `attempt(turn, run)` calls `run()` (which performs the host steer and may
// throw) and records the turn key only after `run()` returns without throwing.
// Returns true iff a steer was actually performed this call.
export function createSteerOnce({ maxTurns = 4096 } = {}) {
  const steeredTurns = new Set();
  const keyOf = turn => {
    const id = turn?.agent?.session?.id;
    return typeof id === 'string' && Number.isInteger(turn?.turn) ? `${id}:${turn.turn}` : undefined;
  };
  return {
    attempt(turn, run) {
      const key = keyOf(turn);
      if (key === undefined || steeredTurns.has(key)) return false;
      try { run(); } catch { return false; }
      steeredTurns.add(key);
      if (steeredTurns.size > maxTurns) steeredTurns.delete(steeredTurns.values().next().value);
      return true;
    },
  };
}
