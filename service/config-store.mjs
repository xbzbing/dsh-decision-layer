import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

export const DEFAULT_URL = 'https://api.typesafe.ai';
export const DEFAULT_MODEL = 'jev-latest';

export function configPath(env = process.env) {
  return env.DSH_DECISION_CONFIG_PATH?.trim() || join(homedir(), '.config', 'dsh-decision-layer', 'config.json');
}

function safeObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function readStored(path) {
  try {
    const value = JSON.parse(await readFile(path, 'utf8'));
    if (!safeObject(value)) throw new Error('Invalid decision configuration');
    return value;
  } catch (error) {
    if (error?.code === 'ENOENT') return {};
    throw error;
  }
}

function safeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function checkedUrl(value) {
  if (!value) return '';
  let url;
  try { url = new URL(value); } catch { throw new Error('Invalid URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Invalid URL: expected an HTTP(S) address without credentials, query or fragment');
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

function validRules(value) {
  if (!safeObject(value)) return undefined;
  const fields = ['addToolNames', 'removeToolNames', 'addCommandPatterns', 'addPathPatterns'];
  if (Object.keys(value).some(key => !fields.includes(key))) throw new Error('Invalid danger rules');
  const rules = {};
  for (const field of fields) {
    if (value[field] !== undefined && (!Array.isArray(value[field]) || value[field].length > 64 || value[field].some(item => typeof item !== 'string' || !item.trim() || item.length > 128))) {
      throw new Error('Invalid danger rules');
    }
    if (value[field] !== undefined) rules[field] = value[field].map(item => item.trim());
  }
  return rules;
}

function validCheck(value) {
  if (!safeObject(value)) return undefined;
  if (Object.keys(value).some(key => !['mode', 'rubric', 'lowScoreThreshold', 'trendMinConfidence', 'trendRun', 'trendSevereRun'].includes(key))) throw new Error('Invalid self-check settings');
  const check = {};
  if (value.mode !== undefined) {
    if (value.mode !== 'observe' && value.mode !== 'steer') throw new Error('Invalid self-check settings');
    check.mode = value.mode;
  }
  if (value.rubric !== undefined) {
    if (!Array.isArray(value.rubric) || value.rubric.length > 10 || value.rubric.some(item => typeof item !== 'string' || !item.trim() || item.length > 256)) {
      throw new Error('Invalid self-check settings');
    }
    check.rubric = value.rubric.map(item => item.trim());
  }
  if (value.lowScoreThreshold !== undefined) {
    if (!Number.isSafeInteger(value.lowScoreThreshold) || value.lowScoreThreshold < 0 || value.lowScoreThreshold > 9) throw new Error('Invalid self-check settings');
    check.lowScoreThreshold = value.lowScoreThreshold;
  }
  // Quality-trend alarm thresholds (all unvalidated heuristics, tuned on real logs):
  // a high-confidence low score requires confidence ≥ trendMinConfidence; a run of
  // trendRun such scores raises "warn", trendSevereRun raises "severe".
  if (value.trendMinConfidence !== undefined) {
    if (typeof value.trendMinConfidence !== 'number' || !Number.isFinite(value.trendMinConfidence) || value.trendMinConfidence < 0 || value.trendMinConfidence > 1) throw new Error('Invalid self-check settings');
    check.trendMinConfidence = value.trendMinConfidence;
  }
  if (value.trendRun !== undefined) {
    if (!Number.isSafeInteger(value.trendRun) || value.trendRun < 2 || value.trendRun > 10) throw new Error('Invalid self-check settings');
    check.trendRun = value.trendRun;
  }
  if (value.trendSevereRun !== undefined) {
    if (!Number.isSafeInteger(value.trendSevereRun) || value.trendSevereRun < 2 || value.trendSevereRun > 20) throw new Error('Invalid self-check settings');
    check.trendSevereRun = value.trendSevereRun;
  }
  // The severe threshold must sit strictly above the warn threshold; check against
  // the effective warn value (explicit or default 3) so the pair is always ordered.
  if (check.trendSevereRun !== undefined) {
    const warn = check.trendRun ?? 3;
    if (check.trendSevereRun <= warn) throw new Error('Invalid self-check settings');
  }
  return check;
}

function validNarrow(value) {
  if (!safeObject(value)) return undefined;
  if (Object.keys(value).some(key => !['mode', 'threshold', 'keepPrefixes', 'maxCandidates'].includes(key))) throw new Error('Invalid narrowing settings');
  const narrow = {};
  if (value.mode !== undefined) {
    if (value.mode !== 'observe' && value.mode !== 'enforce') throw new Error('Invalid narrowing settings');
    narrow.mode = value.mode;
  }
  if (value.threshold !== undefined) {
    if (typeof value.threshold !== 'number' || !Number.isFinite(value.threshold) || value.threshold < 0 || value.threshold > 1) throw new Error('Invalid narrowing settings');
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
    narrow.keepPrefixes = value.keepPrefixes.map(item => item.trim());
  }
  // Optional-candidate ceiling: above this count, enforce is downgraded to
  // observe so a large tool surface is never mass-pruned. 1–200; unset uses the
  // narrowing default (20).
  if (value.maxCandidates !== undefined) {
    if (!Number.isSafeInteger(value.maxCandidates) || value.maxCandidates < 1 || value.maxCandidates > 200) throw new Error('Invalid narrowing settings');
    narrow.maxCandidates = value.maxCandidates;
  }
  return narrow;
}

// Per-feature enable flags for the decision points. Every flag defaults to
// enabled; only an explicit `false` disables its decision point.
export const FEATURE_KEYS = Object.freeze(['gate', 'check', 'narrow', 'complete']);

// Task-completion checking settings: observe-only by default; steer opts into a
// single supplemental prompt on low completion. minConditions is the minimum
// number of explicit conditions a turn must have for the check to run at all.
function validComplete(value) {
  if (!safeObject(value)) return undefined;
  if (Object.keys(value).some(key => !['mode', 'minConditions'].includes(key))) throw new Error('Invalid task-completion settings');
  const complete = {};
  if (value.mode !== undefined) {
    if (value.mode !== 'observe' && value.mode !== 'steer') throw new Error('Invalid task-completion settings');
    complete.mode = value.mode;
  }
  if (value.minConditions !== undefined) {
    if (!Number.isSafeInteger(value.minConditions) || value.minConditions < 2 || value.minConditions > 20) throw new Error('Invalid task-completion settings');
    complete.minConditions = value.minConditions;
  }
  return complete;
}

function validFeatures(value) {
  if (!safeObject(value)) return undefined;
  if (Object.keys(value).some(key => !FEATURE_KEYS.includes(key))) throw new Error('Invalid feature settings');
  const features = {};
  for (const key of FEATURE_KEYS) {
    if (value[key] !== undefined) {
      if (typeof value[key] !== 'boolean') throw new Error('Invalid feature settings');
      features[key] = value[key];
    }
  }
  return features;
}

// Resolve one decision point's enablement, defaulting to enabled when unset.
export function featureEnabled(features, key) {
  return !(safeObject(features) && features[key] === false);
}

function view(stored) {
  const result = {
    url: safeText(stored.url),
    model: safeText(stored.model),
    apiKeySet: Boolean(safeText(stored.apiKey)),
    httpApprovedUrl: safeText(stored.httpApprovedUrl),
  };
  if (stored.dangerRules !== undefined) result.dangerRules = validRules(stored.dangerRules);
  if (stored.checkSettings !== undefined) result.checkSettings = validCheck(stored.checkSettings);
  if (stored.narrowSettings !== undefined) result.narrowSettings = validNarrow(stored.narrowSettings);
  if (stored.completeSettings !== undefined) result.completeSettings = validComplete(stored.completeSettings);
  if (stored.features !== undefined) result.features = validFeatures(stored.features);
  return result;
}

export async function loadConfig(path = configPath()) {
  return view(await readStored(path));
}

export async function resolveConfig({ path = configPath(), env = process.env } = {}) {
  const stored = await readStored(path);
  const url = checkedUrl(safeText(stored.url) || safeText(env.DSH_DECISION_BASE_URL) || safeText(env.TYPESAFE_BASE_URL) || DEFAULT_URL);
  const resolved = {
    url,
    apiKey: safeText(stored.apiKey) || safeText(env.DSH_DECISION_API_KEY) || safeText(env.TYPESAFE_API_KEY),
    model: safeText(stored.model) || safeText(env.DSH_DECISION_MODEL) || DEFAULT_MODEL,
    httpApprovedUrl: safeText(stored.httpApprovedUrl),
  };
  if (stored.dangerRules !== undefined) resolved.dangerRules = validRules(stored.dangerRules);
  if (stored.checkSettings !== undefined) resolved.checkSettings = validCheck(stored.checkSettings);
  if (stored.narrowSettings !== undefined) resolved.narrowSettings = validNarrow(stored.narrowSettings);
  if (stored.completeSettings !== undefined) resolved.completeSettings = validComplete(stored.completeSettings);
  if (stored.features !== undefined) resolved.features = validFeatures(stored.features);
  return resolved;
}

export async function saveConfig(input, path = configPath()) {
  if (!safeObject(input) || Object.keys(input).some(key => !['url', 'apiKey', 'model', 'confirmHttpUrl', 'dangerRules', 'checkSettings', 'narrowSettings', 'completeSettings', 'features'].includes(key))) {
    throw new Error('Invalid configuration fields');
  }
  for (const key of ['url', 'apiKey', 'model', 'confirmHttpUrl']) {
    if (input[key] !== undefined && typeof input[key] !== 'string') throw new Error(`Invalid ${key}`);
  }
  const previous = await readStored(path);
  const url = checkedUrl(safeText(input.url === undefined ? previous.url : input.url));
  const apiKey = safeText(input.apiKey === undefined ? previous.apiKey : input.apiKey);
  const model = safeText(input.model === undefined ? previous.model : input.model);
  if (model.length > 128 || /[\r\n]/.test(input.model ?? '') || /[\r\n]/.test(input.apiKey ?? '')) {
    throw new Error('Invalid model or API key');
  }
  const dangerRules = input.dangerRules === undefined ? previous.dangerRules : validRules(input.dangerRules);
  const checkSettings = input.checkSettings === undefined ? previous.checkSettings : validCheck(input.checkSettings);
  const narrowSettings = input.narrowSettings === undefined ? previous.narrowSettings : validNarrow(input.narrowSettings);
  const completeSettings = input.completeSettings === undefined ? previous.completeSettings : validComplete(input.completeSettings);
  const features = input.features === undefined ? previous.features : validFeatures(input.features);
  const confirmed = url.startsWith('http://') && input.confirmHttpUrl !== undefined &&
    checkedUrl(safeText(input.confirmHttpUrl)) === url;
  if (url.startsWith('http://') && !confirmed && previous.httpApprovedUrl !== url) {
    throw new Error('HTTP URL requires explicit confirmation');
  }
  const next = { url, apiKey, model, httpApprovedUrl: url.startsWith('http://') ? url : '' };
  if (dangerRules !== undefined) next.dangerRules = dangerRules;
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
