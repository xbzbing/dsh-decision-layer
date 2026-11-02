/**
 * The one bounded, redacted "what was this turn about" excerpt every decision
 * row may carry into the local decision log.
 *
 * It is a human-review hint, never a dump of structured state: injected host
 * context (memory blocks, system reminders) is stripped first, then common
 * credential forms are masked, and only then is the text collapsed and cut.
 * The same rules must hold for every decision point — the panel and the JSONL
 * sink store what this returns, so a weaker copy elsewhere would leak.
 *
 * Masking deliberately errs toward over-redaction: a false positive only costs
 * the reader some context, while a miss writes a secret to disk for 30 days.
 * The rules cover labeled key/value pairs (`password`, `token`, Chinese
 * 密码/令牌 …), HTTP credential headers, URL userinfo, CLI flags, copula forms
 * (`token is …`), and well-known token shapes that appear without any label.
 */

const MAX_INPUT = 8 * 1024;
export const TASK_EXCERPT_LIMIT = 512;

// Keys whose value is a single token. Case-insensitive; `api[ _-]*key` also
// covers `apikey` / `api-key` / `api_key` / `apiKey`.
const TOKEN_KEYS = String.raw`token|api[ _-]*key`;
// Keys whose value may contain spaces (a passphrase), so the rest of the clause
// is masked rather than one word.
const PHRASE_KEYS = String.raw`password|passw(?:or)?d|passphrase|secret[ _-]?key|access[ _-]?key|private[ _-]?key|secret`;
// Chinese users usually write these with a full-width colon and no space. Kept
// separate from the ASCII keys because `\b` does not match around CJK text.
const CN_KEYS = String.raw`密码|口令|密码短语|密钥|令牌|凭证|私钥`;
const COMBINED_KEYS = String.raw`${PHRASE_KEYS}|${TOKEN_KEYS}`;
const SEPARATOR = String.raw`[:=：＝]`;
// One value: quoted (JSON / shell) or an unquoted run that stops at a clause
// separator; `}` and `]` are not separators so JSON-ish input keeps its shape.
const VALUE = String.raw`(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;}，；、]+)`;
// A passphrase value: everything up to the end of the clause, so
// `password: correct horse battery staple` does not leave the tail behind.
const CLAUSE = String.raw`(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\r\n,;，；、]*)`;
const COPULA = String.raw`is|are|was|were|是|为`;
// A value after a copula is masked only when it looks like a credential (a
// digit or a long token). That keeps ordinary prose ("the password is not
// set") readable while still hiding "token is abc123".
const VALUE_LIKE = String.raw`(?=\S*(?:\d|[A-Za-z0-9_-]{12,}))`;

// Values that identify themselves, so they can be masked without a label.
// Group 1 keeps the recognizable prefix so a reader can tell what was removed.
const TOKEN_SHAPES: readonly [RegExp, string][] = [
  [/\b(sk|pk|rk)-[A-Za-z0-9_-]{8,}/gi, '$1-[redacted]'],
  [/\b(gh[pousr]_)[A-Za-z0-9]{20,}/g, '$1[redacted]'],
  [/\b(xox[baprs]-)[A-Za-z0-9-]{10,}/g, '$1[redacted]'],
  [/\b(AKIA)[0-9A-Z]{16}\b/g, '$1[redacted]'],
  [/\b(glpat-)[A-Za-z0-9_-]{10,}/g, '$1[redacted]'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*/g, '[redacted]'],
];

const RULE = {
  // Template placeholders (`{{SECRET_...}}`) hide a value inside braces the
  // value rules deliberately do not consume, so mask the whole placeholder.
  template: /\{\{[^{}\r\n]*\}\}/g,
  bearer: /\bBearer\s+[^\s,;]+/gi,
  urlUserinfo: /([a-z][a-z0-9+.-]*:\/\/)[^\s/]*@/gi,
  header: new RegExp(String.raw`(\b(?:authorization|cookie|set-cookie)\b["']?\s*${SEPARATOR}\s*)[^\r\n]*`, 'gi'),
  phrase: new RegExp(String.raw`(\b(?:${PHRASE_KEYS})\b["']?\s*${SEPARATOR}\s*)${CLAUSE}`, 'gi'),
  cnKey: new RegExp(String.raw`((?:${CN_KEYS})\s*[:：＝]\s*)${VALUE}`, 'g'),
  token: new RegExp(String.raw`(\b(?:${TOKEN_KEYS})\b["']?\s*${SEPARATOR}\s*)${VALUE}`, 'gi'),
  asciiCopula: new RegExp(String.raw`(\b(?:${COMBINED_KEYS})\b\s*(?:${COPULA})\s*)${VALUE_LIKE}${VALUE}`, 'gi'),
  cnCopula: new RegExp(String.raw`((?:${CN_KEYS})\s*(?:是|为)\s*)${VALUE_LIKE}${VALUE}`, 'g'),
  flag: new RegExp(String.raw`(^|\s)(--(?:${COMBINED_KEYS})(?:\s+|=))${VALUE}`, 'gi'),
  // Env-style keys are often a suffix of a longer identifier (`DB_PASSWORD`,
  // `AWS_SECRET_ACCESS_KEY`), where `\b` cannot match across `_`.
  // The value stops at a clause separator: `\S+` would swallow the rest of a
  // Chinese sentence after a masked token.
  envKey: /([A-Za-z0-9_]*(?:PASSW(?:OR)?D|SECRET|TOKEN|API[_-]?KEY|ACCESS[_-]?KEY|PRIVATE[_-]?KEY)[A-Za-z0-9_]*\s*[:=：＝]\s*)[^\s,;}，；、]+/gi,
  // Legacy space form (`token abc`), but never swallow a copula: the rule above
  // masks the value that follows it.
  loose: new RegExp(String.raw`(\b(?:${COMBINED_KEYS})\b\s+)(?!(?:${COPULA})(?:\s|$)|${SEPARATOR})${VALUE}`, 'gi'),
};

/**
 * Mask the credential forms that show up in a task excerpt. Exported so the
 * storage layer can apply the same rules as a second boundary (it is cheap and
 * idempotent), keeping a future caller that forgets `taskExcerpt` from writing
 * a secret to the log.
 */
export function redactCredentials(input: string): string {
  let text = input.replace(RULE.template, '[redacted]');
  // `Bearer` first: `\s+` spans the line break of a wrapped header, so a token
  // on the next line is masked before the Authorization rule consumes the line.
  text = text.replace(RULE.bearer, 'Bearer [redacted]');
  // URL userinfo (`postgres://user:pass@host`), greedily through the last `@`
  // before a slash so a password containing `@` is covered too.
  text = text.replace(RULE.urlUserinfo, '$1[redacted]@');
  // Credential headers own the rest of their line.
  text = text.replace(RULE.header, '$1[redacted]');
  // Passphrase-like keys own the rest of their clause, spaces included.
  text = text.replace(RULE.phrase, '$1[redacted]');
  text = text.replace(RULE.cnKey, '$1[redacted]');
  // Single-token keys.
  text = text.replace(RULE.token, '$1[redacted]');
  // Copula forms (`token is abc123`, `token 是 sk-…`), only for value-like tails.
  text = text.replace(RULE.asciiCopula, '$1[redacted]');
  text = text.replace(RULE.cnCopula, '$1[redacted]');
  // CLI flags (`--token abc`, `--api-key=abc`).
  text = text.replace(RULE.flag, '$1$2[redacted]');
  // Environment-style keys (`DB_PASSWORD=...`, `AWS_SECRET_ACCESS_KEY=...`).
  text = text.replace(RULE.envKey, '$1[redacted]');
  // Space-separated key/value (`token abc`).
  text = text.replace(RULE.loose, '$1[redacted]');
  // Unlabeled, self-identifying token shapes.
  for (const [pattern, replacement] of TOKEN_SHAPES) text = text.replace(pattern, replacement);
  return text;
}

// The injected host blocks that never belong to a user's task. Exported so the
// outbound context builder strips exactly what the local excerpt strips.
export function stripInjected(input: string): string {
  return input
    .replace(/<(openviking-context|system-reminder)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(openviking-context|system-reminder)\b[\s\S]*$/i, ' ');
}

export function taskExcerpt(state: unknown, limit = TASK_EXCERPT_LIMIT): string | undefined {
  if (typeof state !== 'string') return undefined;
  const text = redactCredentials(stripInjected(state.slice(0, MAX_INPUT))).replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, limit) : undefined;
}
