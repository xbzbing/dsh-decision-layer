import { loadConfig, resolveConfig, saveConfig } from './config-store.js';
import { isObject } from './types.js';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Evaluator, ManagerRoute, SessionsFace } from './types.js';

export const API_PREFIX = '/plugins/dsh-decision-layer/api';
const BODY_LIMIT = 32 * 1024;

type CodedError = Error & { code?: string };

const codedError = (message: string, code: string): CodedError => Object.assign(new Error(message), { code });

function respond(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' });
  res.end(JSON.stringify(value));
}

function authorizedBrowser(req: IncomingMessage): boolean {
  const address = req.socket?.remoteAddress;
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address ?? '')) return false;
  const host = req.headers.host;
  if (typeof host !== 'string' || !/^(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(host)) return false;
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  const origin = req.headers.origin;
  if (origin === undefined) return req.method === 'GET';
  // Defensive: anything that is not a single string is rejected, even though
  // Node folds repeated headers into one comma-joined string before we see it.
  if (typeof origin !== 'string') return false;
  try {
    const parsed = new URL(origin);
    return ['http:', 'https:'].includes(parsed.protocol) && parsed.host === host;
  } catch { return false; }
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const contentType = req.headers['content-type'];
  if (typeof contentType !== 'string' || !contentType.startsWith('application/json')) throw new Error('Expected JSON');
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > BODY_LIMIT) throw new Error('Request too large');
    chunks.push(chunk);
  }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!isObject(value)) throw new Error('Expected object');
  return value;
}

export type ManagerRouteDeps = {
  path?: string;
  sessions: SessionsFace;
  backend: { evaluate: Evaluator };
  logStore?: { appendAnnotation: (entry: Record<string, unknown>) => Promise<unknown> };
  analyze?: (id: string) => Promise<unknown>;
  listRows?: (id: string, options: { page: number; pageSize: number; lowOnly?: boolean }) => Promise<unknown>;
  env?: Record<string, string | undefined>;
  bindHost?: string;
};

type MethodHandlers = Record<string, (req: IncomingMessage) => Promise<unknown>>;

export function createManagerRoutes({ path, sessions, backend, logStore, analyze, listRows, env = process.env, bindHost = '127.0.0.1' }: ManagerRouteDeps): ManagerRoute[] {
  const route = (suffix: string, methods: MethodHandlers): ManagerRoute => ({ kind: 'exact', path: `${API_PREFIX}/${suffix}`, handler: async (req, res) => {
    if (bindHost !== '127.0.0.1' || !authorizedBrowser(req)) return respond(res, 403, { ok: false, error: 'Local same-origin browser request required' });
    const method = req.method ?? '';
    // hasOwn keeps inherited Object keys ("toString") from matching; the
    // typeof check narrows the indexed lookup for the stricter compiler.
    if (!Object.hasOwn(methods, method)) return respond(res, 405, { ok: false, error: 'Method not allowed' });
    const handler = methods[method];
    if (typeof handler !== 'function') return respond(res, 405, { ok: false, error: 'Method not allowed' });
    try {
      const value = await handler(req);
      return respond(res, 200, { ok: true, value });
    } catch (error) {
      // A genuine internal fault (log analysis / annotation write) is a 500; a
      // tagged or untagged validation/config error stays a client 400. Neither
      // body carries error internals.
      const coded = error as CodedError;
      if (coded?.code === 'INTERNAL') return respond(res, 500, { ok: false, error: 'Internal error' });
      if (coded?.code === 'BAD_REQUEST') return respond(res, 400, { ok: false, error: coded.message });
      return respond(res, 400, { ok: false, error: 'Invalid request or backend unavailable' });
    }
  } });
  const sessionId = (req: IncomingMessage): string => {
    const id = new URL(req.url ?? '/', 'http://localhost').searchParams.get('sessionId');
    if (!id) throw codedError('sessionId is required', 'BAD_REQUEST');
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
        if (typeof analyze !== 'function') throw codedError('analysis unavailable', 'BAD_REQUEST');
        const id = sessionId(req);
        try { return await analyze(id); }
        catch (error) { if ((error as CodedError)?.code === 'BAD_REQUEST') throw error; throw codedError('analysis failed', 'INTERNAL'); }
      },
    }),
    // One newest-first page of this session's full persisted decision rows, for
    // the analysis tab's paginated log. `lowOnly=1` filters to low self-check
    // scores before paging, so a single low score in a long session is one click
    // away instead of a manual scan. Rows carry the same panel fields as /log,
    // including the gate's already-redacted and length-bounded command/path, so
    // this exposes nothing the recent-rows route does not already.
    route('logrows', {
      GET: async req => {
        if (typeof listRows !== 'function') throw codedError('log rows unavailable', 'BAD_REQUEST');
        const id = sessionId(req);
        const params = new URL(req.url ?? '/', 'http://localhost').searchParams;
        const page = Number.parseInt(params.get('page') ?? '1', 10);
        const pageSize = Number.parseInt(params.get('pageSize') ?? '100', 10);
        const lowOnly = params.get('lowOnly') === '1';
        try { return await listRows(id, { page: Number.isNaN(page) ? 1 : page, pageSize: Number.isNaN(pageSize) ? 100 : pageSize, ...(lowOnly ? { lowOnly } : {}) }); }
        catch (error) { if ((error as CodedError)?.code === 'BAD_REQUEST') throw error; throw codedError('log rows failed', 'INTERNAL'); }
      },
    }),
    // Append one annotation event for a decision. Explicit user intent: validated
    // and written immediately; a write failure surfaces as an error, not silence.
    route('annotate', {
      POST: async req => {
        if (!logStore || typeof logStore.appendAnnotation !== 'function') throw codedError('annotation unavailable', 'BAD_REQUEST');
        const body = await readBody(req);
        const target = typeof body.target === 'string' ? body.target.trim() : '';
        const rating = body.rating;
        const session = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
        if (!target || target.length > 128 || !['good', 'bad', 'unsure'].includes(rating as string) || !session || session.length > 512) {
          throw codedError('Invalid annotation', 'BAD_REQUEST');
        }
        // A validated write that still fails is an internal fault (disk / IO), not
        // bad input: surface it as 500 so the client does not read it as a 400.
        try { await logStore.appendAnnotation({ kind: 'annotation', target, rating, sessionId: session }); }
        catch { throw codedError('annotation write failed', 'INTERNAL'); }
        return { ok: true, target, rating };
      },
    }),
    route('session', {
      GET: async req => { const id = sessionId(req); await sessions.ensureLoaded?.(id); return sessions.snapshot(id); },
      PUT: async req => {
        const body = await readBody(req);
        // The body is untrusted HTTP input; validate before it reaches the
        // session store so a different SessionsFace cannot silently trust it.
        const id = body.sessionId;
        const enabled = body.enabled;
        if (typeof id !== 'string' || typeof enabled !== 'boolean') throw codedError('Invalid session switch', 'BAD_REQUEST');
        await sessions.ensureLoaded?.(id);
        if (typeof sessions.setEnabled !== 'function') throw codedError('session switch unavailable', 'BAD_REQUEST');
        sessions.setEnabled(id, enabled);
        return sessions.snapshot(id);
      },
    }),
  ];
}
