import { redactCredentials, stripInjected } from './excerpt.js';
import { summarizeExecution } from './danger-gate.js';
import { isObject } from './types.js';
import type { AgentLike, DecisionContext, DecisionSnapshot, ToolEvidence } from './types.js';

type Message = Record<string, unknown>;
type Position = { turn?: number; messages?: unknown };
type Boundary = {
  turn?: number;
  start: number;
  anchor?: unknown;
  anchorId?: string;
  /** The history was unreadable when this turn started; evidence stays empty. */
  broken: boolean;
  requests: string[];
  background: DecisionContext['background'];
};

// UTF-8 budgets, not token estimates. No field can consume another's budget.
function clip(text: string, maxBytes: number): string {
  // Round-trip a byte prefix without emitting a partial Unicode code point.
  let size = 0;
  let result = '';
  for (const char of text) {
    size += Buffer.byteLength(char);
    if (size > maxBytes) break;
    result += char;
  }
  return result;
}

export function decisionText(value: unknown, maxBytes = 1536): string {
  if (typeof value !== 'string' || maxBytes <= 0) return '';
  const clean = redactCredentials(stripInjected(value.slice(0, 32 * 1024))).trim();
  return clip(clean, maxBytes);
}

// Shell output is free-form, so a labeled-credential rule alone is not enough:
// an opaque blob (a token echoed by a script, a hash, a session id) has no label.
// Mask long unbroken alphanumerics while leaving paths and short words readable.
const OPAQUE = /[A-Za-z0-9_+-]{24,}/g;
// Mask first, clip second: a blob cut by the byte limit would otherwise keep a
// readable prefix shorter than the 24-char threshold.
const resultExcerpt = (value: string, maxBytes: number): string => clip(decisionText(value, 32 * 1024).replace(OPAQUE, '[redacted]'), maxBytes);

const messagesOf = (value: unknown): Message[] => Array.isArray(value) ? value.filter(isObject) : [];
const textOf = (message: Message): string => Array.isArray(message.content)
  ? message.content.filter(isObject).filter(block => block.type === 'text' && typeof block.text === 'string').map(block => block.text).join('\n') : '';
const human = (message: Message): boolean => message.role === 'user'
  && (!message.source || (isObject(message.source) && message.source.kind === 'user'));

// `undefined` means the history is unavailable (a throwing or non-array
// deriveMessages), which is NOT the same as an empty history: an unavailable
// start must never be re-read later as "this turn began at index 0".
function historyOf(agent: AgentLike | undefined): Message[] | undefined {
  try {
    const derived = agent?.session?.deriveMessages?.();
    return Array.isArray(derived) ? messagesOf(derived) : undefined;
  } catch { return undefined; }
}

// Take the most recent real user message and the most recent assistant reply,
// not the last two messages of either role: two consecutive assistant updates
// must not push the user's task out of the window.
function backgroundOf(messages: Message[], isHuman: (message: Message) => boolean): DecisionContext['background'] {
  const lastUser = messages.findLastIndex(isHuman);
  const lastAssistant = messages.findLastIndex(message => message.role === 'assistant');
  return [lastUser, lastAssistant].filter(index => index >= 0).sort((a, b) => a - b)
    .map(index => {
      const message = messages[index];
      if (!message) return undefined;
      const role = isHuman(message) ? 'user' as const : 'assistant' as const;
      return { role, text: decisionText(textOf(message), 512) };
    })
    .filter((item): item is { role: 'user' | 'assistant'; text: string } => Boolean(item?.text));
}

function evidenceOf(messages: Message[]): ToolEvidence[] {
  const calls = new Map<string, { name: string; arguments: unknown }>();
  const evidence: ToolEvidence[] = [];
  for (const message of messages) {
    if (message.role === 'assistant' && Array.isArray(message.content)) {
      for (const block of message.content.filter(isObject)) {
        if (block.type !== 'tool-call' || typeof block.id !== 'string' || typeof block.name !== 'string') continue;
        let args = block.arguments;
        if (typeof args === 'string') { try { args = JSON.parse(args); } catch { args = undefined; } }
        calls.set(block.id, { name: block.name, arguments: args });
      }
    }
    if (message.role !== 'tool') continue;
    const source = isObject(message.source) ? message.source : {};
    const id = typeof message.toolCallId === 'string' ? message.toolCallId : source.callId;
    const call = typeof id === 'string' ? calls.get(id) : undefined;
    const name = call?.name ?? (typeof message.name === 'string' ? message.name : typeof message.toolName === 'string' ? message.toolName : '');
    if (!name) continue;
    const item: ToolEvidence = { tool: decisionText(name, 96), outcome: message.isError === true ? 'error' : 'ok' };
    if (call) {
      const summary = summarizeExecution(call);
      if (summary.command) item.command = decisionText(summary.command, 160);
      if (summary.path) item.path = decisionText(summary.path, 160);
    }
    // A read/search/web response can contain whole private files or fetched pages.
    // Shell results alone get a tiny excerpt; all result text remains untrusted data.
    if (['bash', 'pwsh', 'shell', 'exec', 'terminal', 'run_command'].includes(name)) {
      const result = resultExcerpt(textOf(message), 256);
      if (result) item.result = result;
    }
    evidence.push(item);
  }
  // A long turn can produce far more calls than fit. Keep the oldest few as well
  // as the newest few: an early edit may be the only proof of an early condition.
  const bounded = evidence.length > 12 ? [...evidence.slice(0, 4), ...evidence.slice(-8)] : [...evidence];
  while (Buffer.byteLength(JSON.stringify(bounded)) > 4096) bounded.shift();
  return bounded;
}

// Compaction and rewind replace the surface: everything before the marker came
// from another window. Evidence must never cross one, even when the boundary
// itself cannot be re-verified (e.g. it started at an empty history).
const REPLACEMENTS: ReadonlySet<string> = new Set(['compact-checkpoint', 'dsh-rewind']);
function afterLastReplacement(messages: Message[]): Message[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message) continue;
    const source = isObject(message.source) ? message.source : undefined;
    if (source && typeof source.kind === 'string' && REPLACEMENTS.has(source.kind)) return messages.slice(i + 1);
  }
  return messages;
}

function boundaryHolds(history: Message[], boundary: Boundary): boolean {
  if (boundary.start <= 0) return true;
  const previous = history[boundary.start - 1];
  if (!previous) return false;
  return previous === boundary.anchor || (boundary.anchorId !== undefined && previous.id === boundary.anchorId);
}

function snapshotOf(history: Message[] | undefined, boundary: Boundary | undefined, isHuman: (message: Message) => boolean): DecisionSnapshot {
  const messages = history ?? [];
  const lastHuman = messages.findLastIndex(isHuman);
  // If the history was replaced/compacted, an index alone cannot establish scope:
  // drop the current-turn window rather than borrow another task's evidence.
  const window = boundary === undefined
    ? messages.slice(lastHuman >= 0 ? lastHuman : messages.length)
    : boundary.broken ? []
    : boundaryHolds(messages, boundary) ? messages.slice(boundary.start) : [];
  const current = afterLastReplacement(window);
  const requests = boundary?.requests ?? current.filter(isHuman).map(message => decisionText(textOf(message), 8192));
  // No fallback to an earlier turn: a turn opened by a schedule/background notice
  // has no request, and borrowing the previous task would narrow tools and score
  // output against work this turn did not do.
  const request = decisionText(requests.at(-1) ?? '', 1536);
  const evidence = evidenceOf(current);
  const context: DecisionContext = {
    request,
    // Earlier real requests in this turn stay visible as background: with only the
    // last one, a short follow-up ("继续") would hide the main task. Pre-turn
    // context is kept too, but the size cap below drops it first.
    background: [...(boundary?.background ?? backgroundOf(messages.slice(0, Math.max(lastHuman, 0)), isHuman)),
      ...requests.slice(0, -1).slice(-2).map(text => ({ role: 'user' as const, text: decisionText(text, 1024) }))].slice(-4),
    progress: evidence.slice(-3),
  };
  // Give progress its own ceiling first so it cannot squeeze the background out
  // of the shared cap; only then trim the rest, oldest first.
  while (Buffer.byteLength(JSON.stringify(context.progress)) > 1024 && context.progress.length > 1) context.progress.shift();
  while (Buffer.byteLength(JSON.stringify(context)) > 4096 && (context.background.length || context.progress.length > 1)) {
    if (context.background.length) context.background.shift(); else context.progress.shift();
  }
  return {
    context, evidence,
    // Completion conditions come from the latest real request only. Joining a
    // turn's requests would resurrect work the user just cancelled ("drop the
    // earlier list, only review"); when the latest request has no explicit
    // conditions the check skips rather than infer from an older revision.
    conditionsText: requests.at(-1) ?? '',
  };
}

/**
 * One agent's turn boundary, captured before inbox messages enter derived history.
 * `ignored` drops messages the plugin produced itself (a steer carries `kind:user`
 * for host compatibility but is our prompt, not the user's request).
 */
export function createDecisionContext({ ignored }: { ignored?: (id: string) => boolean } = {}) {
  const boundaries = new WeakMap<AgentLike, Boundary>();
  const isHuman = (message: Message): boolean => human(message)
    && !(typeof message.id === 'string' && ignored?.(message.id) === true);
  const enter = (agent: AgentLike | undefined, position: Position): { changed: boolean; snapshot?: DecisionSnapshot } => {
    const known = agent ? boundaries.get(agent) : undefined;
    const first = !known || known.turn !== position.turn;
    const inputs = messagesOf(position.messages).filter(isHuman)
      .map(message => decisionText(textOf(message), 8192)).filter(Boolean);
    // Auto-steer and notices contribute nothing: never derive the history for them.
    if (!first && inputs.length === 0) return { changed: false };
    const history = historyOf(agent);
    let boundary = known;
    const anchor = history?.at(-1);
    if (first) {
      boundary = { turn: position.turn, start: history?.length ?? 0, anchor, broken: history === undefined,
        ...(isObject(anchor) && typeof anchor.id === 'string' ? { anchorId: anchor.id } : {}),
        requests: [], background: history ? backgroundOf(history, isHuman) : [] };
      if (agent) boundaries.set(agent, boundary);
    } else if (boundary?.broken) {
      // The history was unreadable when this turn began. Re-anchor at what is
      // visible now instead of accepting everything that appeared since.
      boundary.broken = history === undefined;
      boundary.start = history?.length ?? 0;
      boundary.anchor = anchor;
      if (isObject(anchor) && typeof anchor.id === 'string') boundary.anchorId = anchor.id;
      else delete boundary.anchorId;
      boundary.background = history ? backgroundOf(history, isHuman) : [];
    }
    const active = boundary!;
    active.requests.push(...inputs);
    // Bound long-running turns with many user interruptions as well as each field.
    active.requests = active.requests.slice(-8);
    return { changed: true, snapshot: snapshotOf(history, active, isHuman) };
  };
  return {
    enter(agent: AgentLike | undefined, position: Position): { changed: boolean; snapshot?: DecisionSnapshot } {
      try {
        return enter(agent, position);
      } catch {
        // This runs on the pre-step hot path: a failure must skip narrowing, never
        // turn the step into an error.
        return { changed: false };
      }
    },
    snapshot(agent: AgentLike | undefined): DecisionSnapshot {
      try {
        return snapshotOf(historyOf(agent), agent ? boundaries.get(agent) : undefined, isHuman);
      } catch {
        // Called from turn-stopping, which the host runs serially: a throw would be
        // recorded as a turn error. An empty context makes every check skip.
        return { context: { request: '', background: [], progress: [] }, conditionsText: '', evidence: [] };
      }
    },
  };
}
