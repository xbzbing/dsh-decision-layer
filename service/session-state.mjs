function sessionKey(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 512) throw new Error('Invalid session ID');
  return value.trim();
}

function emptyState() {
  return { enabled: true, attempts: 0, failures: 0,
    gate: { attempts: 0, failures: 0, ask: 0, deny: 0, allow: 0, actual: { allow: 0, deny: 0, error: 0 } },
    check: { attempts: 0, failures: 0, low: 0 }, log: [] };
}

function safeTool(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 128) : undefined;
}

export function createSessionState({ maxSessions = 1024, maxLogEntries = 50 } = {}) {
  if (!Number.isSafeInteger(maxSessions) || maxSessions < 1) throw new Error('Invalid session limit');
  if (!Number.isSafeInteger(maxLogEntries) || maxLogEntries < 1) throw new Error('Invalid log limit');
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
      if (state.gate.attempts > 0) value.gate = { ...state.gate, actual: { ...state.gate.actual } };
      if (state.check.attempts > 0) value.check = { ...state.check };
      if (state.log.length > 0) value.log = state.log.map(entry => ({ ...entry }));
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
    recordCheck(id, outcome) {
      if (!['ok', 'low', 'error'].includes(outcome)) throw new Error('Invalid self-check outcome');
      const state = writable(id);
      state.attempts++;
      state.check.attempts++;
      if (outcome === 'error') { state.failures++; state.check.failures++; }
      else if (outcome === 'low') state.check.low++;
    },
    log(id, entry) {
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Invalid log entry');
      if (!['gate', 'check'].includes(entry.kind)) throw new Error('Invalid log entry');
      const record = { at: Date.now(), kind: entry.kind, outcome: typeof entry.outcome === 'string' ? entry.outcome.slice(0, 32) : '' };
      const tool = safeTool(entry.tool);
      if (tool) record.tool = tool;
      if (typeof entry.suggestion === 'string' && entry.suggestion) record.suggestion = entry.suggestion.slice(0, 16);
      if (typeof entry.action === 'string' && entry.action) record.action = entry.action.slice(0, 16);
      if (typeof entry.reason === 'string' && entry.reason) record.reason = entry.reason.slice(0, 32);
      if (Number.isSafeInteger(entry.score)) record.score = entry.score;
      const state = writable(id);
      state.log.push(record);
      if (state.log.length > maxLogEntries) state.log.splice(0, state.log.length - maxLogEntries);
    },
  };
}
