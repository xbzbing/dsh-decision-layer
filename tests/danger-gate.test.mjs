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
  const gate = createDangerGate({ evaluate: async input => { request = input; return { answers: { verdict: { type: 'choice', choice: 'ask', confidence: 1, probabilities: { allow: 0, ask: 1, deny: 0 } } } }; } });
  await gate.evaluate(exec('file_write', { path: '/tmp/config', content: 'password=secret-token', metadata: { token: 'secret-token' } }));
  const serialized = JSON.stringify(request);
  assert.match(serialized, /file_write/);
  assert.match(serialized, /tmp\/config/);
  assert.doesNotMatch(serialized, /secret-token|password/);
});

test('backend choice allow never bypasses native permission policy', async () => {
  const gate = createDangerGate({ evaluate: async () => ({ answers: { verdict: { type: 'choice', choice: 'allow', confidence: 1, probabilities: { allow: 1, ask: 0, deny: 0 } } } }) });
  const result = await gate.evaluate(exec('shell', { command: 'rm -rf /tmp/build' }));
  assert.deepEqual(result, { kind: 'ask', reason: 'Dangerous call requires host approval', modelSuggestion: 'allow' });
});

test('low-confidence model results fall back to native approval', async () => {
  const gate = createDangerGate({ evaluate: async () => ({ answers: { verdict: { type: 'choice', choice: 'deny', confidence: 0.2,
    probabilities: { allow: 0, ask: 0.1, deny: 0.9 } } } }) });
  assert.deepEqual(await gate.evaluate(exec('shell', { command: 'rm -rf /tmp/build' })), { kind: 'ask', reason: 'Dangerous call requires host approval' });
});

test('custom rules add aliases and remove defaults without unsafe regexes', () => {
  const rules = { addToolNames: ['custom_exec'], removeToolNames: ['shell'], addCommandPatterns: ['wipe-prod'], addPathPatterns: ['/sensitive/'] };
  assert.equal(classifyDangerous(exec('custom_exec', { command: 'wipe-prod now' }), rules).dangerous, true);
  assert.equal(classifyDangerous(exec('shell', { command: 'rm -rf /tmp/build' }), rules).dangerous, false);
});

test('backend deny becomes a monotonic deny, while unavailable falls back to ask', async () => {
  const deny = createDangerGate({ evaluate: async () => ({ answers: { verdict: { type: 'choice', choice: 'deny', confidence: 1, probabilities: { allow: 0, ask: 0, deny: 1 } } } }) });
  assert.equal((await deny.evaluate(exec('shell', { command: 'rm -rf /tmp/build' }))).kind, 'deny');
  const unavailable = createDangerGate({ evaluate: async () => { throw new Error('offline'); } });
  assert.deepEqual(await unavailable.evaluate(exec('shell', { command: 'rm -rf /tmp/build' })), { kind: 'ask', reason: 'Dangerous call requires host approval' });
});

test('default rules cover the real DSH filesystem and shell tool names', () => {
  for (const tool of ['bash', 'pwsh', 'write', 'edit', 'str_replace_editor']) {
    assert.equal(DEFAULT_DANGEROUS_RULES.toolNames.includes(tool), true, `${tool} must be gated`);
  }
  assert.equal(classifyDangerous(exec('write', { path: '/etc/passwd', content: 'x' }), DEFAULT_DANGEROUS_RULES).dangerous, true);
  assert.equal(classifyDangerous(exec('pwsh', { command: 'rm -rf /tmp/build' }), DEFAULT_DANGEROUS_RULES).dangerous, true);
});

test('capacity overflow must not fail-open the dangerous gate', async () => {
  const gate = createDangerGate({ sessions: { snapshot: () => ({ enabled: false, capacityExceeded: true }), record: () => {} },
    evaluate: async () => { throw new Error('backend unavailable'); } });
  assert.deepEqual(await gate.preExecute(exec('shell', { command: 'rm -rf /tmp/build' }), async () => ({ kind: 'allow' })),
    { kind: 'ask', reason: 'Dangerous call requires host approval' });
});

test('disabled sessions skip dangerous intervention without contacting backend', async () => {
  let calls = 0;
  const sessions = { snapshot: () => ({ enabled: false }), record: () => { throw new Error('must not record'); } };
  const gate = createDangerGate({ sessions, evaluate: async () => { calls++; throw new Error('must not evaluate'); } });
  assert.deepEqual(await gate.preExecute(exec('shell', { command: 'rm -rf /tmp/build' }), async () => ({ kind: 'allow' })), { kind: 'allow' });
  assert.equal(calls, 0);
});

test('session lookup failures fail closed to host approval', async () => {
  const gate = createDangerGate({ sessions: { snapshot: () => { throw new Error('state unavailable'); } }, evaluate: async () => { throw new Error('must not evaluate'); } });
  assert.deepEqual(await gate.preExecute(exec('shell', { command: 'rm -rf /tmp/build' }), async () => ({ kind: 'allow' })), { kind: 'ask', reason: 'Dangerous call requires host approval' });
});

test('non-dangerous calls are passed to the next policy stage', async () => {
  const gate = createDangerGate({ evaluate: async () => { throw new Error('must not run'); } });
  assert.deepEqual(await gate.preExecute(exec('shell', { command: 'echo safe' }), async () => ({ kind: 'allow' })), { kind: 'allow' });
});

test('gate writes a structured decision log entry with tool, suggestion and action', async () => {
  const entries = [];
  const sessions = { snapshot: () => ({ enabled: true }), record: () => {}, log: (_id, entry) => entries.push(entry) };
  const deny = createDangerGate({ sessions, evaluate: async () => ({ answers: { verdict: { type: 'choice', choice: 'deny', confidence: 1, probabilities: { allow: 0, ask: 0, deny: 1 } } } }) });
  await deny.evaluate(exec('bash', { command: 'rm -rf /tmp/build' }));
  assert.deepEqual(entries.at(-1), { kind: 'gate', outcome: 'deny', tool: 'bash', suggestion: 'deny', action: 'deny' });
  const unavailable = createDangerGate({ sessions, evaluate: async () => { throw new Error('offline'); } });
  await unavailable.evaluate(exec('edit', { path: '/etc/passwd' }));
  assert.deepEqual(entries.at(-1), { kind: 'gate', outcome: 'error', tool: 'edit', action: 'ask', reason: 'unreachable' });
});

test('gate logs distinct fallback reasons for invalid response and low confidence', async () => {
  const entries = [];
  const sessions = { snapshot: () => ({ enabled: true }), record: () => {}, log: (_id, entry) => entries.push(entry) };
  const invalid = createDangerGate({ sessions, evaluate: async () => ({ answers: { verdict: { type: 'choice' } } }) });
  await invalid.evaluate(exec('bash', { command: 'rm -rf /tmp/x' }));
  assert.equal(entries.at(-1).reason, 'invalid-response');
  const lowConf = createDangerGate({ sessions, evaluate: async () => ({ answers: { verdict: { type: 'choice', choice: 'deny', confidence: 0.2, probabilities: { allow: 0, ask: 0.1, deny: 0.9 } } } }) });
  await lowConf.evaluate(exec('bash', { command: 'rm -rf /tmp/x' }));
  assert.equal(entries.at(-1).reason, 'low-confidence');
  const httpErr = createDangerGate({ sessions, evaluate: async () => { const e = new Error('http'); e.reason = 'http-error'; throw e; } });
  await httpErr.evaluate(exec('bash', { command: 'rm -rf /tmp/x' }));
  assert.equal(entries.at(-1).reason, 'http-error');
});

test('recognizes DSH file_path arguments for ordinary edit calls', () => {
  const ordinaryEdit = exec('edit', { file_path: 'src/client/panel.tsx', old_string: 'old', new_string: 'new' });
  const sensitiveEdit = exec('edit', { file_path: '/workspace/.env', old_string: 'old', new_string: 'new' });
  assert.equal(classifyDangerous(ordinaryEdit, DEFAULT_DANGEROUS_RULES).dangerous, false);
  assert.equal(classifyDangerous(sensitiveEdit, DEFAULT_DANGEROUS_RULES).dangerous, true);
});
