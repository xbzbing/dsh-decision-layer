function sessionKey(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 512) throw new Error('Invalid session ID');
  return value.trim();
}

function emptyState() {
  return { enabled: true, attempts: 0, failures: 0,
    gate: { attempts: 0, failures: 0, ask: 0, deny: 0, allow: 0, actual: { allow: 0, deny: 0, error: 0 } } };
}

export function createSessionState({ maxSessions = 1024 } = {}) {
  if (!Number.isSafeInteger(maxSessions) || maxSessions < 1) throw new Error('Invalid session limit');
  const sessions = new Map();
  const writable = id => {
    const key = sessionKey(id);
    let state = sessions.get(key);
    if (!state) {
      if (sessions.size >= maxSessions) throw new Error('Session state limit reached');
      state = emptyState();
      sessions.set(key, state);
    }
    return state;
  };
  return {
    setEnabled(id, enabled) {
      if (typeof enabled !== 'boolean') throw new Error('Invalid enabled value');
      const key = sessionKey(id);
      if (!sessions.has(key) && sessions.size >= maxSessions && !enabled) return;
      writable(key).enabled = enabled;
    },
    snapshot(id) {
      const stored = sessions.get(sessionKey(id));
      const overflow = !stored && sessions.size >= maxSessions;
      const state = stored ?? emptyState();
      const value = { enabled: overflow ? false : state.enabled, hasAutomaticDecisions: state.attempts > 0, attempts: state.attempts, failures: state.failures };
      if (overflow) value.capacityExceeded = true;
      if (state.attempts > 0) value.gate = { ...state.gate, actual: { ...state.gate.actual } };
      return value;
    },
    record(id, kind, outcome) {
      if (kind !== 'gate' || !['allow', 'ask', 'deny', 'error'].includes(outcome)) throw new Error('Invalid automatic decision');
      const state = writable(id);
      state.attempts++;
      state.gate.attempts++;
      if (outcome === 'error') { state.failures++; state.gate.failures++; }
      else state.gate[outcome]++;
    },
    recordActual(id, outcome) {
      if (!['allow', 'deny', 'error'].includes(outcome)) throw new Error('Invalid actual decision');
      writable(id).gate.actual[outcome]++;
    },
  };
}
