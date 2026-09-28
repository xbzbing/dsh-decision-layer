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

export function createSessionState({ maxSessions = 1024, maxLogEntries = 50, onLog } = {}) {
  if (!Number.isSafeInteger(maxSessions) || maxSessions < 1) throw new Error('Invalid session limit');
  if (!Number.isSafeInteger(maxLogEntries) || maxLogEntries < 1) throw new Error('Invalid log limit');
  const sessions = new Map();
  const sink = typeof onLog === 'function' ? onLog : undefined;
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
    setEnabled(id, enabled) {
      if (typeof enabled !== 'boolean') throw new Error('Invalid enabled value');
      writable(id).enabled = enabled;
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
    },
    recordActual(id, outcome) {
      if (!['allow', 'deny', 'error'].includes(outcome)) throw new Error('Invalid actual decision');
      writable(id).gate.actual[outcome]++;
    },
    recordCheck(id, outcome, trend) {
      if (!['ok', 'low', 'error'].includes(outcome)) throw new Error('Invalid self-check outcome');
      const state = writable(id);
      state.attempts++;
      state.check.attempts++;
      if (outcome === 'error') { state.failures++; state.check.failures++; return; }
      if (outcome === 'low') state.check.low++;
      // Advance the quality-trend run over this evaluated score. A good score
      // resets the run; a high-confidence low score grows it; a low-confidence
      // low score neither resets nor grows. `trend` carries the per-sample flags
      // and the configured thresholds; absent trend leaves the run unchanged.
      if (trend && typeof trend === 'object') {
        state.check.run = advanceRun(state.check.run, { lowScore: outcome === 'low', confident: trend.confident === true });
        state.check.severity = severityOf(state.check.run, { trendRun: trend.trendRun, trendSevereRun: trend.trendSevereRun });
      }
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
    },
    // Task-completion checking. `ok`/`unsatisfied` are real evaluations; `error`
    // is an unevaluated failure counted as a failure, never as "unsatisfied".
    // The per-condition three-state tallies come from `detail`.
    recordComplete(id, outcome, detail = {}) {
      if (!['ok', 'unsatisfied', 'error'].includes(outcome)) throw new Error('Invalid task-completion outcome');
      const state = writable(id);
      state.attempts++;
      state.complete.attempts++;
      if (outcome === 'error') { state.failures++; state.complete.failures++; return; }
      if (Number.isSafeInteger(detail.satisfied) && detail.satisfied > 0) state.complete.satisfied += detail.satisfied;
      if (Number.isSafeInteger(detail.unsatisfied) && detail.unsatisfied > 0) state.complete.unsatisfied += detail.unsatisfied;
      if (Number.isSafeInteger(detail.insufficient) && detail.insufficient > 0) state.complete.insufficient += detail.insufficient;
      if (detail.steered === true) state.complete.steered++;
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
    },
  };
}
