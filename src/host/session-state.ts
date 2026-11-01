import { randomUUID } from 'node:crypto';
import { redactCredentials } from './excerpt.js';
import { advanceRun, severityOf } from './quality-trend.js';
import type {
  CheckCounters, CompleteCounters, GateCounters, LogKind, LogRow, NarrowCounters, SessionSeed,
  SessionSinkRow, SessionSnapshot, SessionState, Severity,
} from './types.js';

const KINDS: readonly string[] = ['gate', 'check', 'narrow', 'complete'];
const SEVERITIES: readonly Severity[] = ['normal', 'warn', 'severe'];

function sessionKey(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 512) throw new Error('Invalid session ID');
  return value.trim();
}

// The live state and the persisted seed share one counter shape; only the
// master switch is live-only, so the seed builder can fill everything else.
function emptyCounters(): SessionSeed {
  return { attempts: 0, failures: 0,
    gate: { attempts: 0, failures: 0, ask: 0, deny: 0, allow: 0, actual: { allow: 0, deny: 0, error: 0 } },
    check: { attempts: 0, failures: 0, low: 0, run: 0, severity: 'normal' },
    narrow: { attempts: 0, failures: 0, applied: 0, dropped: 0 },
    complete: { attempts: 0, failures: 0, unsatisfied: 0, satisfied: 0, insufficient: 0, steered: 0 }, log: [] };
}

function emptyState(): SessionState {
  return { enabled: true, ...emptyCounters() };
}

function safeTool(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 128) : undefined;
}

const toCount = (value: unknown): number => (Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : 0);

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

// Rebuild a trusted in-memory state from a persisted (untrusted) snapshot. Every
// counter is coerced into the emptyState() shape with a non-negative-integer
// guard and the trend severity into its enum, so a stale or tampered file can
// never inject an out-of-shape value into the live counters. The recent log is
// kept as plain records (newest-last); callers trim it to the log cap.
function coerceState(raw: unknown): SessionState {
  const state = emptyState();
  const record = asRecord(raw);
  if (!record) return state;
  if (typeof record.enabled === 'boolean') state.enabled = record.enabled;
  state.attempts = toCount(record.attempts);
  state.failures = toCount(record.failures);
  const g = asRecord(record.gate);
  if (g) {
    state.gate.attempts = toCount(g.attempts); state.gate.failures = toCount(g.failures);
    state.gate.ask = toCount(g.ask); state.gate.deny = toCount(g.deny); state.gate.allow = toCount(g.allow);
    const a = asRecord(g.actual);
    if (a) { state.gate.actual.allow = toCount(a.allow); state.gate.actual.deny = toCount(a.deny); state.gate.actual.error = toCount(a.error); }
  }
  const c = asRecord(record.check);
  if (c) {
    state.check.attempts = toCount(c.attempts); state.check.failures = toCount(c.failures); state.check.low = toCount(c.low);
    state.check.run = toCount(c.run);
    state.check.severity = typeof c.severity === 'string' && SEVERITIES.includes(c.severity as Severity) ? c.severity as Severity : 'normal';
  }
  const n = asRecord(record.narrow);
  if (n) {
    state.narrow.attempts = toCount(n.attempts); state.narrow.failures = toCount(n.failures);
    state.narrow.applied = toCount(n.applied); state.narrow.dropped = toCount(n.dropped);
  }
  const k = asRecord(record.complete);
  if (k) {
    state.complete.attempts = toCount(k.attempts); state.complete.failures = toCount(k.failures);
    state.complete.unsatisfied = toCount(k.unsatisfied); state.complete.satisfied = toCount(k.satisfied);
    state.complete.insufficient = toCount(k.insufficient); state.complete.steered = toCount(k.steered);
  }
  if (Array.isArray(record.log)) {
    state.log = record.log
      .filter((entry): entry is Record<string, unknown> => Boolean(asRecord(entry)) && typeof (entry as Record<string, unknown>).kind === 'string')
      .map(entry => ({ ...entry })) as LogRow[];
  }
  return state;
}

export type SessionStateOptions = {
  maxSessions?: number;
  maxLogEntries?: number;
  onLog?: (entry: SessionSinkRow) => void;
  loadState?: (id: string) => Promise<unknown> | unknown;
  persistState?: (id: string, state: SessionState) => unknown;
};

export function createSessionState({ maxSessions = 1024, maxLogEntries = 50, onLog, loadState, persistState }: SessionStateOptions = {}) {
  if (!Number.isSafeInteger(maxSessions) || maxSessions < 1) throw new Error('Invalid session limit');
  if (!Number.isSafeInteger(maxLogEntries) || maxLogEntries < 1) throw new Error('Invalid log limit');
  const sessions = new Map<string, SessionState>();
  const sink = typeof onLog === 'function' ? onLog : undefined;
  const load = typeof loadState === 'function' ? loadState : undefined;
  const persist = typeof persistState === 'function' ? persistState : undefined;
  // Memoize rehydration per id so a session is seeded from disk at most once per
  // process. Bounded like `sessions`; dropping a memo entry only risks a
  // redundant disk read that no-ops (ensureLoaded never clobbers live state).
  const loaded = new Map<string, Promise<void>>();
  // Mirror the latest live state to the durable store after every mutation.
  // Best-effort: a persistence fault must never surface in the decision path.
  const bump = (key: string, state: SessionState): void => { if (persist) { try { persist(key, state); } catch { /* best effort */ } } };
  // FIFO eviction: when the map is full, drop the oldest-inserted session before
  // admitting a new one (Map preserves insertion order, so the first key is the
  // oldest). This mirrors loop-guard / narrowing and means the store never
  // "fills up" — there is no capacity-exceeded state. An evicted session's
  // in-memory counters/log are gone, but the persisted JSONL log is unaffected;
  // a later call rebuilds an empty state for it.
  const writable = (id: unknown): SessionState => {
    const key = sessionKey(id);
    let state = sessions.get(key);
    if (!state) {
      if (sessions.size >= maxSessions) sessions.delete(sessions.keys().next().value as string);
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
    async ensureLoaded(id: unknown): Promise<void> {
      if (!load) return;
      let key: string;
      try { key = sessionKey(id); } catch { return; }
      const existing = loaded.get(key);
      if (existing) return existing;
      const promise = (async () => {
        if (sessions.has(key)) return; // live events already created state; keep it
        let raw: unknown;
        try { raw = await load(key); } catch { raw = undefined; }
        if (!raw) return;
        if (sessions.has(key)) return; // a concurrent mutation won the race; do not clobber
        const state = coerceState(raw);
        if (state.log.length > maxLogEntries) state.log.splice(0, state.log.length - maxLogEntries);
        if (sessions.size >= maxSessions) sessions.delete(sessions.keys().next().value as string);
        sessions.set(key, state);
      })();
      if (loaded.size >= maxSessions) loaded.delete(loaded.keys().next().value as string);
      loaded.set(key, promise);
      return promise;
    },
    setEnabled(id: unknown, enabled: unknown): void {
      if (typeof enabled !== 'boolean') throw new Error('Invalid enabled value');
      const state = writable(id);
      state.enabled = enabled;
      bump(sessionKey(id), state);
    },
    snapshot(id: unknown): SessionSnapshot {
      const stored = sessions.get(sessionKey(id));
      const state = stored ?? emptyState();
      const value: SessionSnapshot = { enabled: state.enabled, hasAutomaticDecisions: state.attempts > 0, attempts: state.attempts, failures: state.failures };
      if (state.gate.attempts > 0) value.gate = { ...state.gate, actual: { ...state.gate.actual } };
      if (state.check.attempts > 0) value.check = { attempts: state.check.attempts, failures: state.check.failures, low: state.check.low, trend: { run: state.check.run, severity: state.check.severity } };
      if (state.narrow.attempts > 0) value.narrow = { ...state.narrow };
      if (state.complete.attempts > 0) value.complete = { ...state.complete };
      if (state.log.length > 0) value.log = state.log.map(entry => ({ ...entry }));
      return value;
    },
    record(id: unknown, kind: string, outcome: string): void {
      if (kind !== 'gate' || !['allow', 'ask', 'deny', 'error'].includes(outcome)) throw new Error('Invalid automatic decision');
      const state = writable(id);
      state.attempts++;
      state.gate.attempts++;
      if (outcome === 'error') { state.failures++; state.gate.failures++; }
      else if (outcome === 'allow') state.gate.allow++;
      else if (outcome === 'ask') state.gate.ask++;
      else state.gate.deny++;
      bump(sessionKey(id), state);
    },
    recordActual(id: unknown, outcome: string): void {
      if (!['allow', 'deny', 'error'].includes(outcome)) throw new Error('Invalid actual decision');
      const state = writable(id);
      const actual: GateCounters['actual'] = state.gate.actual;
      if (outcome === 'allow') actual.allow++;
      else if (outcome === 'deny') actual.deny++;
      else actual.error++;
      bump(sessionKey(id), state);
    },
    recordCheck(id: unknown, outcome: string, trend?: Record<string, unknown>): void {
      if (!['ok', 'low', 'error'].includes(outcome)) throw new Error('Invalid self-check outcome');
      const state = writable(id);
      const check: CheckCounters = state.check;
      state.attempts++;
      check.attempts++;
      if (outcome === 'error') { state.failures++; check.failures++; }
      else {
        if (outcome === 'low') check.low++;
        // Advance the quality-trend run over this evaluated score. A good score
        // resets the run; a high-confidence low score grows it; a low-confidence
        // low score neither resets nor grows. `trend` carries the per-sample flags
        // and the configured thresholds; absent trend leaves the run unchanged.
        if (trend && typeof trend === 'object') {
          check.run = advanceRun(check.run, { lowScore: outcome === 'low', confident: trend.confident === true });
          check.severity = severityOf(check.run, {
            trendRun: typeof trend.trendRun === 'number' ? trend.trendRun : undefined,
            trendSevereRun: typeof trend.trendSevereRun === 'number' ? trend.trendSevereRun : undefined,
          });
        }
      }
      bump(sessionKey(id), state);
    },
    recordNarrow(id: unknown, outcome: string, dropped = 0, applied = outcome === 'applied'): void {
      if (!['ok', 'applied', 'error'].includes(outcome)) throw new Error('Invalid narrowing outcome');
      const state = writable(id);
      const narrow: NarrowCounters = state.narrow;
      state.attempts++;
      narrow.attempts++;
      if (outcome === 'error') { state.failures++; narrow.failures++; }
      else if (outcome === 'applied') {
        // A vetoed pass (low-keep, too many candidates) still dropped tools on
        // paper, but the restriction never took effect; only count real ones.
        if (applied) narrow.applied++;
        if (Number.isSafeInteger(dropped) && dropped > 0) narrow.dropped += dropped;
      }
      bump(sessionKey(id), state);
    },
    // Task-completion checking. `ok`/`unsatisfied` are real evaluations; `error`
    // is an unevaluated failure counted as a failure, never as "unsatisfied".
    // The per-condition three-state tallies come from `detail`.
    recordComplete(id: unknown, outcome: string, detail: Record<string, unknown> = {}): void {
      if (!['ok', 'unsatisfied', 'error'].includes(outcome)) throw new Error('Invalid task-completion outcome');
      const state = writable(id);
      const complete: CompleteCounters = state.complete;
      state.attempts++;
      complete.attempts++;
      if (outcome === 'error') { state.failures++; complete.failures++; }
      else {
        if (Number.isSafeInteger(detail.satisfied) && (detail.satisfied as number) > 0) complete.satisfied += detail.satisfied as number;
        if (Number.isSafeInteger(detail.unsatisfied) && (detail.unsatisfied as number) > 0) complete.unsatisfied += detail.unsatisfied as number;
        if (Number.isSafeInteger(detail.insufficient) && (detail.insufficient as number) > 0) complete.insufficient += detail.insufficient as number;
        if (detail.steered === true) complete.steered++;
      }
      bump(sessionKey(id), state);
    },
    log(id: unknown, entry: Record<string, unknown>): void {
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Invalid log entry');
      const kind = entry.kind;
      if (typeof kind !== 'string' || !KINDS.includes(kind)) throw new Error('Invalid log entry');
      // Every decision record carries a stable unique id, generated here so the
      // in-memory panel copy and the persisted sink record share the same id.
      // Later annotation events reference this id to attribute a rating to one decision.
      const record: LogRow = { id: randomUUID(), at: Date.now(), kind: kind as LogKind, outcome: typeof entry.outcome === 'string' ? entry.outcome.slice(0, 32) : '' };
      const tool = safeTool(entry.tool);
      if (tool) record.tool = tool;
      if (typeof entry.suggestion === 'string' && entry.suggestion) record.suggestion = entry.suggestion.slice(0, 16);
      if (typeof entry.action === 'string' && entry.action) record.action = entry.action.slice(0, 16);
      if (typeof entry.reason === 'string' && entry.reason) record.reason = entry.reason.slice(0, 32);
      // A short hint of the request a self-check judged, so a log row says which
      // turn's output was scored (not just "self-check"). Redaction is applied
      // again here as the last boundary: taskExcerpt is the canonical rule, but a
      // future caller that forgets it must not write a credential to disk.
      if (typeof entry.subject === 'string' && entry.subject.trim()) record.subject = redactCredentials(entry.subject).replace(/\s+/g, ' ').trim().slice(0, 120);
      // The redacted command/path summary of a gated call, so the log row can show
      // what was evaluated (not just the tool). Already secret-stripped upstream;
      // kept to a bounded preview here. Newlines collapse to single spaces so one
      // multi-line script stays on one readable row.
      if (typeof entry.command === 'string' && entry.command.trim()) record.command = entry.command.replace(/\s+/g, ' ').trim().slice(0, 512);
      if (typeof entry.path === 'string' && entry.path.trim()) record.path = entry.path.replace(/\s+/g, ' ').trim().slice(0, 512);
      // Gate / self-check / narrowing may attach a bounded task excerpt and the
      // turn it belongs to. Store only the excerpt, never the full task or an
      // arbitrary state object; re-mask here so no caller can bypass excerpt.ts.
      if (typeof entry.task === 'string' && entry.task.trim()) record.task = redactCredentials(entry.task).replace(/\s+/g, ' ').trim().slice(0, 512);
      if (Number.isSafeInteger(entry.turn) && (entry.turn as number) >= 0) record.turn = entry.turn as number;
      if (typeof entry.mode === 'string' && entry.mode) record.mode = entry.mode.slice(0, 16);
      if (typeof entry.score === 'number' && Number.isFinite(entry.score)) record.score = Math.round(entry.score * 100) / 100;
      if (typeof entry.confidence === 'number' && Number.isFinite(entry.confidence)) record.confidence = Math.round(entry.confidence * 100) / 100;
      if (Number.isSafeInteger(entry.dropped) && (entry.dropped as number) >= 0) record.dropped = entry.dropped as number;
      if (Number.isSafeInteger(entry.kept) && (entry.kept as number) >= 0) record.kept = entry.kept as number;
      if (typeof entry.applied === 'boolean') record.applied = entry.applied;
      if (Number.isSafeInteger(entry.candidates) && (entry.candidates as number) >= 0) record.candidates = entry.candidates as number;
      if (Number.isSafeInteger(entry.conditions) && (entry.conditions as number) >= 0) record.conditions = entry.conditions as number;
      if (Number.isSafeInteger(entry.satisfied) && (entry.satisfied as number) >= 0) record.satisfied = entry.satisfied as number;
      if (Number.isSafeInteger(entry.unsatisfied) && (entry.unsatisfied as number) >= 0) record.unsatisfied = entry.unsatisfied as number;
      if (Number.isSafeInteger(entry.insufficient) && (entry.insufficient as number) >= 0) record.insufficient = entry.insufficient as number;
      if (entry.steered === true) record.steered = true;
      if (entry.lowConfidence === true) record.lowConfidence = true;
      if (Array.isArray(entry.tools)) {
        const names = (entry.tools as unknown[]).filter((name): name is string => typeof name === 'string' && Boolean(name.trim())).slice(0, 12).map(name => name.trim().slice(0, 64));
        if (names.length > 0) record.tools = names;
      }
      const state = writable(id);
      state.log.push(record);
      if (state.log.length > maxLogEntries) state.log.splice(0, state.log.length - maxLogEntries);
      // Full, untruncated record for the research log sink (all dropped tool
      // names, keyed by session id). The in-memory panel record above stays capped.
      if (sink) {
        const full: SessionSinkRow = { ...record, sessionId: sessionKey(id) };
        if (Array.isArray(entry.tools)) {
          const allNames = (entry.tools as unknown[]).filter((name): name is string => typeof name === 'string' && Boolean(name.trim())).map(name => name.trim());
          if (allNames.length > 0) full.tools = allNames;
        }
        try { sink(full); } catch { /* persistence is best effort */ }
      }
      bump(sessionKey(id), state);
    },
  };
}
