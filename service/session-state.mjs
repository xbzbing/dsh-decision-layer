import { randomUUID } from 'node:crypto';
import { advanceRun, severityOf } from './quality-trend.mjs';

function sessionKey(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 512) throw new Error('Invalid session ID');
  return value.trim();
}

function emptyState() {
  return { enabled: true, attempts: 0, failures: 0,
    gate: { attempts: 0, failures: 0, ask: 0, deny: 0, allow: 0, actual: { allow: 0, deny: 0, error: 0 } },
    check: { attempts: 0, failures: 0, low: 0, run: 0, severity: 'normal' },
    narrow: { attempts: 0, failures: 0, applied: 0, dropped: 0 },
    complete: { attempts: 0, failures: 0, unsatisfied: 0, satisfied: 0, insufficient: 0, steered: 0 }, log: [] };
}

function safeTool(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 128) : undefined;
}

const toCount = value => (Number.isSafeInteger(value) && value >= 0 ? value : 0);

// Rebuild a trusted in-memory state from a persisted (untrusted) snapshot. Every
// counter is coerced into the emptyState() shape with a non-negative-integer
// guard and the trend severity into its enum, so a stale or tampered file can
// never inject an out-of-shape value into the live counters. The recent log is
// kept as plain records (newest-last); callers trim it to the log cap.
function coerceState(raw) {
  const state = emptyState();
  if (!raw || typeof raw !== 'object') return state;
  if (typeof raw.enabled === 'boolean') state.enabled = raw.enabled;
  state.attempts = toCount(raw.attempts);
  state.failures = toCount(raw.failures);
  const g = raw.gate;
  if (g && typeof g === 'object') {
    state.gate.attempts = toCount(g.attempts); state.gate.failures = toCount(g.failures);
    state.gate.ask = toCount(g.ask); state.gate.deny = toCount(g.deny); state.gate.allow = toCount(g.allow);
    const a = g.actual;
    if (a && typeof a === 'object') { state.gate.actual.allow = toCount(a.allow); state.gate.actual.deny = toCount(a.deny); state.gate.actual.error = toCount(a.error); }
  }
  const c = raw.check;
  if (c && typeof c === 'object') {
    state.check.attempts = toCount(c.attempts); state.check.failures = toCount(c.failures); state.check.low = toCount(c.low);
    state.check.run = toCount(c.run);
    state.check.severity = ['normal', 'warn', 'severe'].includes(c.severity) ? c.severity : 'normal';
  }
  const n = raw.narrow;
  if (n && typeof n === 'object') {
    state.narrow.attempts = toCount(n.attempts); state.narrow.failures = toCount(n.failures);
    state.narrow.applied = toCount(n.applied); state.narrow.dropped = toCount(n.dropped);
  }
  const k = raw.complete;
  if (k && typeof k === 'object') {
    state.complete.attempts = toCount(k.attempts); state.complete.failures = toCount(k.failures);
    state.complete.unsatisfied = toCount(k.unsatisfied); state.complete.satisfied = toCount(k.satisfied);
    state.complete.insufficient = toCount(k.insufficient); state.complete.steered = toCount(k.steered);
  }
  if (Array.isArray(raw.log)) {
    state.log = raw.log
      .filter(entry => entry && typeof entry === 'object' && !Array.isArray(entry) && typeof entry.kind === 'string')
      .map(entry => ({ ...entry }));
  }
  return state;
}

export function createSessionState({ maxSessions = 1024, maxLogEntries = 50, onLog, loadState, persistState } = {}) {
  if (!Number.isSafeInteger(maxSessions) || maxSessions < 1) throw new Error('Invalid session limit');
  if (!Number.isSafeInteger(maxLogEntries) || maxLogEntries < 1) throw new Error('Invalid log limit');
  const sessions = new Map();
  const sink = typeof onLog === 'function' ? onLog : undefined;
  const load = typeof loadState === 'function' ? loadState : undefined;
  const persist = typeof persistState === 'function' ? persistState : undefined;
  // Memoize rehydration per id so a session is seeded from disk at most once per
  // process. Bounded like `sessions`; dropping a memo entry only risks a
  // redundant disk read that no-ops (ensureLoaded never clobbers live state).
  const loaded = new Map();
  // Mirror the latest live state to the durable store after every mutation.
  // Best-effort: a persistence fault must never surface in the decision path.
  const bump = (key, state) => { if (persist) { try { persist(key, state); } catch { /* best effort */ } } };
  // FIFO eviction: when the map is full, drop the oldest-inserted session before
  // admitting a new one (Map preserves insertion order, so the first key is the
  // oldest). This mirrors loop-guard / narrowing and means the store never
  // "fills up" — there is no capacity-exceeded state. An evicted session's
  // in-memory counters/log are gone, but the persisted JSONL log is unaffected;
  // a later call rebuilds an empty state for it.
  const writable = id => {
    const key = sessionKey(id);
    let state = sessions.get(key);
    if (!state) {
      if (sessions.size >= maxSessions) sessions.delete(sessions.keys().next().value);
      state = emptyState();
      sessions.set(key, state);
    }
    return state;
  };
  return {
    // Rehydrate a session's live counters/log from the durable store the first
    // time it is touched this process, before any new event mutates it — so disk
    // history and in-process events never double-count. Memoized per id; a no-op
    // when no loadState was given or the session already has live state. Callers
    // should await this before the first snapshot/record of a resumed session
    // (the plugin does so at the turn's first step and in the panel routes).
    async ensureLoaded(id) {
      if (!load) return;
      let key;
      try { key = sessionKey(id); } catch { return; }
      const existing = loaded.get(key);
      if (existing) return existing;
      const promise = (async () => {
        if (sessions.has(key)) return; // live events already created state; keep it
        let raw;
        try { raw = await load(key); } catch { raw = undefined; }
        if (!raw) return;
        if (sessions.has(key)) return; // a concurrent mutation won the race; do not clobber
        const state = coerceState(raw);
        if (state.log.length > maxLogEntries) state.log.splice(0, state.log.length - maxLogEntries);
        if (sessions.size >= maxSessions) sessions.delete(sessions.keys().next().value);
        sessions.set(key, state);
      })();
      if (loaded.size >= maxSessions) loaded.delete(loaded.keys().next().value);
      loaded.set(key, promise);
      return promise;
    },
    setEnabled(id, enabled) {
      if (typeof enabled !== 'boolean') throw new Error('Invalid enabled value');
      const state = writable(id);
      state.enabled = enabled;
      bump(sessionKey(id), state);
    },
    snapshot(id) {
      const stored = sessions.get(sessionKey(id));
      const state = stored ?? emptyState();
      const value = { enabled: state.enabled, hasAutomaticDecisions: state.attempts > 0, attempts: state.attempts, failures: state.failures };
      if (state.gate.attempts > 0) value.gate = { ...state.gate, actual: { ...state.gate.actual } };
      if (state.check.attempts > 0) value.check = { attempts: state.check.attempts, failures: state.check.failures, low: state.check.low, trend: { run: state.check.run, severity: state.check.severity } };
      if (state.narrow.attempts > 0) value.narrow = { ...state.narrow };
      if (state.complete.attempts > 0) value.complete = { ...state.complete };
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
      bump(sessionKey(id), state);
    },
    recordActual(id, outcome) {
      if (!['allow', 'deny', 'error'].includes(outcome)) throw new Error('Invalid actual decision');
      const state = writable(id);
      state.gate.actual[outcome]++;
      bump(sessionKey(id), state);
    },
    recordCheck(id, outcome, trend) {
      if (!['ok', 'low', 'error'].includes(outcome)) throw new Error('Invalid self-check outcome');
      const state = writable(id);
      state.attempts++;
      state.check.attempts++;
      if (outcome === 'error') { state.failures++; state.check.failures++; }
      else {
        if (outcome === 'low') state.check.low++;
        // Advance the quality-trend run over this evaluated score. A good score
        // resets the run; a high-confidence low score grows it; a low-confidence
        // low score neither resets nor grows. `trend` carries the per-sample flags
        // and the configured thresholds; absent trend leaves the run unchanged.
        if (trend && typeof trend === 'object') {
          state.check.run = advanceRun(state.check.run, { lowScore: outcome === 'low', confident: trend.confident === true });
          state.check.severity = severityOf(state.check.run, { trendRun: trend.trendRun, trendSevereRun: trend.trendSevereRun });
        }
      }
      bump(sessionKey(id), state);
    },
    recordNarrow(id, outcome, dropped = 0) {
      if (!['ok', 'applied', 'error'].includes(outcome)) throw new Error('Invalid narrowing outcome');
      const state = writable(id);
      state.attempts++;
      state.narrow.attempts++;
      if (outcome === 'error') { state.failures++; state.narrow.failures++; }
      else if (outcome === 'applied') {
        state.narrow.applied++;
        if (Number.isSafeInteger(dropped) && dropped > 0) state.narrow.dropped += dropped;
      }
      bump(sessionKey(id), state);
    },
    // Task-completion checking. `ok`/`unsatisfied` are real evaluations; `error`
    // is an unevaluated failure counted as a failure, never as "unsatisfied".
    // The per-condition three-state tallies come from `detail`.
    recordComplete(id, outcome, detail = {}) {
      if (!['ok', 'unsatisfied', 'error'].includes(outcome)) throw new Error('Invalid task-completion outcome');
      const state = writable(id);
      state.attempts++;
      state.complete.attempts++;
      if (outcome === 'error') { state.failures++; state.complete.failures++; }
      else {
        if (Number.isSafeInteger(detail.satisfied) && detail.satisfied > 0) state.complete.satisfied += detail.satisfied;
        if (Number.isSafeInteger(detail.unsatisfied) && detail.unsatisfied > 0) state.complete.unsatisfied += detail.unsatisfied;
        if (Number.isSafeInteger(detail.insufficient) && detail.insufficient > 0) state.complete.insufficient += detail.insufficient;
        if (detail.steered === true) state.complete.steered++;
      }
      bump(sessionKey(id), state);
    },
    log(id, entry) {
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Invalid log entry');
      if (!['gate', 'check', 'narrow', 'complete'].includes(entry.kind)) throw new Error('Invalid log entry');
      // Every decision record carries a stable unique id, generated here so the
      // in-memory panel copy and the persisted sink record share the same id.
      // Later annotation events reference this id to attribute a rating to one decision.
      const record = { id: randomUUID(), at: Date.now(), kind: entry.kind, outcome: typeof entry.outcome === 'string' ? entry.outcome.slice(0, 32) : '' };
      const tool = safeTool(entry.tool);
      if (tool) record.tool = tool;
      if (typeof entry.suggestion === 'string' && entry.suggestion) record.suggestion = entry.suggestion.slice(0, 16);
      if (typeof entry.action === 'string' && entry.action) record.action = entry.action.slice(0, 16);
      if (typeof entry.reason === 'string' && entry.reason) record.reason = entry.reason.slice(0, 32);
      if (typeof entry.mode === 'string' && entry.mode) record.mode = entry.mode.slice(0, 16);
      if (typeof entry.score === 'number' && Number.isFinite(entry.score)) record.score = Math.round(entry.score * 100) / 100;
      if (typeof entry.confidence === 'number' && Number.isFinite(entry.confidence)) record.confidence = Math.round(entry.confidence * 100) / 100;
      if (Number.isSafeInteger(entry.dropped) && entry.dropped >= 0) record.dropped = entry.dropped;
      if (Number.isSafeInteger(entry.kept) && entry.kept >= 0) record.kept = entry.kept;
      if (Number.isSafeInteger(entry.candidates) && entry.candidates >= 0) record.candidates = entry.candidates;
      if (Number.isSafeInteger(entry.conditions) && entry.conditions >= 0) record.conditions = entry.conditions;
      if (Number.isSafeInteger(entry.satisfied) && entry.satisfied >= 0) record.satisfied = entry.satisfied;
      if (Number.isSafeInteger(entry.unsatisfied) && entry.unsatisfied >= 0) record.unsatisfied = entry.unsatisfied;
      if (Number.isSafeInteger(entry.insufficient) && entry.insufficient >= 0) record.insufficient = entry.insufficient;
      if (entry.steered === true) record.steered = true;
      if (entry.lowConfidence === true) record.lowConfidence = true;
      if (Array.isArray(entry.tools)) {
        const names = entry.tools.filter(name => typeof name === 'string' && name.trim()).slice(0, 12).map(name => name.trim().slice(0, 64));
        if (names.length > 0) record.tools = names;
      }
      const state = writable(id);
      state.log.push(record);
      if (state.log.length > maxLogEntries) state.log.splice(0, state.log.length - maxLogEntries);
      // Full, untruncated record for the research log sink (all dropped tool
      // names, keyed by session id). The in-memory panel record above stays capped.
      if (sink) {
        const full = { ...record, sessionId: sessionKey(id) };
        if (Array.isArray(entry.tools)) {
          const allNames = entry.tools.filter(name => typeof name === 'string' && name.trim()).map(name => name.trim());
          if (allNames.length > 0) full.tools = allNames;
        }
        try { sink(full); } catch { /* persistence is best effort */ }
      }
      bump(sessionKey(id), state);
    },
  };
}
