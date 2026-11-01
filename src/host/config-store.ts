import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isObject as safeObject, isProbability as probability } from './types.js';
import type {
  CheckSettings, CompleteSettings, ConfigView, DangerRuleAdditions, FeatureKey, Features,
  GateSettings, NarrowSettings, ResolvedConfig,
} from './types.js';

export const DEFAULT_URL = 'https://api.typesafe.ai';
export const DEFAULT_MODEL = 'jev-latest';

export function configPath(env: Record<string, string | undefined> = process.env): string {
  return env.DSH_DECISION_CONFIG_PATH?.trim() || join(homedir(), '.config', 'dsh-decision-layer', 'config.json');
}

async function readStored(path: string): Promise<Record<string, unknown>> {
  try {
    const value: unknown = JSON.parse(await readFile(path, 'utf8'));
    if (!safeObject(value)) throw new Error('Invalid decision configuration');
    return value;
  } catch (error) {
    if ((error as { code?: string } | undefined)?.code === 'ENOENT') return {};
    throw error;
  }
}

function safeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function checkedUrl(value: string): string {
  if (!value) return '';
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Invalid URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Invalid URL: expected an HTTP(S) address without credentials, query or fragment');
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

const RULE_FIELDS = ['addToolNames', 'removeToolNames', 'addCommandPatterns', 'addPathPatterns'] as const;

function validRules(value: unknown): DangerRuleAdditions | undefined {
  if (!safeObject(value)) return undefined;
  if (Object.keys(value).some(key => !RULE_FIELDS.includes(key as typeof RULE_FIELDS[number]))) throw new Error('Invalid danger rules');
  const rules: DangerRuleAdditions = {};
  for (const field of RULE_FIELDS) {
    const raw = value[field];
    if (raw !== undefined && (!Array.isArray(raw) || raw.length > 64 || raw.some(item => typeof item !== 'string' || !item.trim() || item.length > 128))) {
      throw new Error('Invalid danger rules');
    }
    if (raw !== undefined) rules[field] = (raw as string[]).map(item => item.trim());
  }
  return rules;
}

// Danger-gate settings. A gate verdict only intervenes on a high-confidence
// `deny`, so minConfidence is the single knob that decides how sure the model
// must be before a dangerous call is actually blocked. Lowering it makes the
// gate block more (and risk blocking legitimate commands); raising it makes it
// pass more through. Range 0–1; unset uses the built-in 0.6.
//
// Like every sibling validator, an unknown field or an out-of-range value is
// REJECTED rather than ignored, which makes the whole resolve reject (see the
// contract note on saveConfig). Callers that read config on a hot path must
// therefore tolerate a throw and fall back to a safe default — see `featureOn`
// in index.ts and `resolveMinConfidence` in danger-gate.ts.
function validGate(value: unknown): GateSettings | undefined {
  if (!safeObject(value)) return undefined;
  if (Object.keys(value).some(key => key !== 'minConfidence')) throw new Error('Invalid gate settings');
  const gate: GateSettings = {};
  if (value.minConfidence !== undefined) {
    if (!probability(value.minConfidence)) throw new Error('Invalid gate settings');
    gate.minConfidence = value.minConfidence;
  }
  return gate;
}

const CHECK_FIELDS = ['mode', 'rubric', 'lowScoreThreshold', 'minConfidence', 'trendMinConfidence', 'trendRun', 'trendSevereRun'] as const;

function validCheck(value: unknown): CheckSettings | undefined {
  if (!safeObject(value)) return undefined;
  if (Object.keys(value).some(key => !CHECK_FIELDS.includes(key as typeof CHECK_FIELDS[number]))) throw new Error('Invalid self-check settings');
  const check: CheckSettings = {};
  if (value.mode !== undefined) {
    if (value.mode !== 'observe' && value.mode !== 'steer') throw new Error('Invalid self-check settings');
    check.mode = value.mode;
  }
  if (value.rubric !== undefined) {
    if (!Array.isArray(value.rubric) || value.rubric.length > 10 || value.rubric.some(item => typeof item !== 'string' || !item.trim() || item.length > 256)) {
      throw new Error('Invalid self-check settings');
    }
    check.rubric = (value.rubric as string[]).map(item => item.trim());
  }
  if (value.lowScoreThreshold !== undefined) {
    if (!Number.isSafeInteger(value.lowScoreThreshold) || (value.lowScoreThreshold as number) < 0 || (value.lowScoreThreshold as number) > 9) throw new Error('Invalid self-check settings');
    check.lowScoreThreshold = value.lowScoreThreshold as number;
  }
  // Confidence required before a low score actually triggers the supplemental
  // prompt. Below this the score is still logged; only interrupting the user
  // warrants the model being sure. Range 0–1; unset uses the built-in 0.4.
  if (value.minConfidence !== undefined) {
    if (!probability(value.minConfidence)) throw new Error('Invalid self-check settings');
    check.minConfidence = value.minConfidence;
  }
  // Quality-trend alarm thresholds (all unvalidated heuristics, tuned on real logs):
  // a high-confidence low score requires confidence ≥ trendMinConfidence; a run of
  // trendRun such scores raises "warn", trendSevereRun raises "severe".
  if (value.trendMinConfidence !== undefined) {
    if (!probability(value.trendMinConfidence)) throw new Error('Invalid self-check settings');
    check.trendMinConfidence = value.trendMinConfidence;
  }
  if (value.trendRun !== undefined) {
    if (!Number.isSafeInteger(value.trendRun) || (value.trendRun as number) < 2 || (value.trendRun as number) > 10) throw new Error('Invalid self-check settings');
    check.trendRun = value.trendRun as number;
  }
  if (value.trendSevereRun !== undefined) {
    if (!Number.isSafeInteger(value.trendSevereRun) || (value.trendSevereRun as number) < 2 || (value.trendSevereRun as number) > 20) throw new Error('Invalid self-check settings');
    check.trendSevereRun = value.trendSevereRun as number;
  }
  // The severe threshold must sit strictly above the warn threshold; check against
  // the effective warn value (explicit or default 3) so the pair is always ordered.
  if (check.trendSevereRun !== undefined) {
    const warn = check.trendRun ?? 3;
    if (check.trendSevereRun <= warn) throw new Error('Invalid self-check settings');
  }
  return check;
}

const NARROW_FIELDS = ['mode', 'threshold', 'keepPrefixes', 'maxCandidates', 'batchMode'] as const;

function validNarrow(value: unknown): NarrowSettings | undefined {
  if (!safeObject(value)) return undefined;
  if (Object.keys(value).some(key => !NARROW_FIELDS.includes(key as typeof NARROW_FIELDS[number]))) throw new Error('Invalid narrowing settings');
  const narrow: NarrowSettings = {};
  if (value.mode !== undefined) {
    if (value.mode !== 'observe' && value.mode !== 'enforce') throw new Error('Invalid narrowing settings');
    narrow.mode = value.mode;
  }
  if (value.threshold !== undefined) {
    if (!probability(value.threshold)) throw new Error('Invalid narrowing settings');
    narrow.threshold = value.threshold;
  }
  // Tool name prefixes that are always kept and never judged for relevance, on
  // top of the built-in core tools. An explicit empty array clears the list; an
  // absent field lets narrowing fall back to its own default (mcp__openviking).
  if (value.keepPrefixes !== undefined) {
    if (!Array.isArray(value.keepPrefixes) || value.keepPrefixes.length > 32 ||
      value.keepPrefixes.some(item => typeof item !== 'string' || !item.trim() || item.length > 128)) {
      throw new Error('Invalid narrowing settings');
    }
    narrow.keepPrefixes = (value.keepPrefixes as string[]).map(item => item.trim());
  }
  // Optional-candidate ceiling: above this count, enforce is downgraded to
  // observe so a large tool surface is never mass-pruned. 1–200; unset uses the
  // narrowing default (20).
  if (value.maxCandidates !== undefined) {
    if (!Number.isSafeInteger(value.maxCandidates) || (value.maxCandidates as number) < 1 || (value.maxCandidates as number) > 200) throw new Error('Invalid narrowing settings');
    narrow.maxCandidates = value.maxCandidates as number;
  }
  // Per-request batching strategy for the relevance pass, chosen by backend
  // context capacity. 'single' sends every tool in one systemone request (best
  // for large-context backends like Jev — one call). 'split' sends one request
  // per tool concurrently (required for small-context backends like tev1, whose
  // ~2050-token prompt limit rejects a many-tool request). 'auto' (default)
  // tries 'single' first and falls back to 'split' only after a context-overflow
  // http-error, so Jev stays at one call and tev1 self-corrects.
  if (value.batchMode !== undefined) {
    if (value.batchMode !== 'auto' && value.batchMode !== 'single' && value.batchMode !== 'split') throw new Error('Invalid narrowing settings');
    narrow.batchMode = value.batchMode;
  }
  return narrow;
}

// Per-feature enable flags for the decision points. Every flag defaults to
// enabled; only an explicit `false` disables its decision point.
export const FEATURE_KEYS: readonly FeatureKey[] = Object.freeze(['gate', 'check', 'narrow', 'complete']);

// Task-completion checking settings: observe-only by default; steer opts into a
// single supplemental prompt on low completion. minConditions is the minimum
// number of explicit conditions a turn must have for the check to run at all;
// minConfidence is how sure the model must be that a condition is unmet before
// it actually opens the supplemental step.
function validComplete(value: unknown): CompleteSettings | undefined {
  if (!safeObject(value)) return undefined;
  if (Object.keys(value).some(key => !['mode', 'minConditions', 'minConfidence'].includes(key))) throw new Error('Invalid task-completion settings');
  const complete: CompleteSettings = {};
  if (value.mode !== undefined) {
    if (value.mode !== 'observe' && value.mode !== 'steer') throw new Error('Invalid task-completion settings');
    complete.mode = value.mode;
  }
  if (value.minConditions !== undefined) {
    if (!Number.isSafeInteger(value.minConditions) || (value.minConditions as number) < 2 || (value.minConditions as number) > 20) throw new Error('Invalid task-completion settings');
    complete.minConditions = value.minConditions as number;
  }
  // Range 0–1; unset uses the built-in 0.4.
  if (value.minConfidence !== undefined) {
    if (!probability(value.minConfidence)) throw new Error('Invalid task-completion settings');
    complete.minConfidence = value.minConfidence;
  }
  return complete;
}

function validFeatures(value: unknown): Features | undefined {
  if (!safeObject(value)) return undefined;
  if (Object.keys(value).some(key => !FEATURE_KEYS.includes(key as FeatureKey))) throw new Error('Invalid feature settings');
  const features: Features = {};
  for (const key of FEATURE_KEYS) {
    if (value[key] !== undefined) {
      if (typeof value[key] !== 'boolean') throw new Error('Invalid feature settings');
      features[key] = value[key] as boolean;
    }
  }
  return features;
}

// Resolve one decision point's enablement, defaulting to enabled when unset.
export function featureEnabled(features: Features | undefined, key: FeatureKey): boolean {
  return !(safeObject(features) && features[key] === false);
}

function view(stored: Record<string, unknown>): ConfigView {
  const result: ConfigView = {
    url: safeText(stored.url),
    model: safeText(stored.model),
    apiKeySet: Boolean(safeText(stored.apiKey)),
    httpApprovedUrl: safeText(stored.httpApprovedUrl),
  };
  if (stored.dangerRules !== undefined) result.dangerRules = validRules(stored.dangerRules);
  if (stored.gateSettings !== undefined) result.gateSettings = validGate(stored.gateSettings);
  if (stored.checkSettings !== undefined) result.checkSettings = validCheck(stored.checkSettings);
  if (stored.narrowSettings !== undefined) result.narrowSettings = validNarrow(stored.narrowSettings);
  if (stored.completeSettings !== undefined) result.completeSettings = validComplete(stored.completeSettings);
  if (stored.features !== undefined) result.features = validFeatures(stored.features);
  return result;
}

export async function loadConfig(path: string = configPath()): Promise<ConfigView> {
  return view(await readStored(path));
}

export async function resolveConfig({ path = configPath(), env = process.env }: { path?: string; env?: Record<string, string | undefined> } = {}): Promise<ResolvedConfig> {
  const stored = await readStored(path);
  const url = checkedUrl(safeText(stored.url) || safeText(env.DSH_DECISION_BASE_URL) || safeText(env.TYPESAFE_BASE_URL) || DEFAULT_URL);
  const resolved: ResolvedConfig = {
    url,
    apiKey: safeText(stored.apiKey) || safeText(env.DSH_DECISION_API_KEY) || safeText(env.TYPESAFE_API_KEY),
    model: safeText(stored.model) || safeText(env.DSH_DECISION_MODEL) || DEFAULT_MODEL,
    httpApprovedUrl: safeText(stored.httpApprovedUrl),
  };
  if (stored.dangerRules !== undefined) resolved.dangerRules = validRules(stored.dangerRules);
  if (stored.gateSettings !== undefined) resolved.gateSettings = validGate(stored.gateSettings);
  if (stored.checkSettings !== undefined) resolved.checkSettings = validCheck(stored.checkSettings);
  if (stored.narrowSettings !== undefined) resolved.narrowSettings = validNarrow(stored.narrowSettings);
  if (stored.completeSettings !== undefined) resolved.completeSettings = validComplete(stored.completeSettings);
  if (stored.features !== undefined) resolved.features = validFeatures(stored.features);
  return resolved;
}

const SAVE_FIELDS = ['url', 'apiKey', 'model', 'confirmHttpUrl', 'dangerRules', 'gateSettings', 'checkSettings', 'narrowSettings', 'completeSettings', 'features'] as const;
const TEXT_FIELDS = ['url', 'apiKey', 'model', 'confirmHttpUrl'] as const;

// Write the configuration atomically. Contract for the nested settings sections
// (dangerRules, gateSettings, checkSettings, narrowSettings, completeSettings,
// features): a POSTED section REPLACES the stored one wholesale; an OMITTED
// section keeps its previous value. So a caller updating one field of a section
// must send the whole section, and a caller that wants to change a field inside
// a section it does not own must read first and send `{...previous, edit}`.
// Merge-per-field was considered and rejected: it would make a stored field
// impossible to unset. manager-api.ts forwards the raw body, so this contract
// holds for API clients too, not just the config page.
export async function saveConfig(input: Record<string, unknown>, path: string = configPath()): Promise<ConfigView> {
  if (!safeObject(input) || Object.keys(input).some(key => !SAVE_FIELDS.includes(key as typeof SAVE_FIELDS[number]))) {
    throw new Error('Invalid configuration fields');
  }
  for (const key of TEXT_FIELDS) {
    if (input[key] !== undefined && typeof input[key] !== 'string') throw new Error(`Invalid ${key}`);
  }
  const previous = await readStored(path);
  const url = checkedUrl(safeText(input.url === undefined ? previous.url : input.url));
  const apiKey = safeText(input.apiKey === undefined ? previous.apiKey : input.apiKey);
  const model = safeText(input.model === undefined ? previous.model : input.model);
  if (model.length > 128 || /[\r\n]/.test((input.model ?? '') as string) || /[\r\n]/.test((input.apiKey ?? '') as string)) {
    throw new Error('Invalid model or API key');
  }
  const dangerRules = input.dangerRules === undefined ? previous.dangerRules : validRules(input.dangerRules);
  const gateSettings = input.gateSettings === undefined ? previous.gateSettings : validGate(input.gateSettings);
  const checkSettings = input.checkSettings === undefined ? previous.checkSettings : validCheck(input.checkSettings);
  const narrowSettings = input.narrowSettings === undefined ? previous.narrowSettings : validNarrow(input.narrowSettings);
  const completeSettings = input.completeSettings === undefined ? previous.completeSettings : validComplete(input.completeSettings);
  const features = input.features === undefined ? previous.features : validFeatures(input.features);
  const confirmed = url.startsWith('http://') && input.confirmHttpUrl !== undefined &&
    checkedUrl(safeText(input.confirmHttpUrl)) === url;
  if (url.startsWith('http://') && !confirmed && previous.httpApprovedUrl !== url) {
    throw new Error('HTTP URL requires explicit confirmation');
  }
  const next: Record<string, unknown> = { url, apiKey, model, httpApprovedUrl: url.startsWith('http://') ? url : '' };
  if (dangerRules !== undefined) next.dangerRules = dangerRules;
  if (gateSettings !== undefined) next.gateSettings = gateSettings;
  if (checkSettings !== undefined) next.checkSettings = checkSettings;
  if (narrowSettings !== undefined) next.narrowSettings = narrowSettings;
  if (completeSettings !== undefined) next.completeSettings = completeSettings;
  if (features !== undefined) next.features = features;
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(next)}\n`, { mode: 0o600, flag: 'wx' });
    await chmod(temporary, 0o600);
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
  return view(next);
}
