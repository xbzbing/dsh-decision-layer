import { setTimeout as wait } from 'node:timers/promises';
import { DEFAULT_MODEL } from './config-store.mjs';

const REQUEST_LIMIT = 256 * 1024;
const RESPONSE_LIMIT = 1024 * 1024;
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isContent = value => typeof value === 'string' ? value.trim().length > 0 : isObject(value) || Array.isArray(value);
const probability = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

// A backend failure carries a stable `reason` code so callers can surface the
// specific cause (unreachable / http-error / invalid-response / config) instead
// of a single generic error.
function backendError(reason, message) {
  const error = new Error(message);
  error.reason = reason;
  return error;
}

export function validateRequest(input) {
  if (!isObject(input) || !isContent(input.state) || !isObject(input.questions)) throw new Error('Invalid state or questions');
  const questions = Object.entries(input.questions);
  if (questions.length < 1 || questions.length > 64) throw new Error('Invalid question count');
  for (const [id, question] of questions) {
    if (!id.trim() || id.length > 160 || !isObject(question) || !isContent(question.instructions)) throw new Error('Invalid question');
    if (question.type === 'choice') {
      if (!isObject(question.criteria) || Object.keys(question.criteria).length < 2 || Object.keys(question.criteria).length > 255 ||
        Object.entries(question.criteria).some(([key, value]) => !key.trim() || (value !== null && !isContent(value)))) throw new Error('Invalid choice criteria');
    } else if (question.type === 'score') {
      if (!Array.isArray(question.criteria) || question.criteria.length < 2 || question.criteria.length > 10 || !question.criteria.every(isContent)) throw new Error('Invalid score criteria');
    } else if (question.type !== 'noul' || (question.criteria !== undefined && (!isObject(question.criteria) || Object.keys(question.criteria).some(key => !['true', 'false'].includes(key))))) {
      throw new Error('Invalid question type or criteria');
    }
  }
  let encoded;
  try {
    encoded = JSON.stringify(input, (key, value) => {
      if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint' || (typeof value === 'number' && !Number.isFinite(value))) throw new Error('Invalid JSON');
      return value;
    });
  } catch { throw new Error('Invalid JSON payload'); }
  if (Buffer.byteLength(encoded) > REQUEST_LIMIT) throw new Error('Request too large');
  return { state: input.state, questions: input.questions };
}

function validateAnswer(value, question) {
  if (!isObject(value) || value.type !== question.type) throw backendError('invalid-response', 'Invalid response answer');
  if (question.type === 'noul') {
    if (!probability(value.noul)) throw backendError('invalid-response', 'Invalid response probability');
    return { type: 'noul', noul: value.noul };
  }
  const keys = question.type === 'choice' ? Object.keys(question.criteria) : question.criteria.map((_, i) => String(i));
  if (!isObject(value.probabilities) || !probability(value.confidence) ||
    Object.keys(value.probabilities).length !== keys.length || keys.some(key => !probability(value.probabilities[key])) ||
    Math.abs(keys.reduce((sum, key) => sum + value.probabilities[key], 0) - 1) > 0.02) throw backendError('invalid-response', 'Invalid response probabilities');
  const common = { type: value.type, confidence: value.confidence, probabilities: Object.fromEntries(keys.map(key => [key, value.probabilities[key]])) };
  if (question.type === 'choice') {
    if (typeof value.choice !== 'string' || !keys.includes(value.choice)) throw backendError('invalid-response', 'Invalid response choice');
    return { ...common, choice: value.choice };
  }
  if (typeof value.score !== 'number' || !Number.isFinite(value.score) || value.score < 0 || value.score > keys.length - 1) throw backendError('invalid-response', 'Invalid response score');
  return { ...common, score: value.score };
}

function validateResponse(value, questions) {
  if (!isObject(value) || !isObject(value.answers) || typeof value.model !== 'string') throw backendError('invalid-response', 'Invalid response');
  const answers = Object.create(null);
  for (const [id, question] of Object.entries(questions)) answers[id] = validateAnswer(value.answers[id], question);
  return { model: value.model, answers, usage: isObject(value.usage) ? {
    input_tokens: Number.isSafeInteger(value.usage.input_tokens) ? value.usage.input_tokens : 0,
    output_tokens: Number.isSafeInteger(value.usage.output_tokens) ? value.usage.output_tokens : 0,
  } : undefined };
}

async function boundedJson(response) {
  const reader = response.body?.getReader();
  if (!reader) throw backendError('invalid-response', 'Invalid response body');
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > RESPONSE_LIMIT) throw backendError('invalid-response', 'Invalid response size');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw backendError('invalid-response', 'Invalid response JSON'); }
}

export function createBackend({ config, fetcher = globalThis.fetch, timeoutMs = 20_000, retryDelayMs = 200 }) {
  if (typeof config !== 'function' || typeof fetcher !== 'function' ||
    !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || !Number.isSafeInteger(retryDelayMs) || retryDelayMs < 0 || retryDelayMs > 5000) {
    throw new Error('Invalid backend dependencies');
  }
  return {
    async evaluate(input, { signal } = {}) {
      const { state, questions } = validateRequest(input);
      const settings = await config();
      const key = settings.apiKey?.trim();
      if (!key || /[\r\n]/.test(key)) throw backendError('config', 'API key is required');
      let url;
      try { url = new URL(settings.url); } catch { throw backendError('config', 'Invalid backend URL'); }
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw backendError('config', 'Invalid backend URL');
      if (url.protocol === 'http:' && settings.httpApprovedUrl !== settings.url) throw backendError('config', 'HTTP URL requires confirmation');
      const model = settings.model || DEFAULT_MODEL;
      if (typeof model !== 'string' || !model.trim() || /[\r\n]/.test(model)) throw backendError('config', 'Invalid model');
      const endpoint = new URL(url.href);
      endpoint.pathname = `${url.pathname.replace(/\/+$/, '')}/v1/systemone`;
      if (endpoint.origin !== url.origin) throw backendError('config', 'Invalid backend endpoint');
      const timeout = AbortSignal.timeout(timeoutMs);
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
      for (let attempt = 0; attempt < 3; attempt++) {
        let reply;
        try {
          reply = await fetcher(endpoint.href, { method: 'POST', redirect: 'error', signal: combined,
            headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ state, questions, model }) });
        } catch { throw backendError('unreachable', 'Backend request failed or timed out'); }
        if (reply.ok) return validateResponse(await boundedJson(reply), questions);
        await reply.body?.cancel().catch(() => {});
        if (![429, 529].includes(reply.status) || attempt === 2) throw backendError('http-error', `Backend HTTP ${reply.status}`);
        try { await wait(retryDelayMs * (attempt + 1), undefined, { signal: combined }); }
        catch { throw backendError('unreachable', 'Backend request failed or timed out'); }
      }
    },
  };
}
