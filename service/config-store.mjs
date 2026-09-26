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

function view(stored) {
  const result = {
    url: safeText(stored.url),
    model: safeText(stored.model),
    apiKeySet: Boolean(safeText(stored.apiKey)),
    httpApprovedUrl: safeText(stored.httpApprovedUrl),
  };
  if (stored.dangerRules !== undefined) result.dangerRules = validRules(stored.dangerRules);
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
  return resolved;
}

export async function saveConfig(input, path = configPath()) {
  if (!safeObject(input) || Object.keys(input).some(key => !['url', 'apiKey', 'model', 'confirmHttpUrl', 'dangerRules'].includes(key))) {
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
  const confirmed = url.startsWith('http://') && input.confirmHttpUrl !== undefined &&
    checkedUrl(safeText(input.confirmHttpUrl)) === url;
  if (url.startsWith('http://') && !confirmed && previous.httpApprovedUrl !== url) {
    throw new Error('HTTP URL requires explicit confirmation');
  }
  const next = { url, apiKey, model, httpApprovedUrl: url.startsWith('http://') ? url : '' };
  if (dangerRules !== undefined) next.dangerRules = dangerRules;
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
