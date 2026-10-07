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

export function createManagerRoutes({ path, sessions, backend, logStore, analyze, env = process.env, bindHost = '127.0.0.1' }) {
  const route = (suffix, methods) => ({ kind: 'exact', path: `${API_PREFIX}/${suffix}`, handler: async (req, res) => {
    if (bindHost !== '127.0.0.1' || !authorizedBrowser(req)) return respond(res, 403, { ok: false, error: 'Local same-origin browser request required' });
    if (!Object.hasOwn(methods, req.method)) return respond(res, 405, { ok: false, error: 'Method not allowed' });
    try {
      const value = await methods[req.method](req);
      return respond(res, 200, { ok: true, value });
    } catch (error) {
      // A genuine internal fault (log analysis / annotation write) is a 500; a
      // tagged or untagged validation/config error stays a client 400. Neither
      // body carries error internals.
      if (error?.code === 'INTERNAL') return respond(res, 500, { ok: false, error: 'Internal error' });
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
    route('metrics', { GET: async req => { const id = sessionId(req); await sessions.ensureLoaded?.(id); return sessions.snapshot(id); } }),
    route('log', { GET: async req => { const id = sessionId(req); await sessions.ensureLoaded?.(id); return { entries: sessions.snapshot(id).log ?? [] }; } }),
    // Read-only analysis over the persisted decision logs for one session. Returns
    // only aggregates and annotation counts — never raw log rows — so gate command
    // / path fragments are not echoed back to the browser.
    route('logs', {
      GET: async req => {
        if (typeof analyze !== 'function') { const error = new Error('analysis unavailable'); error.code = 'BAD_REQUEST'; throw error; }
        const id = sessionId(req);
        try { return await analyze(id); }
        catch (error) { if (error?.code === 'BAD_REQUEST') throw error; const wrapped = new Error('analysis failed'); wrapped.code = 'INTERNAL'; throw wrapped; }
      },
    }),
    // Append one annotation event for a decision. Explicit user intent: validated
    // and written immediately; a write failure surfaces as an error, not silence.
    route('annotate', {
      POST: async req => {
        if (!logStore || typeof logStore.appendAnnotation !== 'function') { const error = new Error('annotation unavailable'); error.code = 'BAD_REQUEST'; throw error; }
        const body = await readBody(req);
        const target = typeof body.target === 'string' ? body.target.trim() : '';
        const rating = body.rating;
        const session = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
        if (!target || target.length > 128 || !['good', 'bad', 'unsure'].includes(rating) || !session || session.length > 512) {
          const error = new Error('Invalid annotation'); error.code = 'BAD_REQUEST'; throw error;
        }
        // A validated write that still fails is an internal fault (disk / IO), not
        // bad input: surface it as 500 so the client does not read it as a 400.
        try { await logStore.appendAnnotation({ kind: 'annotation', target, rating, sessionId: session }); }
        catch { const error = new Error('annotation write failed'); error.code = 'INTERNAL'; throw error; }
        return { ok: true, target, rating };
      },
    }),
    route('session', {
      GET: async req => { const id = sessionId(req); await sessions.ensureLoaded?.(id); return sessions.snapshot(id); },
      PUT: async req => {
        const body = await readBody(req);
        await sessions.ensureLoaded?.(body.sessionId);
        sessions.setEnabled(body.sessionId, body.enabled);
        return sessions.snapshot(body.sessionId);
      },
    }),
  ];
}
