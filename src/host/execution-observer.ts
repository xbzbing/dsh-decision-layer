import { createHash } from 'node:crypto';
import { decisionText } from './decision-context.js';
import { redactCredentials, stripInjected } from './excerpt.js';
import { isObject } from './types.js';

const SHELL = new Set(['bash', 'shell', 'pwsh']);
const WRITES = new Set(['write', 'edit', 'file_write', 'write_file', 'str_replace_editor', 'apply_patch']);
const RECOVERY = new Set(['TOOL_OUTCOME_UNKNOWN', 'TOOL_NOT_STARTED', 'ABORTED_BEFORE_DISPATCH', 'ABORTED']);
const MAX_CALLS = 128;
const MAX_STRATEGIES = 64;
const OPAQUE = /[A-Za-z0-9_+-]{24,}/g;
// A persistent shell always renders an explicit completion marker; a command
// paused for stdin does not. Remember which tool names proved that behavior so
// their markerless pauses are not mistaken for clean exits.
const PERSISTENT_SIGNATURE = /\[Command finished with exit code|\[shell exited|\[Command timed out or OOM|persistent bash shell was reset/i;
const digest = (value: string): string => createHash('sha256').update(value).digest('hex');
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
// Free-text sampling masks opaque blobs first; identifiers (tool names) must
// keep their identity, so they only get injection/credential cleanup.
const bounded = (value: unknown, bytes: number): string => decisionText(typeof value === 'string' ? value.replace(OPAQUE, '[redacted]') : '', bytes);
const label = (value: unknown, bytes: number): string => decisionText(value, bytes);

export type ExecutionEvidence = {
  seq: number;
  step: number;
  tool: string;
  outcome: 'ok' | 'error' | 'unknown';
  command?: string;
  path?: string;
  result?: string;
};
export type ExecutionSnapshot = {
  throughSeq: number;
  step: number;
  evidenceSteps: number;
  evidence: ExecutionEvidence[];
  unresolvedFailures: number;
  artifactGeneration: number;
  verificationGeneration?: number;
  verificationAfterChange: boolean;
  fingerprint: string;
  failureFingerprint: string;
};
type Call = { rawTool: string; tool: string; step: number; command: string; path: string; strategy: string; shell: boolean; backgrounded: boolean; modifies: boolean; verifies: boolean };

// Status markers are appended after the body, each on its own line, so only the
// tail matters. `dsh-tool-bash` omits the marker on a clean exit and `dsh-shell`
// reads the same absence as exit 0; a persistent shell prints an explicit code.
type ShellStatus = { exit?: number; terminated?: boolean; backgrounded?: boolean; explicit?: boolean };
// A marker is a whole line appended after the body. Persistent shells append a
// reset notice after it, and background starts have no marker at all, so scan
// the tail and let the LAST marker line decide instead of anchoring at the end.
const STATUS_LINE = /^\[(?:exit code: -?\d+|Command finished with exit code -?\d+|shell exited(?:: code -?\d+)?|Command timed out or OOM|timed out after [^\]\n]*|stopped: [^\]\n]*|killed by signal: [^\]\n]*|shell killed by signal: [^\]\n]*|sandbox: [^\]\n]*|still running after [^\]\n]*)\]$/i;
function shellStatus(text: string): ShellStatus {
  const lines = text.slice(-4096).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index--) {
    const line = lines[index]!;
    if (!STATUS_LINE.test(line)) continue;
    if (/^\[still running after/i.test(line)) return { backgrounded: true, explicit: true };
    const code = /^\[(?:exit code: (-?\d+)|Command finished with exit code (-?\d+)|shell exited: code (-?\d+))\]$/i.exec(line);
    if (code) return { exit: Number(code[1] ?? code[2] ?? code[3]), explicit: true };
    if (/^\[shell exited\]$/i.test(line)) return { explicit: true };
    return { terminated: true, explicit: true };
  }
  // No marker means the command exited 0; this is the host's own contract.
  return { exit: 0 };
}

function argumentsOf(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    if (value.length > 32 * 1024) return {};
    try { const parsed: unknown = JSON.parse(value); return isObject(parsed) ? parsed : {}; } catch { return {}; }
  }
  return isObject(value) ? value : {};
}

// This is a deliberately small adapter set, not a parser for arbitrary shell or PTC.
function modifies(command: string): boolean {
  return /(?:\b(?:sed|perl)\b[^\n]*\s-[^\s]*i|\b(?:rm|mv|cp|touch|mkdir|tee)\s|\bgit\s+(?:apply|reset|checkout|restore|clean)\b|(?:^|[^>])>{1,2}\s*\S|\bnpm\s+(?:install|uninstall)\b)/i.test(command);
}
function verifies(command: string): boolean {
  // A zero exit from a pipeline/compound command may belong to a different program.
  if (/[\n;|&<>`]|\$\(/.test(command)) return false;
  return /^(?:(?:npm|pnpm|yarn)\s+(?:test\b|(?:run\s+)?(?:check|typecheck|lint|build|test(?::[\w-]+)?)\b)|(?:pytest|vitest|jest)\b|node\s+--test\b|(?:cargo|go)\s+test\b)/i.test(command.trim());
}

/** Pure, bounded per-turn collector. It neither reads history nor invokes host APIs. */
export function createExecutionObserver(turn: number) {
  let throughSeq = -1;
  let latestStep = 0;
  let evidenceSteps = 0;
  let dirtyStep: number | undefined;
  let artifactGeneration = 0;
  let verificationGeneration: number | undefined;
  const calls = new Map<string, Call>();
  const failures = new Map<string, number>();
  const explicitShells = new Set<string>();
  const evidence: ExecutionEvidence[] = [];
  const snapshot = (): ExecutionSnapshot => {
    const selected = evidence.map(item => ({ ...item }));
    const strategies = [...failures].sort(([a], [b]) => a.localeCompare(b));
    return {
      throughSeq, step: latestStep, evidenceSteps, evidence: selected,
      unresolvedFailures: Math.max(0, ...strategies.map(([, count]) => count)),
      artifactGeneration, ...(verificationGeneration === undefined ? {} : { verificationGeneration }),
      verificationAfterChange: verificationGeneration !== undefined && verificationGeneration < artifactGeneration,
      fingerprint: digest(JSON.stringify([selected, artifactGeneration, verificationGeneration, strategies])),
      failureFingerprint: digest(JSON.stringify(strategies)),
    };
  };
  return {
    snapshot,
    observe(event: unknown): ExecutionSnapshot | undefined {
      if (!isObject(event) || !integer(event.seq) || event.seq <= throughSeq || typeof event.type !== 'string' || !isObject(event.data)) return;
      throughSeq = event.seq;
      const data = event.data;
      if (data.turn !== turn || !integer(data.step)) return;
      latestStep = data.step;
      if (event.type === 'tool/call') {
        if (typeof data.callId !== 'string' || !data.callId || data.callId.length > 256 || typeof data.name !== 'string') return;
        const rawTool = data.name.slice(0, 256);
        // The display label keeps injection/credential cleanup but not the opaque
        // mask: tool names are identities, and masking every mcp__* name makes
        // unrelated tools collide. The strategy digest uses raw values for the
        // same reason; it is a hash, never stored or sent.
        const tool = label(rawTool, 96);
        if (!tool) return;
        const args = argumentsOf(data.arguments);
        const shell = SHELL.has(rawTool);
        const commandValue = args.command ?? args.cmd;
        const commandTruncated = shell && typeof commandValue === 'string' && commandValue.length > 32 * 1024;
        const rawCommand = shell && typeof commandValue === 'string' ? commandValue.slice(0, 32 * 1024) : '';
        const backgrounded = shell && args.run_in_background === true;
        const command = bounded(rawCommand, 256);
        const pathValue = args.file_path ?? args.path ?? args.filePath;
        const rawPath = typeof pathValue === 'string' ? pathValue.slice(0, 32 * 1024) : '';
        const path = bounded(rawPath, 160);
        // Do not preserve arbitrary argument objects (notably PTC code/script).
        const strategy = digest(JSON.stringify([rawTool, rawCommand, rawPath]));
        calls.set(data.callId, { rawTool, tool, step: data.step, command, path, strategy, shell, backgrounded,
          modifies: WRITES.has(rawTool) || (shell && (commandTruncated || modifies(rawCommand))),
          verifies: shell && !commandTruncated && verifies(rawCommand) && !modifies(rawCommand) });
        if (calls.size > MAX_CALLS) calls.delete(calls.keys().next().value as string);
        return;
      }
      if (event.type === 'tool/result') {
        if (event.surfaceOp !== undefined && event.surfaceOp !== 'append' && !(isObject(event.surfaceOp) && event.surfaceOp.op === 'append')) return;
        const message = isObject(data.message) ? data.message : undefined;
        if (!message || message.role !== 'tool') return;
        const source = isObject(message.source) ? message.source : undefined;
        if (source && source.kind !== 'tool') return;
        if (source?.callId !== undefined && message.toolCallId !== undefined && source.callId !== message.toolCallId) return;
        const id = typeof message.toolCallId === 'string' ? message.toolCallId : source?.callId;
        const call = typeof id === 'string' ? calls.get(id) : undefined;
        if (!call || call.step !== data.step) return;
        calls.delete(id as string);
        const error = isObject(data.error) ? data.error : undefined;
        const synthetic = typeof error?.code === 'string' && RECOVERY.has(error.code);
        const content = call.shell && Array.isArray(message.content) ? message.content.filter(isObject)
          .filter(block => block.type === 'text' && typeof block.text === 'string')
          .slice(0, 16).map(block => {
            // Mask before sampling: clipping an opaque token first can leave an
            // unrecognizable short prefix/suffix at either sampling boundary.
            const text = redactCredentials(stripInjected((block.text as string).replace(OPAQUE, '[redacted]')));
            return text.length <= 32 * 1024 ? text : `${text.slice(0, 24 * 1024)}\n[output omitted]\n${text.slice(-8 * 1024)}`;
          }).join('\n') : '';
        // A command started in the background has not finished: it can never be
        // a passing verification, even though its result carries no marker.
        const status = call.shell ? (call.backgrounded ? { backgrounded: true } : shellStatus(content)) : undefined;
        if (call.shell && status?.explicit && PERSISTENT_SIGNATURE.test(content)) {
          explicitShells.add(call.rawTool);
          if (explicitShells.size > 16) explicitShells.delete(explicitShells.values().next().value as string);
        }
        const paused = Boolean(call.shell && status && !status.explicit && !call.backgrounded && explicitShells.has(call.rawTool));
        const outcome: ExecutionEvidence['outcome'] = synthetic ? 'unknown'
          : message.isError === true ? 'error'
          : !status ? 'ok'
          : status.backgrounded ? 'unknown'
          : paused ? 'unknown'
          : status.terminated ? 'error'
          : status.exit === undefined ? 'unknown'
          : status.exit === 0 ? 'ok' : 'error';
        if (outcome === 'error') {
          failures.set(call.strategy, Math.min((failures.get(call.strategy) ?? 0) + 1, 1000));
          if (failures.size > MAX_STRATEGIES) failures.delete(failures.keys().next().value as string);
        } else if (outcome === 'ok') failures.delete(call.strategy);
        // Even a failed modifying command may have changed part of an artifact.
        if (call.modifies && !synthetic) artifactGeneration++;
        if (call.verifies && outcome === 'ok' && !paused && status?.exit === 0) verificationGeneration = artifactGeneration;
        const item: ExecutionEvidence = { seq: event.seq, step: data.step, tool: call.tool, outcome };
        if (call.command) item.command = call.command;
        if (call.path) item.path = call.path;
        if (content) item.result = bounded(content, 256);
        evidence.push(item);
        while (evidence.length > 12 || Buffer.byteLength(JSON.stringify(evidence)) > 4096) evidence.shift();
        if (!synthetic) dirtyStep = data.step;
        return;
      }
      if (event.type === 'step/end' && dirtyStep === data.step) {
        evidenceSteps++;
        dirtyStep = undefined;
        // An advertised call without a result cannot be borrowed by a later step.
        calls.clear();
        return snapshot();
      }
      return;
    },
  };
}
