import { redactCredentials } from './excerpt.js';
import { isObject } from './types.js';
import type { LogRow } from './types.js';

const KINDS = new Set(['gate', 'check', 'narrow', 'complete', 'checkpoint']);
const TRIGGERS = new Set(['heartbeat', 'unresolved_failure', 'verification_after_change']);
const INTEGER_FIELDS = ['turn', 'step', 'dropped', 'kept', 'candidates', 'conditions', 'satisfied', 'unsatisfied', 'insufficient',
  'throughSeq', 'evidenceCount', 'inputTokens', 'outputTokens', 'requestBytes', 'backendAttempts'] as const;

/** The same whitelist protects live logs, restored snapshots and browser rows. */
export function sanitizeLogRow(value: unknown): LogRow | undefined {
  if (!isObject(value) || typeof value.kind !== 'string' || !KINDS.has(value.kind)) return undefined;
  const row: LogRow = { kind: value.kind as LogRow['kind'] };
  for (const [key, limit] of [['id', 160], ['tool', 128], ['suggestion', 16], ['action', 32], ['reason', 64],
    ['subject', 120], ['task', 512], ['command', 512], ['path', 512], ['mode', 16], ['requestId', 160], ['callId', 160], ['model', 128]] as const) {
    const text = value[key];
    if (typeof text === 'string' && text.trim()) row[key] = redactCredentials(text).replace(/\s+/g, ' ').trim().slice(0, limit);
  }
  for (const key of INTEGER_FIELDS) {
    const n = value[key];
    if (Number.isSafeInteger(n) && (n as number) >= 0) row[key] = n as number;
  }
  for (const key of ['at', 'latencyMs', 'score', 'confidence'] as const) {
    const n = value[key];
    if (typeof n === 'number' && Number.isFinite(n) && n >= 0 && (key !== 'confidence' || n <= 1)) {
      row[key] = key === 'at' ? n : Math.round(n * 100) / 100;
    }
  }
  row.outcome = typeof value.outcome === 'string' ? value.outcome.slice(0, 32) : '';
  if (typeof value.applied === 'boolean') row.applied = value.applied;
  if (typeof value.steered === 'boolean') row.steered = value.steered;
  if (value.lowConfidence === true) row.lowConfidence = true;
  if (typeof value.trigger === 'string' && TRIGGERS.has(value.trigger)) row.trigger = value.trigger as LogRow['trigger'];
  if (Array.isArray(value.tools)) {
    const names = value.tools.filter((name): name is string => typeof name === 'string' && Boolean(name.trim()))
      .slice(0, 64).map(name => redactCredentials(name.trim()).slice(0, 128));
    if (names.length) row.tools = names;
  }
  return row;
}
