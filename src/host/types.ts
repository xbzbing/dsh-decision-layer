/**
 * Shared types and guards for the host half.
 *
 * Three kinds of shape appear here, and they are deliberately kept apart:
 *  - wire contracts (EvaluateInput / EvaluateResult) — the one protocol with the
 *    adjudication backend, validated in backend.ts;
 *  - configuration (ResolvedConfig / *Settings) — validated in config-store.ts;
 *  - host runtime surfaces (HostContext, ToolExec, AgentLike) — our own
 *    structural view of what the Cordis host hands us. They are declared here
 *    instead of imported from @deepseek-ai/* so a host minor upgrade cannot
 *    break compilation: every field is optional and every boundary re-validates.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

export type JsonObject = Record<string, unknown>;

export const isObject = (value: unknown): value is JsonObject =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export const isProbability = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

/** The stable reason code a backend failure carries, or a generic fallback. */
export const errorReason = (error: unknown, fallback = 'unreachable'): string => {
  const reason = (error as { reason?: unknown } | undefined)?.reason;
  return typeof reason === 'string' ? reason : fallback;
};

// ── Adjudication wire contract ──────────────────────────────────────────────
// questions and answers are keyed by caller-chosen ids; the backend validates
// both directions (backend.ts), so the question payload stays loosely typed.

export type ChoiceQuestion = { type: 'choice'; instructions: unknown; criteria: Record<string, unknown> };
export type ScoreQuestion = { type: 'score'; instructions: unknown; criteria: readonly unknown[] };
export type NoulQuestion = { type: 'noul'; instructions: unknown; criteria?: unknown };
export type Question = ChoiceQuestion | ScoreQuestion | NoulQuestion;
export type QuestionMap = Record<string, Question>;
export type EvaluateInput = { state: unknown; questions: QuestionMap };

export type NoulAnswer = { type: 'noul'; noul: number };
export type ScoredAnswer = { confidence: number; probabilities: Record<string, number> };
export type ScoreAnswer = ScoredAnswer & { type: 'score'; score: number };
export type ChoiceAnswer = ScoredAnswer & { type: 'choice'; choice: string };
export type Answer = NoulAnswer | ScoreAnswer | ChoiceAnswer;
export type AnswerMap = Record<string, Answer>;
export type EvaluateResult = {
  model: string;
  answers: AnswerMap;
  usage?: { input_tokens: number; output_tokens: number };
};
export type Evaluator = (input: EvaluateInput, options?: { signal?: AbortSignal }) => Promise<EvaluateResult>;

// ── Configuration ───────────────────────────────────────────────────────────

export type CheckMode = 'observe' | 'steer';
export type NarrowMode = 'observe' | 'enforce';
export type BatchMode = 'auto' | 'single' | 'split';
export type FeatureKey = 'gate' | 'check' | 'narrow' | 'complete';
export type Severity = 'normal' | 'warn' | 'severe';

export type DangerRuleAdditions = {
  addToolNames?: string[];
  removeToolNames?: string[];
  addCommandPatterns?: string[];
  addPathPatterns?: string[];
};
/** Compiled rules: the built-in patterns plus the configured additions. */
export type DangerRuleSet = {
  toolNames: readonly string[];
  commandPatterns: readonly RegExp[];
  pathPatterns: readonly RegExp[];
};

export type GateSettings = { minConfidence?: number };
export type CheckSettings = {
  mode?: CheckMode;
  rubric?: string[];
  lowScoreThreshold?: number;
  minConfidence?: number;
  trendMinConfidence?: number;
  trendRun?: number;
  trendSevereRun?: number;
};
export type NarrowSettings = {
  mode?: NarrowMode;
  threshold?: number;
  keepPrefixes?: string[];
  maxCandidates?: number;
  batchMode?: BatchMode;
};
export type CompleteSettings = { mode?: CheckMode; minConditions?: number; minConfidence?: number };
export type Features = Partial<Record<FeatureKey, boolean>>;

/** What the backend needs from the config to make one request. */
export type BackendConfig = { url: string; apiKey: string; model: string; httpApprovedUrl: string };

/** Fully resolved configuration; every field the decision points read. */
export type ResolvedConfig = {
  url: string;
  apiKey: string;
  model: string;
  httpApprovedUrl: string;
  dangerRules?: DangerRuleAdditions;
  gateSettings?: GateSettings;
  checkSettings?: CheckSettings;
  narrowSettings?: NarrowSettings;
  completeSettings?: CompleteSettings;
  features?: Features;
};

/** What the config page may read back: the API key is reduced to a flag. */
export type ConfigView = {
  url: string;
  model: string;
  apiKeySet: boolean;
  httpApprovedUrl: string;
  dangerRules?: DangerRuleAdditions;
  gateSettings?: GateSettings;
  checkSettings?: CheckSettings;
  narrowSettings?: NarrowSettings;
  completeSettings?: CompleteSettings;
  features?: Features;
};

/** The quality-trend knobs, shared by the live path and the log backtest. */
export type TrendConfig = {
  trendMinConfidence?: number;
  trendRun?: number;
  trendSevereRun?: number;
  lowScoreThreshold?: number;
};

// ── Session metrics and log rows ────────────────────────────────────────────

export type LogKind = 'gate' | 'check' | 'narrow' | 'complete';

/**
 * One decision-log row. Fields are optional because rows are also read back
 * from disk: persisted snapshots are untrusted input, and only `kind` is
 * enforced before a row is accepted.
 */
export type LogRow = {
  id?: string;
  at?: number;
  kind: LogKind;
  outcome?: string;
  tool?: string;
  suggestion?: string;
  action?: string;
  reason?: string;
  subject?: string;
  task?: string;
  turn?: number;
  command?: string;
  path?: string;
  mode?: string;
  score?: number;
  confidence?: number;
  dropped?: number;
  kept?: number;
  applied?: boolean;
  candidates?: number;
  conditions?: number;
  satisfied?: number;
  unsatisfied?: number;
  insufficient?: number;
  steered?: boolean;
  lowConfidence?: boolean;
  tools?: string[];
};

/** The research-log sink record: the panel row plus its session tag. */
export type SessionSinkRow = LogRow & { sessionId: string };

export type SessionCounters = { attempts: number; failures: number };
export type GateCounters = SessionCounters & {
  ask: number;
  deny: number;
  allow: number;
  actual: { allow: number; deny: number; error: number };
};
export type CheckCounters = SessionCounters & { low: number; run: number; severity: Severity };
export type NarrowCounters = SessionCounters & { applied: number; dropped: number };
export type CompleteCounters = SessionCounters & {
  unsatisfied: number;
  satisfied: number;
  insufficient: number;
  steered: number;
};

/** Live per-session state (the durable snapshot's payload). */
export type SessionState = {
  enabled: boolean;
  attempts: number;
  failures: number;
  gate: GateCounters;
  check: CheckCounters;
  narrow: NarrowCounters;
  complete: CompleteCounters;
  log: LogRow[];
};

/** The panel-facing projection; sections without attempts are omitted. */
export type SessionSnapshot = {
  enabled: boolean;
  hasAutomaticDecisions: boolean;
  attempts: number;
  failures: number;
  gate?: GateCounters;
  check?: { attempts: number; failures: number; low: number; trend: { run: number; severity: Severity } };
  narrow?: NarrowCounters;
  complete?: CompleteCounters;
  log?: LogRow[];
};

/** The counter shape rebuilt from persisted JSONL, without the master switch. */
export type SessionSeed = Omit<SessionState, 'enabled'>;

/**
 * The slice of the session store the decision points use. Every method is
 * optional: a test or an older host may inject only the parts it cares about.
 */
export type SessionsFace = {
  snapshot: (id: string) => SessionSnapshot;
  log?: (id: string, entry: Record<string, unknown>) => void;
  record?: (id: string, kind: 'gate', outcome: string) => void;
  recordActual?: (id: string, outcome: 'allow' | 'deny' | 'error') => void;
  recordCheck?: (id: string, outcome: string, trend?: Record<string, unknown>) => void;
  recordNarrow?: (id: string, outcome: string, dropped: number, applied: boolean) => void;
  recordComplete?: (id: string, outcome: string, detail?: Record<string, unknown>) => void;
  ensureLoaded?: (id: string) => Promise<unknown>;
  setEnabled?: (id: string, enabled: boolean) => void;
};

// ── Host runtime surfaces ───────────────────────────────────────────────────

export type ToolCandidate = { name: string; description?: string };

export type AgentLike = {
  session?: { id?: string; deriveMessages?: () => unknown };
  steer?: (message: unknown) => unknown;
  ctx?: { tools?: { restrict?: (options: { allow: string[] }) => (() => void) | undefined } };
};

export type ToolExec = {
  name?: string;
  arguments?: unknown;
  agent?: AgentLike;
  signal?: AbortSignal;
  [key: string]: unknown;
};

export type NextStep = () => unknown;

export type ToolSchema = { name: string; description?: string };

export type ToolRegistration = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  output: Record<string, unknown>;
  timeoutMs?: number;
  execute: (args: unknown, exec: ToolExec) => unknown;
};

export type SkillRegistration = {
  name: string;
  description: string;
  content: string;
  source: string;
};

export type ManagerRoute = {
  kind: 'exact';
  path: string;
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
};

export type WebServerFace = {
  port: number;
  host?: string;
  // Registering returns the disposer that removes the route again.
  register: (route: ManagerRoute) => () => void;
};

export type WebFace = { webServer: WebServerFace };

export type ToolsFace = {
  guard?: (guard: (exec: ToolExec) => string | undefined) => unknown;
  register: (tool: ToolRegistration) => unknown;
  schemas?: (agent?: AgentLike) => unknown;
};

export type SkillsFace = { register: (skill: SkillRegistration) => unknown };

/**
 * The Cordis context our apply() needs. Handlers are typed per call site
 * because each event carries a different payload; `never[]` here keeps them
 * assignable without leaking `any` into the implementation.
 */
export type HostContext = {
  on: (event: string, handler: (...args: never[]) => unknown) => (() => void) | undefined;
  effect?: (install: () => (() => void) | void) => unknown;
  tools: ToolsFace;
  skills: SkillsFace;
  inject: (keys: string[], install: (web: WebFace) => (() => void) | void) => unknown;
};
