import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createExecutionObserver } from '../lib/host/execution-observer.js';

const event = (seq, type, data, rest = {}) => ({ seq, type, data, ...rest });
const call = (seq, id, name, args = {}, step = 1) => event(seq, 'tool/call', { turn: 1, step, callId: id, name, arguments: JSON.stringify(args) });
const result = (seq, id, text, { error = false, code, step = 1 } = {}) => event(seq, 'tool/result', {
  turn: 1, step, message: { role: 'tool', toolCallId: id, source: { kind: 'tool', callId: id }, isError: error, content: [{ type: 'text', text }] },
  ...(code ? { error: { name: 'Error', code } } : {}),
}, { surfaceOp: { op: 'append' } });
const end = (seq, step = 1) => event(seq, 'step/end', { turn: 1, step });

function execute(observer, seq, id, name, args, text, options = {}) {
  observer.observe(call(seq, id, name, args, options.step));
  observer.observe(result(seq + 1, id, text, options));
  return observer.observe(end(seq + 2, options.step));
}

test('observer joins tool calls and results and folds only steps with new tool evidence', () => {
  const observer = createExecutionObserver(1);
  assert.equal(observer.observe(end(1)), undefined);
  observer.observe(event(2, 'assistant/message', { turn: 1, step: 2, message: { content: [{ type: 'reasoning', text: 'private reasoning' }, { type: 'text', text: 'claimed done' }] } }));
  assert.equal(observer.observe(end(3, 2)), undefined);
  const snapshot = execute(observer, 4, 'a', 'read', { file_path: 'a.ts' }, 'PRIVATE FILE CONTENT', { step: 3 });
  assert.equal(snapshot.evidenceSteps, 1);
  assert.equal(snapshot.evidence.length, 1);
  assert.equal(snapshot.evidence[0].path, 'a.ts');
  assert.equal(snapshot.evidence[0].tool, 'read');
  assert.doesNotMatch(JSON.stringify(snapshot), /PRIVATE|reasoning|claimed done/);
  assert.equal(observer.observe(end(6, 3)), undefined, 'duplicate seq is ignored');
  assert.equal(observer.observe(end(7, 4)), undefined, 'an empty later step is not progress');
});

test('shell nonzero exit is a failure even when the tool itself succeeded; a clean rerun resolves the matching strategy', () => {
  const observer = createExecutionObserver(1);
  let snapshot;
  for (let index = 0; index < 3; index++) snapshot = execute(observer, index * 3 + 1, `f${index}`, 'bash', { command: 'npm test' }, 'failed\n[exit code: 1]', { step: index + 1 });
  assert.equal(snapshot.unresolvedFailures, 3);
  assert.equal(snapshot.evidence.at(-1).outcome, 'error');
  // A clean exit carries no marker: the host appends markers only on failure.
  snapshot = execute(observer, 10, 'success', 'bash', { command: 'npm test' }, 'passed\n', { step: 4 });
  assert.equal(snapshot.evidence.at(-1).outcome, 'ok');
  assert.equal(snapshot.unresolvedFailures, 0);
  assert.equal(snapshot.verificationAfterChange, false);
  assert.equal(snapshot.verificationGeneration, 0);
});

test('a markerless shell result is a clean exit; synthetic recovery errors remain unknown', () => {
  const observer = createExecutionObserver(1);
  const clean = execute(observer, 1, 'a', 'bash', { command: 'npm test' }, 'all tests passed', { step: 1 });
  assert.equal(clean.evidence[0].outcome, 'ok');
  assert.equal(clean.verificationGeneration, 0);
  execute(observer, 4, 'b', 'bash', { command: 'npm test' }, 'Its outcome is unknown', { error: true, code: 'TOOL_OUTCOME_UNKNOWN', step: 2 });
  const recovered = observer.snapshot();
  assert.equal(recovered.evidence.at(-1).outcome, 'unknown');
  assert.equal(recovered.unresolvedFailures, 0);
});

test('timeout, signal and backgrounded shells are never treated as a passing verification', () => {
  const observer = createExecutionObserver(1);
  for (const [id, text, seq] of [
    ['timeout', 'partial\n[timed out after 1000ms]', 1],
    ['signal', 'partial\n[killed by signal: SIGKILL]', 4],
    ['stopped', 'partial\n[stopped: rejected]', 7],
    ['background', 'started\n[still running after 1000ms; moved to background job j1]', 10],
  ]) {
    const snapshot = execute(observer, seq, id, 'bash', { command: 'npm run check' }, text, { step: (seq + 2) / 3 });
    assert.equal(snapshot.verificationGeneration, undefined, id);
    assert.notEqual(snapshot.evidence.at(-1).outcome, 'ok', id);
  }
});

test('a single probe failure does not equal repeated failure; independent successful calls do not clear a failed strategy', () => {
  const observer = createExecutionObserver(1);
  execute(observer, 1, 'failure', 'bash', { command: 'npm test' }, '[exit code: 1]');
  const snapshot = execute(observer, 4, 'read', 'read', { path: 'file' }, 'read successfully', { step: 2 });
  assert.equal(snapshot.unresolvedFailures, 1);
  execute(observer, 7, 'retry', 'bash', { command: 'npm test' }, 'passed', { step: 3 });
  assert.equal(observer.snapshot().unresolvedFailures, 0);
});

test('successful verification belongs to its artifact generation and a later mutation only marks revalidation needed', () => {
  const observer = createExecutionObserver(1);
  execute(observer, 1, 'verify', 'bash', { command: 'npm run check' }, 'checks passed');
  const changed = execute(observer, 4, 'edit', 'edit', { file_path: 'src/a.ts' }, 'patched', { step: 2 });
  assert.equal(changed.verificationAfterChange, true);
  assert.equal(changed.artifactGeneration, 1);
  assert.equal(changed.unresolvedFailures, 0);
  const rechecked = execute(observer, 7, 'verify2', 'bash', { command: 'npm run check' }, 'checks passed', { step: 3 });
  assert.equal(rechecked.verificationAfterChange, false);
  assert.equal(rechecked.verificationGeneration, 1);
});

test('modifying shell commands invalidate verification; reads and failed edits do not fabricate a successful verification', () => {
  const observer = createExecutionObserver(1);
  execute(observer, 1, 'verify', 'shell', { command: 'pytest' }, 'passed');
  const changed = execute(observer, 4, 'change', 'shell', { command: "sed -i 's/old/new/' src/a.ts" }, 'patched', { step: 2 });
  assert.equal(changed.verificationAfterChange, true);
  assert.equal(changed.unresolvedFailures, 0);
});

test('collector excludes network/file bodies, PTC scripts and injected/opaque shell secrets before clipping', () => {
  const observer = createExecutionObserver(1);
  execute(observer, 1, 'net', 'web_fetch', { url: 'https://example.test' }, 'NETWORK BODY');
  execute(observer, 4, 'ptc', 'run_code', { code: 'PTC PRIVATE SCRIPT', script: 'PTC PRIVATE SCRIPT' }, 'PTC OUTPUT', { step: 2 });
  const snapshot = execute(observer, 7, 'shell', 'bash', { command: 'npm test token=abc123', path: '/tmp/token=secret' }, '<openviking-context>PRIVATE MEMORY</openviking-context> abcdefghijklmnopqrstuvwxyz012345 password=hello', { step: 3 });
  const encoded = JSON.stringify(snapshot);
  assert.doesNotMatch(encoded, /NETWORK BODY|PTC PRIVATE|PTC OUTPUT|PRIVATE MEMORY|abcdefghijklmnopqrstuvwxyz|abc123|token=secret|password=hello/);
  assert.match(encoded, /redacted/);
  assert.ok(Buffer.byteLength(encoded) < 8192);
});

test('synthetic recovery-only steps are not counted as fresh execution progress', () => {
  const observer = createExecutionObserver(1);
  const snapshot = execute(observer, 1, 'recovery', 'bash', { command: 'npm test' }, 'unknown', { error: true, code: 'TOOL_NOT_STARTED' });
  assert.equal(snapshot, undefined);
  assert.equal(observer.snapshot().evidenceSteps, 0);
  assert.equal(observer.snapshot().evidence.at(-1).outcome, 'unknown');
});

test('unrelated probing failures do not accumulate into a repeated-strategy anomaly', () => {
  const observer = createExecutionObserver(1);
  let snapshot;
  for (let i = 0; i < 3; i++) snapshot = execute(observer, i * 3 + 1, `probe${i}`, 'bash', { command: `curl https://example.test/${i}` }, '[exit code: 1]', { step: i + 1 });
  assert.equal(snapshot.unresolvedFailures, 1);
});

test('Unicode byte clipping cannot hide compound syntax and fabricate verification', () => {
  const observer = createExecutionObserver(1);
  const snapshot = execute(observer, 1, 'unicode', 'bash', { command: `npm test -- ${'界'.repeat(11000)} || true` }, 'passed');
  assert.equal(snapshot.verificationGeneration, undefined);
});

test('opaque tokens are masked before both shell sampling boundaries', () => {
  const observer = createExecutionObserver(1);
  const token = 'b7Gq2h9Jk4mN6pR8sT0vWxYzAaBbCcDdEeFf';
  const head = `${'A'.repeat(24 * 1024 - 11)}\n${token}\n${'C'.repeat(20 * 1024)}`;
  execute(observer, 1, 'head', 'bash', { command: 'npm test' }, head);
  const tail = `${'A '.repeat(20 * 1024)}\n${token}\n${'C '.repeat(4 * 1024 - 8)}`;
  const snapshot = execute(observer, 4, 'tail', 'bash', { command: 'npm test' }, tail, { step: 2 });
  assert.ok(!JSON.stringify(snapshot).includes(token.slice(0, 10)));
  assert.ok(!JSON.stringify(snapshot).includes(token.slice(-10)));
  assert.equal(snapshot.evidence.at(-1).outcome, 'ok');
});

test('long shell output retains the real trailing exit code and quoted verification words do not create proof', () => {
  const observer = createExecutionObserver(1);
  const failed = execute(observer, 1, 'long', 'bash', { command: 'npm test' }, `header ${'x'.repeat(40_000)}\n[exit code: 1]`);
  assert.equal(failed.evidence.at(-1).outcome, 'error');
  const spoof = execute(observer, 4, 'echo', 'bash', { command: 'echo npm test' }, 'npm test', { step: 2 });
  assert.equal(spoof.verificationGeneration, undefined);
  const pipeline = execute(observer, 7, 'pipeline', 'bash', { command: 'npm test | cat' }, 'passed', { step: 3 });
  assert.equal(pipeline.verificationGeneration, undefined);
});

test('many calls, unmatched results, wrong turns and out-of-order events stay bounded and do not fabricate evidence', () => {
  const observer = createExecutionObserver(1);
  observer.observe(result(1, 'missing', 'unpaired result'));
  observer.observe(event(2, 'tool/call', { turn: 9, step: 1, callId: 'foreign', name: 'bash', arguments: '{"command":"foreign"}' }));
  observer.observe(result(3, 'foreign', 'foreign body'));
  assert.equal(observer.observe(end(4)), undefined);
  for (let i = 0; i < 300; i++) execute(observer, 5 + i * 3, `a${i}`, 'read', { path: '界'.repeat(1000) }, 'body', { step: i + 1 });
  const snapshot = observer.snapshot();
  assert.ok(snapshot.evidence.length <= 12);
  assert.ok(Buffer.byteLength(JSON.stringify(snapshot.evidence)) <= 4096);
  const previous = JSON.stringify(snapshot);
  observer.observe(call(5, 'old', 'bash', { command: 'old' }));
  assert.equal(JSON.stringify(observer.snapshot()), previous);
});

test('long mcp tool names keep their identity and distinct tools stay distinct failure strategies', () => {
  const observer = createExecutionObserver(1);
  const first = execute(observer, 1, 'a', 'mcp__openviking__add_resource', { url: 'x' }, 'boom', { error: true });
  assert.equal(first.evidence[0].tool, 'mcp__openviking__add_resource');
  assert.equal(first.unresolvedFailures, 1);
  const second = execute(observer, 4, 'b', 'mcp__github__create_pull_request', { title: 'x' }, 'boom', { error: true, step: 2 });
  assert.equal(second.unresolvedFailures, 1, 'a different tool is a different strategy');
  const repeated = execute(observer, 7, 'c', 'mcp__openviking__add_resource', { url: 'y' }, 'boom', { error: true, step: 3 });
  assert.equal(repeated.unresolvedFailures, 2, 'the same tool repeats');
});

test('persistent shell markers are understood, including an explicit success', () => {
  const observer = createExecutionObserver(1);
  const ok = execute(observer, 1, 'ok', 'bash', { command: 'npm test' }, 'passed\n[Command finished with exit code 0]');
  assert.equal(ok.evidence[0].outcome, 'ok');
  assert.equal(ok.verificationGeneration, 0);
  const bad = execute(observer, 4, 'bad', 'bash', { command: 'npm test' }, 'failed\n[Command finished with exit code 1]', { step: 2 });
  assert.equal(bad.evidence.at(-1).outcome, 'error');
  const killed = execute(observer, 7, 'killed', 'bash', { command: 'npm test' }, 'partial\n[shell killed by signal: SIGKILL]', { step: 3 });
  assert.equal(killed.evidence.at(-1).outcome, 'error');
});

test('the legacy string surfaceOp append shape is accepted', () => {
  const observer = createExecutionObserver(1);
  observer.observe(call(1, 'a', 'read', { path: 'a' }));
  observer.observe({ seq: 2, type: 'tool/result', surfaceOp: 'append', data: { turn: 1, step: 1,
    message: { role: 'tool', toolCallId: 'a', isError: false, content: [{ type: 'text', text: 'body' }] } } });
  const snapshot = observer.observe(end(3));
  assert.equal(snapshot.evidence.length, 1);
  assert.equal(snapshot.evidence[0].tool, 'read');
});

test('a background start and persistent-shell reset tails never fabricate verification', () => {
  const observer = createExecutionObserver(1);
  // dsh-tool-bash with run_in_background: the result is "started background job j1".
  const started = execute(observer, 1, 'bg', 'bash', { command: 'npm run check', run_in_background: true }, 'started background job j1');
  assert.equal(started.evidence[0].outcome, 'unknown');
  assert.equal(started.verificationGeneration, undefined);
  // dsh-tool-bash-persistent appends a reset notice AFTER the status marker.
  const reset = '\nThe persistent bash shell was reset; the next bash call starts from the workspace with a fresh current directory and environment.';
  const timedOut = execute(observer, 4, 'p-timeout', 'bash', { command: 'npm test' },
    `Your command timed out after 2 seconds or experienced an OOM error. Below is partial output:\npartial\n[Command timed out or OOM]${reset}`, { step: 2 });
  assert.equal(timedOut.evidence.at(-1).outcome, 'error');
  assert.equal(timedOut.verificationGeneration, undefined);
  const exited = execute(observer, 7, 'p-exit', 'bash', { command: 'npm test' },
    `failed\n[shell exited]${reset}`, { step: 3 });
  assert.equal(exited.evidence.at(-1).outcome, 'unknown', 'a shell exit without a code is not a passing command');
  const failed = execute(observer, 10, 'p-fail', 'bash', { command: 'npm test' },
    `failed\n[shell exited: code 1]${reset}`, { step: 4 });
  assert.equal(failed.evidence.at(-1).outcome, 'error');
  const finished = execute(observer, 13, 'p-ok', 'bash', { command: 'npm run check' },
    `all good\n[Command finished with exit code 0]${reset}`, { step: 5 });
  assert.equal(finished.evidence.at(-1).outcome, 'ok');
  assert.equal(finished.verificationGeneration, 0, 'an explicit persistent-shell success marker still counts');
});

test('a persistent-shell pause without a marker is unknown and never re-verifies', () => {
  const observer = createExecutionObserver(1);
  execute(observer, 1, 'a', 'bash', { command: 'npm test' }, 'passed\n[Command finished with exit code 0]');
  const changed = execute(observer, 4, 'b', 'edit', { file_path: 'a.ts' }, 'patched', { step: 2 });
  assert.equal(changed.verificationAfterChange, true);
  // stdin_read pauses return partial output with no status line at all.
  const paused = execute(observer, 7, 'c', 'bash', { command: 'npm run check' }, 'waiting for input...', { step: 3 });
  assert.equal(paused.evidence.at(-1).outcome, 'unknown');
  assert.equal(paused.verificationAfterChange, true, 'a paused command is not a passing verification');
  const rechecked = execute(observer, 10, 'd', 'bash', { command: 'npm run check' }, 'ok\n[Command finished with exit code 0]', { step: 4 });
  assert.equal(rechecked.verificationAfterChange, false);
});
