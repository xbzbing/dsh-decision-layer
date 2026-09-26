import { loadConfig, resolveConfig, saveConfig } from './config-store.mjs';

export const API_PREFIX = '/plugins/dsh-decision-layer/api';
const BODY_LIMIT = 32 * 1024;

function respond(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' });
  res.end(JSON.stringify(value));
}

function authorizedBrowser(req) {
  const address = req.socket?.remoteAddress;
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)) return false;
  const host = req.headers.host;
  if (typeof host !== 'string' || !/^(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(host)) return false;
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  const origin = req.headers.origin;
  if (origin === undefined) return req.method === 'GET';
  try {
    const parsed = new URL(origin);
    return ['http:', 'https:'].includes(parsed.protocol) && parsed.host === host;
  } catch { return false; }
}

async function readBody(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new Error('Expected JSON');
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > BODY_LIMIT) throw new Error('Request too large');
    chunks.push(chunk);
  }
  const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected object');
  return value;
}

export function createManagerRoutes({ path, sessions, backend, env = process.env, bindHost = '127.0.0.1' }) {
  const route = (suffix, methods) => ({ kind: 'exact', path: `${API_PREFIX}/${suffix}`, handler: async (req, res) => {
    if (bindHost !== '127.0.0.1' || !authorizedBrowser(req)) return respond(res, 403, { ok: false, error: 'Local same-origin browser request required' });
    if (!Object.hasOwn(methods, req.method)) return respond(res, 405, { ok: false, error: 'Method not allowed' });
    try {
      const value = await methods[req.method](req);
      return respond(res, 200, { ok: true, value });
    } catch (error) {
      if (error?.code === 'BAD_REQUEST') return respond(res, 400, { ok: false, error: error.message });
      return respond(res, 400, { ok: false, error: 'Invalid request or backend unavailable' });
    }
  } });
  const sessionId = req => {
    const id = new URL(req.url ?? '/', 'http://localhost').searchParams.get('sessionId');
    if (!id) { const error = new Error('sessionId is required'); error.code = 'BAD_REQUEST'; throw error; }
    return id;
  };
  return [
    route('config', {
      GET: async () => ({ ...(await loadConfig(path)), effectiveUrl: (await resolveConfig({ path, env })).url }),
      PUT: async req => {
        const saved = await saveConfig(await readBody(req), path);
        return { ...saved, effectiveUrl: (await resolveConfig({ path, env })).url };
      },
    }),
    route('probe', {
      POST: async () => {
        const effectiveUrl = (await resolveConfig({ path, env })).url;
        try {
          const result = await backend.evaluate({ state: 'Connection test', questions: {
            connected: { type: 'noul', instructions: 'Is this a connection test?' },
          } });
          return { connected: true, model: result.model, usage: result.usage, effectiveUrl };
        } catch { return { connected: false, reason: 'unavailable', effectiveUrl }; }
      },
    }),
    route('metrics', { GET: req => sessions.snapshot(sessionId(req)) }),
    route('log', { GET: req => ({ entries: sessions.snapshot(sessionId(req)).log ?? [] }) }),
    route('session', {
      GET: req => sessions.snapshot(sessionId(req)),
      PUT: async req => {
        const body = await readBody(req);
        sessions.setEnabled(body.sessionId, body.enabled);
        return sessions.snapshot(body.sessionId);
      },
    }),
  ];
}
