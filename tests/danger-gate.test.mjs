import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyDangerous, createDangerGate, DEFAULT_DANGEROUS_RULES } from '../service/danger-gate.mjs';

const exec = (name, args) => ({ name, arguments: args, signal: AbortSignal.timeout(1000), agent: { session: { id: 's1' } }, callId: 'call-1' });

test('matches dangerous commands by tool, command and target', () => {
  assert.equal(classifyDangerous(exec('shell', { command: 'rm -rf /tmp/build' }), DEFAULT_DANGEROUS_RULES).dangerous, true);
  assert.equal(classifyDangerous(exec('shell', { command: 'git push --force origin main' }), DEFAULT_DANGEROUS_RULES).dangerous, true);
  assert.equal(classifyDangerous(exec('shell', { command: 'echo safe' }), DEFAULT_DANGEROUS_RULES).dangerous, false);
  assert.equal(classifyDangerous(exec('file_write', { path: '/etc/production.conf', content: 'x' }), DEFAULT_DANGEROUS_RULES).dangerous, true);
});

test('gate evaluator receives only bounded command/path metadata, never file content', async () => {
  let request;
  const gate = createDangerGate({ evaluate: async input => { request = input; return { answers: { verdict: { type: 'choice', choice: 'deny', confidence: 1, probabilities: { allow: 0, ask: 0, deny: 1 } } } }; } });
  await gate.evaluate(exec('file_write', { path: '/tmp/config', content: 'password=secret-token', metadata: { token: 'secret-token' } }));
  const serialized = JSON.stringify(request);
  assert.match(serialized, /file_write/);
  assert.match(serialized, /tmp\/config/);
  assert.doesNotMatch(serialized, /secret-token|password/);
});

// Two-tier model: only a high-confidence deny intervenes. Everything else
// (allow, ask, low-confidence, invalid, backend failure) does NOT intervene —
// the call proceeds on its original path, so evaluate() returns undefined.

test('high-confidence allow does not intervene (passes through)', async () => {
  const gate = createDangerGate({ evaluate: async () => ({ answers: { verdict: { type: 'choice', choice: 'allow', confidence: 1, probabilities: { allow: 1, ask: 0, deny: 0 } } } }) });
  assert.equal(await gate.evaluate(exec('shell', { command: 'rm -rf /tmp/build' })), undefined);
});

test('high-confidence ask does not intervene — the gate no longer routes to host approval', async () => {
  const gate = createDangerGate({ evaluate: async () => ({ answers: { verdict: { type: 'choice', choice: 'ask', confidence: 1, probabilities: { allow: 0, ask: 1, deny: 0 } } } }) });
  assert.equal(await gate.evaluate(exec('shell', { command: 'rm -rf /tmp/build' })), undefined);
});

test('low-confidence results do not intervene, even a deny suggestion (no opinion → pass through)', async () => {
  const gate = createDangerGate({ evaluate: async () => ({ answers: { verdict: { type: 'choice', choice: 'deny', confidence: 0.2,
    probabilities: { allow: 0, ask: 0.1, deny: 0.9 } } } }) });
  assert.equal(await gate.evaluate(exec('shell', { command: 'rm -rf /tmp/build' })), undefined);
});

test('custom rules add aliases and remove defaults without unsafe regexes', () => {
  const rules = { addToolNames: ['custom_exec'], removeToolNames: ['shell'], addCommandPatterns: ['wipe-prod'], addPathPatterns: ['/sensitive/'] };
  assert.equal(classifyDangerous(exec('custom_exec', { command: 'wipe-prod now' }), rules).dangerous, true);
  assert.equal(classifyDangerous(exec('shell', { command: 'rm -rf /tmp/build' }), rules).dangerous, false);
});

test('only a high-confidence deny becomes a monotonic deny; failures pass through', async () => {
  const deny = createDangerGate({ evaluate: async () => ({ answers: { verdict: { type: 'choice', choice: 'deny', confidence: 1, probabilities: { allow: 0, ask: 0, deny: 1 } } } }) });
  assert.equal((await deny.evaluate(exec('shell', { command: 'rm -rf /tmp/build' }))).kind, 'deny');
  const unavailable = createDangerGate({ evaluate: async () => { throw new Error('offline'); } });
  assert.equal(await unavailable.evaluate(exec('shell', { command: 'rm -rf /tmp/build' })), undefined);
});

test('default rules cover the real DSH filesystem and shell tool names', () => {
  for (const tool of ['bash', 'pwsh', 'write', 'edit', 'str_replace_editor']) {
    assert.equal(DEFAULT_DANGEROUS_RULES.toolNames.includes(tool), true, `${tool} must be gated`);
  }
  assert.equal(classifyDangerous(exec('write', { path: '/etc/passwd', content: 'x' }), DEFAULT_DANGEROUS_RULES).dangerous, true);
  assert.equal(classifyDangerous(exec('pwsh', { command: 'rm -rf /tmp/build' }), DEFAULT_DANGEROUS_RULES).dangerous, true);
});

test('a session whose store was evicted rebuilds empty and does not block on a rebuilt state', async () => {
  // With FIFO eviction there is no capacity-exceeded state; a fresh/rebuilt
  // session is simply enabled, so the gate evaluates normally (here: passes through).
  const gate = createDangerGate({ sessions: { snapshot: () => ({ enabled: true }), record: () => {}, log: () => {} },
    evaluate: async () => ({ answers: { verdict: { type: 'choice', choice: 'allow', confidence: 1, probabilities: { allow: 1, ask: 0, deny: 0 } } } }) });
  assert.deepEqual(await gate.preExecute(exec('shell', { command: 'rm -rf /tmp/build' }), async () => ({ kind: 'allow' })), { kind: 'allow' });
});

test('disabled sessions skip dangerous intervention without contacting backend', async () => {
  let calls = 0;
  const sessions = { snapshot: () => ({ enabled: false }), record: () => { throw new Error('must not record'); } };
  const gate = createDangerGate({ sessions, evaluate: async () => { calls++; throw new Error('must not evaluate'); } });
  assert.deepEqual(await gate.preExecute(exec('shell', { command: 'rm -rf /tmp/build' }), async () => ({ kind: 'allow' })), { kind: 'allow' });
  assert.equal(calls, 0);
});

test('session lookup failures do not block; the call proceeds on its original path', async () => {
  const gate = createDangerGate({ sessions: { snapshot: () => { throw new Error('state unavailable'); }, record: () => {}, log: () => {} }, evaluate: async () => { throw new Error('must not evaluate'); } });
  assert.deepEqual(await gate.preExecute(exec('shell', { command: 'rm -rf /tmp/build' }), async () => ({ kind: 'allow' })), { kind: 'allow' });
});

test('non-dangerous calls are passed to the next policy stage', async () => {
  const gate = createDangerGate({ evaluate: async () => { throw new Error('must not run'); } });
  assert.deepEqual(await gate.preExecute(exec('shell', { command: 'echo safe' }), async () => ({ kind: 'allow' })), { kind: 'allow' });
});

test('a confident deny through preExecute returns the deny decision, not next()', async () => {
  const gate = createDangerGate({ sessions: { snapshot: () => ({ enabled: true }), record: () => {}, log: () => {} },
    evaluate: async () => ({ answers: { verdict: { type: 'choice', choice: 'deny', confidence: 1, probabilities: { allow: 0, ask: 0, deny: 1 } } } }) });
  const result = await gate.preExecute(exec('bash', { command: 'rm -rf /tmp/build' }), async () => ({ kind: 'allow' }));
  assert.equal(result.kind, 'deny');
});

test('gate logs a deny with action deny; a pass-through records action pass', async () => {
  const entries = [];
  const sessions = { snapshot: () => ({ enabled: true }), record: () => {}, log: (_id, entry) => entries.push(entry) };
  const deny = createDangerGate({ sessions, evaluate: async () => ({ answers: { verdict: { type: 'choice', choice: 'deny', confidence: 1, probabilities: { allow: 0, ask: 0, deny: 1 } } } }) });
  await deny.evaluate(exec('bash', { command: 'rm -rf /tmp/build' }));
  // The gated command rides along on the log so a human reviewer sees WHAT was gated.
  assert.deepEqual(entries.at(-1), { kind: 'gate', outcome: 'deny', tool: 'bash', command: 'rm -rf /tmp/build', suggestion: 'deny', action: 'deny' });
  // A backend failure is a pass-through (no intervention), logged as error/pass.
  const unavailable = createDangerGate({ sessions, evaluate: async () => { throw new Error('offline'); } });
  await unavailable.evaluate(exec('edit', { path: '/etc/passwd' }));
  assert.deepEqual(entries.at(-1), { kind: 'gate', outcome: 'error', tool: 'edit', path: '/etc/passwd', action: 'pass', reason: 'unreachable' });
});

test('gate logs distinct pass-through reasons for invalid response and low confidence', async () => {
  const entries = [];
  const sessions = { snapshot: () => ({ enabled: true }), record: () => {}, log: (_id, entry) => entries.push(entry) };
  const invalid = createDangerGate({ sessions, evaluate: async () => ({ answers: { verdict: { type: 'choice' } } }) });
  await invalid.evaluate(exec('bash', { command: 'rm -rf /tmp/x' }));
  assert.equal(entries.at(-1).reason, 'invalid-response');
  assert.equal(entries.at(-1).action, 'pass');
  const lowConf = createDangerGate({ sessions, evaluate: async () => ({ answers: { verdict: { type: 'choice', choice: 'deny', confidence: 0.2, probabilities: { allow: 0, ask: 0.1, deny: 0.9 } } } }) });
  await lowConf.evaluate(exec('bash', { command: 'rm -rf /tmp/x' }));
  assert.equal(entries.at(-1).reason, 'low-confidence');
  assert.equal(entries.at(-1).confidence, 0.2);
  assert.equal(entries.at(-1).outcome, 'allow');
  assert.equal(entries.at(-1).action, 'pass');
});

test('recognizes DSH file_path arguments for ordinary edit calls', () => {
  const ordinaryEdit = exec('edit', { file_path: 'src/client/panel.tsx', old_string: 'old', new_string: 'new' });
  const sensitiveEdit = exec('edit', { file_path: '/workspace/.env', old_string: 'old', new_string: 'new' });
  assert.equal(classifyDangerous(ordinaryEdit, DEFAULT_DANGEROUS_RULES).dangerous, false);
  assert.equal(classifyDangerous(sensitiveEdit, DEFAULT_DANGEROUS_RULES).dangerous, true);
});
