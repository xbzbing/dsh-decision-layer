import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { rm } from 'node:fs/promises';
import { loadConfig, saveConfig, resolveConfig, configPath, featureEnabled } from '../service/config-store.mjs';

const temporary = await mkdtemp(join(tmpdir(), 'decision-layer-test-'));
after(() => rm(temporary, { recursive: true, force: true }));
const file = join(temporary, 'config.json');

test('configuration resolves each field independently with fallback and no built-in key', async () => {
  const env = {
    DSH_DECISION_BASE_URL: 'https://new.example', DSH_DECISION_API_KEY: 'new-secret',
    DSH_DECISION_MODEL: 'custom', TYPESAFE_BASE_URL: 'https://legacy.example',
    TYPESAFE_API_KEY: 'legacy-secret',
  };
  assert.equal(configPath({ DSH_DECISION_CONFIG_PATH: file }), file);
  const initial = await resolveConfig({ path: file, env });
  assert.deepEqual(initial, { url: 'https://new.example', apiKey: 'new-secret', model: 'custom', httpApprovedUrl: '' });
  assert.equal((await resolveConfig({ path: file, env: {} })).apiKey, '');
  assert.deepEqual(await resolveConfig({ path: file, env: {} }), {
    url: 'https://api.typesafe.ai', apiKey: '', model: 'jev-latest', httpApprovedUrl: '',
  });
  assert.equal((await resolveConfig({ path: file, env: { TYPESAFE_API_KEY: 'fallback' } })).apiKey, 'fallback');
});

test('saved key is private and HTTP approval is bound to the exact address', async () => {
  await assert.rejects(saveConfig({ url: 'http://example.test', apiKey: 'secret' }, file), /confirm/i);
  const saved = await saveConfig({ url: 'http://EXAMPLE.test/', apiKey: 'secret', model: 'dev', confirmHttpUrl: 'http://EXAMPLE.test/' }, file);
  assert.deepEqual(saved, { url: 'http://example.test', model: 'dev', apiKeySet: true, httpApprovedUrl: 'http://example.test' });
  assert.equal((await stat(file)).mode & 0o077, 0);
  assert.equal((await resolveConfig({ path: file, env: {} })).apiKey, 'secret');
  const disk = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(disk.apiKey, 'secret');
  assert.ok(!JSON.stringify(saved).includes('secret'));
  const changed = await saveConfig({ url: 'https://another.example' }, file);
  assert.equal(changed.httpApprovedUrl, '');
  assert.equal(changed.apiKeySet, true);
  await assert.rejects(saveConfig({ url: 'http://another.example', confirmHttpUrl: 'http://example.test' }, file), /confirm/i);
  assert.equal((await saveConfig({ apiKey: '' }, file)).apiKeySet, false);
});

test('danger rules are validated, persisted, and resolved', async () => {
  const rulesFile = join(temporary, 'rules.json');
  const saved = await saveConfig({ apiKey: 'k', dangerRules: { addToolNames: ['custom_exec'], addCommandPatterns: ['wipe-prod'] } }, rulesFile);
  assert.deepEqual(saved.dangerRules, { addToolNames: ['custom_exec'], addCommandPatterns: ['wipe-prod'] });
  assert.deepEqual((await resolveConfig({ path: rulesFile, env: {} })).dangerRules, { addToolNames: ['custom_exec'], addCommandPatterns: ['wipe-prod'] });
  await assert.rejects(saveConfig({ dangerRules: { addToolNames: [123] } }, rulesFile), /danger rules/i);
  await assert.rejects(saveConfig({ dangerRules: { unknownField: ['x'] } }, rulesFile), /danger rules/i);
  assert.deepEqual((await saveConfig({ dangerRules: {} }, rulesFile)).dangerRules, {});
});

test('self-check settings are validated, persisted, and resolved', async () => {
  const checkFile = join(temporary, 'check.json');
  const saved = await saveConfig({ apiKey: 'k', checkSettings: { mode: 'steer', rubric: ['bad', 'ok', 'good'], lowScoreThreshold: 1 } }, checkFile);
  assert.deepEqual(saved.checkSettings, { mode: 'steer', rubric: ['bad', 'ok', 'good'], lowScoreThreshold: 1 });
  assert.deepEqual((await resolveConfig({ path: checkFile, env: {} })).checkSettings, { mode: 'steer', rubric: ['bad', 'ok', 'good'], lowScoreThreshold: 1 });
  await assert.rejects(saveConfig({ checkSettings: { mode: 'loud' } }, checkFile), /self-check/i);
  await assert.rejects(saveConfig({ checkSettings: { lowScoreThreshold: 99 } }, checkFile), /self-check/i);
  await assert.rejects(saveConfig({ checkSettings: { unknown: 1 } }, checkFile), /self-check/i);
});

test('narrowing settings are validated, persisted, and resolved', async () => {
  const narrowFile = join(temporary, 'narrow.json');
  const saved = await saveConfig({ apiKey: 'k', narrowSettings: { mode: 'enforce', threshold: 0.4 } }, narrowFile);
  assert.deepEqual(saved.narrowSettings, { mode: 'enforce', threshold: 0.4 });
  assert.deepEqual((await resolveConfig({ path: narrowFile, env: {} })).narrowSettings, { mode: 'enforce', threshold: 0.4 });
  await assert.rejects(saveConfig({ narrowSettings: { mode: 'hard' } }, narrowFile), /narrowing/i);
  await assert.rejects(saveConfig({ narrowSettings: { threshold: 2 } }, narrowFile), /narrowing/i);
  await assert.rejects(saveConfig({ narrowSettings: { unknown: 1 } }, narrowFile), /narrowing/i);
  assert.deepEqual((await saveConfig({ narrowSettings: {} }, narrowFile)).narrowSettings, {});
});

test('narrowing keepPrefixes are validated, persisted, and resolved', async () => {
  const keepFile = join(temporary, 'narrow-keep.json');
  const saved = await saveConfig({ apiKey: 'k', narrowSettings: { mode: 'enforce', keepPrefixes: ['mcp__openviking', 'mcp__git'] } }, keepFile);
  assert.deepEqual(saved.narrowSettings, { mode: 'enforce', keepPrefixes: ['mcp__openviking', 'mcp__git'] });
  assert.deepEqual((await resolveConfig({ path: keepFile, env: {} })).narrowSettings.keepPrefixes, ['mcp__openviking', 'mcp__git']);
  // an explicit empty list is preserved (clears the runtime default)
  assert.deepEqual((await saveConfig({ narrowSettings: { keepPrefixes: [] } }, keepFile)).narrowSettings.keepPrefixes, []);
  await assert.rejects(saveConfig({ narrowSettings: { keepPrefixes: ['ok', 123] } }, keepFile), /narrowing/i);
  await assert.rejects(saveConfig({ narrowSettings: { keepPrefixes: 'mcp' } }, keepFile), /narrowing/i);
});

test('narrowing maxCandidates is validated, persisted, and range-checked', async () => {
  const capFile = join(temporary, 'narrow-cap.json');
  const saved = await saveConfig({ apiKey: 'k', narrowSettings: { mode: 'enforce', maxCandidates: 40 } }, capFile);
  assert.equal(saved.narrowSettings.maxCandidates, 40);
  assert.equal((await resolveConfig({ path: capFile, env: {} })).narrowSettings.maxCandidates, 40);
  await assert.rejects(saveConfig({ narrowSettings: { maxCandidates: 0 } }, capFile), /narrowing/i);
  await assert.rejects(saveConfig({ narrowSettings: { maxCandidates: 201 } }, capFile), /narrowing/i);
  await assert.rejects(saveConfig({ narrowSettings: { maxCandidates: 12.5 } }, capFile), /narrowing/i);
});

test('task-completion settings are validated, persisted, and resolved', async () => {
  const completeFile = join(temporary, 'complete.json');
  const saved = await saveConfig({ apiKey: 'k', completeSettings: { mode: 'steer', minConditions: 3 } }, completeFile);
  assert.deepEqual(saved.completeSettings, { mode: 'steer', minConditions: 3 });
  assert.deepEqual((await resolveConfig({ path: completeFile, env: {} })).completeSettings, { mode: 'steer', minConditions: 3 });
  await assert.rejects(saveConfig({ completeSettings: { mode: 'loud' } }, completeFile), /task-completion/i);
  await assert.rejects(saveConfig({ completeSettings: { minConditions: 1 } }, completeFile), /task-completion/i);
  await assert.rejects(saveConfig({ completeSettings: { minConditions: 21 } }, completeFile), /task-completion/i);
  await assert.rejects(saveConfig({ completeSettings: { unknown: 1 } }, completeFile), /task-completion/i);
  assert.deepEqual((await saveConfig({ completeSettings: {} }, completeFile)).completeSettings, {});
});

test('per-feature switches are validated, persisted, and default to enabled', async () => {
  const featureFile = join(temporary, 'features.json');
  const saved = await saveConfig({ apiKey: 'k', features: { gate: false, check: true, narrow: false, complete: false } }, featureFile);
  assert.deepEqual(saved.features, { gate: false, check: true, narrow: false, complete: false });
  assert.deepEqual((await resolveConfig({ path: featureFile, env: {} })).features, { gate: false, check: true, narrow: false, complete: false });
  await assert.rejects(saveConfig({ features: { gate: 'yes' } }, featureFile), /feature/i);
  await assert.rejects(saveConfig({ features: { unknown: true } }, featureFile), /feature/i);
  assert.equal(featureEnabled(undefined, 'gate'), true, 'unset defaults to enabled');
  assert.equal(featureEnabled({ gate: false }, 'gate'), false);
  assert.equal(featureEnabled({ gate: false }, 'check'), true, 'other features stay enabled');
  assert.equal(featureEnabled(undefined, 'complete'), true, 'completion defaults to enabled');
});

test('danger-gate settings are validated, persisted, and resolved', async () => {
  const gateFile = join(temporary, 'gate.json');
  const saved = await saveConfig({ apiKey: 'k', gateSettings: { minConfidence: 0.55 } }, gateFile);
  assert.deepEqual(saved.gateSettings, { minConfidence: 0.55 });
  assert.deepEqual((await resolveConfig({ path: gateFile, env: {} })).gateSettings, { minConfidence: 0.55 });
  // Both extremes are legal: 0 blocks every deny verdict, 1 only a certain one.
  assert.equal((await saveConfig({ gateSettings: { minConfidence: 0 } }, gateFile)).gateSettings.minConfidence, 0);
  assert.equal((await saveConfig({ gateSettings: { minConfidence: 1 } }, gateFile)).gateSettings.minConfidence, 1);
  await assert.rejects(saveConfig({ gateSettings: { minConfidence: 1.5 } }, gateFile), /gate settings/i);
  await assert.rejects(saveConfig({ gateSettings: { minConfidence: -0.1 } }, gateFile), /gate settings/i);
  await assert.rejects(saveConfig({ gateSettings: { minConfidence: '0.5' } }, gateFile), /gate settings/i);
  await assert.rejects(saveConfig({ gateSettings: { unknown: 1 } }, gateFile), /gate settings/i);
  assert.deepEqual((await saveConfig({ gateSettings: {} }, gateFile)).gateSettings, {});
});

test('self-check confidence is validated alongside the other self-check fields', async () => {
  const checkFile = join(temporary, 'check-confidence.json');
  const saved = await saveConfig({ apiKey: 'k', checkSettings: { mode: 'steer', minConfidence: 0.55, trendMinConfidence: 0.7, trendRun: 4, trendSevereRun: 6, lowScoreThreshold: 2 } }, checkFile);
  assert.deepEqual(saved.checkSettings, { mode: 'steer', minConfidence: 0.55, trendMinConfidence: 0.7, trendRun: 4, trendSevereRun: 6, lowScoreThreshold: 2 });
  assert.deepEqual((await resolveConfig({ path: checkFile, env: {} })).checkSettings, saved.checkSettings);
  await assert.rejects(saveConfig({ checkSettings: { minConfidence: 2 } }, checkFile), /self-check/i);
  await assert.rejects(saveConfig({ checkSettings: { minConfidence: 'high' } }, checkFile), /self-check/i);
  // the severe run must sit strictly above the warn run
  await assert.rejects(saveConfig({ checkSettings: { trendRun: 5, trendSevereRun: 5 } }, checkFile), /self-check/i);
});

test('task-completion confidence is validated alongside minConditions', async () => {
  const completeFile = join(temporary, 'complete-confidence.json');
  const saved = await saveConfig({ apiKey: 'k', completeSettings: { mode: 'steer', minConditions: 3, minConfidence: 0.45 } }, completeFile);
  assert.deepEqual(saved.completeSettings, { mode: 'steer', minConditions: 3, minConfidence: 0.45 });
  assert.deepEqual((await resolveConfig({ path: completeFile, env: {} })).completeSettings, saved.completeSettings);
  await assert.rejects(saveConfig({ completeSettings: { minConfidence: -1 } }, completeFile), /task-completion/i);
  await assert.rejects(saveConfig({ completeSettings: { minConfidence: 1.01 } }, completeFile), /task-completion/i);
});

test('narrowing batchMode is validated, persisted, and resolved', async () => {
  const batchFile = join(temporary, 'narrow-batch.json');
  assert.equal((await saveConfig({ apiKey: 'k', narrowSettings: { batchMode: 'split' } }, batchFile)).narrowSettings.batchMode, 'split');
  assert.equal((await resolveConfig({ path: batchFile, env: {} })).narrowSettings.batchMode, 'split');
  assert.equal((await saveConfig({ narrowSettings: { batchMode: 'single' } }, batchFile)).narrowSettings.batchMode, 'single');
  assert.equal((await saveConfig({ narrowSettings: { batchMode: 'auto' } }, batchFile)).narrowSettings.batchMode, 'auto');
  await assert.rejects(saveConfig({ narrowSettings: { batchMode: 'many' } }, batchFile), /narrowing/i);
});

test('a flat save leaves untouched sections on disk instead of dropping them', async () => {
  const flatFile = join(temporary, 'flat.json');
  await saveConfig({ apiKey: 'k', gateSettings: { minConfidence: 0.5 }, checkSettings: { minConfidence: 0.3 },
    narrowSettings: { batchMode: 'split' }, completeSettings: { minConfidence: 0.2 } }, flatFile);
  // saving the backend section alone must not wipe the tuning sections
  await saveConfig({ model: 'other-model' }, flatFile);
  const resolved = await resolveConfig({ path: flatFile, env: {} });
  assert.equal(resolved.model, 'other-model');
  assert.equal(resolved.gateSettings.minConfidence, 0.5);
  assert.equal(resolved.checkSettings.minConfidence, 0.3);
  assert.equal(resolved.narrowSettings.batchMode, 'split');
  assert.equal(resolved.completeSettings.minConfidence, 0.2);
});

test('invalid URLs are rejected and missing config has a safe display view', async () => {
  const missing = await loadConfig(join(temporary, 'missing.json'));
  assert.deepEqual(missing, { url: '', model: '', apiKeySet: false, httpApprovedUrl: '' });
  await assert.rejects(saveConfig({ url: 'file:///etc/passwd' }, file), /URL/i);
  await assert.rejects(saveConfig({ url: 'https://user:pass@example.test' }, file), /URL/i);
  await assert.rejects(saveConfig({ model: 'bad\rmodel' }, file), /model/i);
});
