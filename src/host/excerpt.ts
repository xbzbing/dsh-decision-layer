/**
 * The one bounded, redacted "what was this turn about" excerpt every decision
 * row may carry into the local decision log.
 *
 * It is a human-review hint, never a dump of structured state: injected host
 * context (memory blocks, system reminders) is stripped first, then common
 * credential forms are masked, and only then is the text collapsed and cut.
 * The same rules must hold for every decision point — the panel and the JSONL
 * sink store what this returns, so a weaker copy elsewhere would leak.
 */

const MAX_INPUT = 8 * 1024;
export const TASK_EXCERPT_LIMIT = 512;

export function taskExcerpt(state: unknown, limit = TASK_EXCERPT_LIMIT): string | undefined {
  if (typeof state !== 'string') return undefined;
  const text = state.slice(0, MAX_INPUT)
    .replace(/<(openviking-context|system-reminder)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(openviking-context|system-reminder)\b[\s\S]*$/i, ' ')
    .replace(/(\b(?:authorization|cookie|set-cookie)\s*:\s*)[^\r\n]*/gi, '$1[redacted]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/((?:password|passwd|secret|token|api[ _-]*key|authorization|cookie)["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;}]+)/gi, '$1[redacted]')
    .replace(/\b(password|passwd|secret|token|api[ _-]*key)\s+\S+/gi, '$1 [redacted]')
    .replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, limit) : undefined;
}
