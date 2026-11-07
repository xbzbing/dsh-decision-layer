import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import { writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React from 'react';
let render, fireEvent, waitFor, cleanup;
import { dictionaries } from '../src/client/i18n.ts';

let Panel, ConfigForm, AnalysisView;
let dom;
const originalFetch = globalThis.fetch;
const translate = (key, params) => {
  const template = dictionaries.zh[key];
  return params && typeof template === 'string' ? template.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? `{${name}}`)) : template;
};
const envelope = value => new Response(JSON.stringify({ ok: true, value }), { headers: { 'content-type': 'application/json' } });

before(async () => {
  dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost:3080' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  ({ render, fireEvent, waitFor, cleanup } = await import('@testing-library/react'));
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new dom.window.Event('close')); };
  const panel = await build({ entryPoints: ['src/client/panel.tsx'], platform: 'node', format: 'esm', bundle: true,
    external: ['react', 'react/jsx-runtime'], jsx: 'automatic', write: false });
  await writeFile('lib/panel-test.mjs', panel.outputFiles[0].text);
  Panel = (await import('../lib/panel-test.mjs')).DecisionPanel;
  const form = await build({ entryPoints: ['src/client/config-form.tsx'], platform: 'node', format: 'esm', bundle: true,
    external: ['react', 'react/jsx-runtime'], jsx: 'automatic', write: false });
  await writeFile('lib/config-form-test.mjs', form.outputFiles[0].text);
  ConfigForm = (await import('../lib/config-form-test.mjs')).ConfigForm;
  const analysis = await build({ entryPoints: ['src/client/analysis-view.tsx'], platform: 'node', format: 'esm', bundle: true,
    external: ['react', 'react/jsx-runtime'], jsx: 'automatic', write: false });
  await writeFile('lib/analysis-view-test.mjs', analysis.outputFiles[0].text);
  AnalysisView = (await import('../lib/analysis-view-test.mjs')).AnalysisView;
});

afterEach(() => cleanup());
after(() => { globalThis.fetch = originalFetch; dom?.window.close(); });

test('switching session does not show stale enabled state or accept a late update', async () => {
  let resolveWrite;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/session?')) return envelope({ enabled: !String(url).includes('two') });
    if (String(url).includes('/metrics?')) return envelope({ hasAutomaticDecisions: false, attempts: 0, failures: 0 });
    if (String(url).includes('/log?')) return envelope({ entries: [] });
    if (String(url).endsWith('/session') && init?.method === 'PUT') return new Promise(resolve => { resolveWrite = resolve; });
    throw new Error(`Unexpected URL ${url}`);
  };
  const view = render(React.createElement(Panel, { sessionId: 'one', t: translate }));
  fireEvent.click(view.getByRole('button', { name: /决策层/ }));
  const toggle = await view.findByRole('checkbox', { name: '本会话内启用自动介入' });
  await waitFor(() => assert.equal(toggle.checked, true));
  fireEvent.click(toggle);
  view.rerender(React.createElement(Panel, { sessionId: 'two', t: translate }));
  fireEvent.click(view.getByRole('button', { name: /决策层/ }));
  await waitFor(() => assert.equal(view.getByRole('checkbox', { name: '本会话内启用自动介入' }).checked, false));
  resolveWrite(envelope({ enabled: false }));
  await waitFor(() => assert.equal(view.getByRole('checkbox', { name: '本会话内启用自动介入' }).checked, false));
});

test('the panel switch mirrors a change made from the analysis tab', async () => {
  globalThis.fetch = async url => {
    if (String(url).includes('/session?')) return envelope({ enabled: true });
    if (String(url).includes('/metrics?')) return envelope({ hasAutomaticDecisions: false, attempts: 0, failures: 0 });
    if (String(url).includes('/log?')) return envelope({ entries: [] });
    throw new Error(`Unexpected URL ${url}`);
  };
  const view = render(React.createElement(Panel, { sessionId: 'sync', t: translate }));
  fireEvent.click(view.getByRole('button', { name: /决策层/ }));
  const toggle = await view.findByRole('checkbox', { name: '本会话内启用自动介入' });
  await waitFor(() => assert.equal(toggle.checked, true));
  // a confirmed change from the analysis tab reaches this panel without a reload
  window.dispatchEvent(new window.CustomEvent('dsh-decision-layer:session-enabled', { detail: { sessionId: 'sync', enabled: false } }));
  await waitFor(() => assert.equal(toggle.checked, false));
  // another session's change is ignored
  window.dispatchEvent(new window.CustomEvent('dsh-decision-layer:session-enabled', { detail: { sessionId: 'other', enabled: true } }));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(toggle.checked, false, 'another session\'s change must not touch this panel');
});

test('a low-confidence low self-check score is tagged as ignorable noise', async () => {
  globalThis.fetch = async url => {
    if (String(url).includes('/session?')) return envelope({ enabled: true });
    if (String(url).includes('/metrics?')) return envelope({ hasAutomaticDecisions: true, attempts: 1, failures: 0,
      check: { attempts: 1, failures: 0, low: 1 } });
    if (String(url).includes('/logs?')) return envelope({ totalDecisions: 1, annotations: { rated: 0, good: 0, bad: 0, unsure: 0 }, ratings: {}, trendBacktest: { warnHits: 0, severeHits: 0, maxRun: 0 } });
    if (String(url).includes('/log?')) return envelope({ entries: [
      { id: 'n1', at: 1_700_000_040_000, kind: 'check', outcome: 'low', score: 0.41, confidence: 0.29, lowConfidence: true, task: '补上', turn: 22 },
    ] });
    if (String(url).endsWith('/config')) return envelope({ url: '', model: '', apiKeySet: false, httpApprovedUrl: '', effectiveUrl: 'https://api.typesafe.ai' });
    throw new Error(`Unexpected URL ${url}`);
  };
  const view = render(React.createElement(Panel, { sessionId: 'noise', t: translate }));
  fireEvent.click(view.getByRole('button', { name: /决策层/ }));
  // the low-confidence low score reads as "低置信" and carries the noise tag
  await view.findByText(/得分偏低（低置信）/);
  const row = (await view.findByText(/噪声，可忽略/)).closest('li');
  // the row uses the neutral muted accent, not the amber warn accent
  assert.ok(row.className.includes('decision-log-muted'), 'a noisy low score is muted, not warn');
  assert.ok(!row.className.includes('decision-log-warn'), 'it must not use the warn accent');
  // A low score is still marked and names its request inline: muting the noise
  // must not make the row hard to find.
  assert.ok(row.className.includes('decision-log-low'), 'the low row keeps a findable accent');
  assert.match(row.textContent, /低评分/, 'the low-score badge is visible');
  assert.match(row.textContent, /回合 22/, 'the row names its turn');
  assert.match(row.textContent, /「补上」/, 'the task excerpt is inline, even for a short follow-up');
});

test('modal shows gate metrics and the decision log, not the backend form', async () => {
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/session?')) return envelope({ enabled: true });
    if (String(url).includes('/metrics?')) return envelope({ hasAutomaticDecisions: true, attempts: 5, failures: 1,
      gate: { attempts: 5, failures: 1, allow: 1, ask: 2, deny: 1, actual: { allow: 1, deny: 2, error: 0 } } });
    if (String(url).includes('/log?')) return envelope({ entries: [
      { at: 1_700_000_000_000, kind: 'gate', outcome: 'deny', tool: 'bash', suggestion: 'deny', action: 'deny' },
      { at: 1_700_000_001_000, kind: 'check', outcome: 'low', score: 0 },
      { at: 1_700_000_002_000, kind: 'gate', outcome: 'error', tool: 'edit', reason: 'unavailable' },
    ] });
    if (String(url).endsWith('/config')) return envelope({ url: '', model: '', apiKeySet: false, httpApprovedUrl: '', effectiveUrl: 'https://api.typesafe.ai' });
    if (String(url).endsWith('/probe') && init?.method === 'POST') return envelope({ connected: true, effectiveUrl: 'https://api.typesafe.ai' });
    throw new Error(`Unexpected URL ${url}`);
  };
  const view = render(React.createElement(Panel, { sessionId: 'metrics', t: translate }));
  fireEvent.click(view.getByRole('button', { name: /决策层/ }));
  await view.findByText('危险门控');
  // gate card legend shows allow / ask / deny counts
  const gateCard = view.getByText('危险门控').closest('article');
  assert.match(gateCard.textContent, /放行.*1/);
  assert.match(gateCard.textContent, /询问.*2/);
  assert.match(gateCard.textContent, /拒绝.*1/);
  assert.match(gateCard.textContent, /实际结果.*1 \/ 2/);
  await view.findByText(/已拒绝/);
  await view.findByText(/得分偏低/);
  await view.findByText(/未干预/);
  await view.findByText(/后端不可达/);
  await view.findByText(/后端连接/);
  assert.equal(view.queryByLabelText('服务地址'), null, 'the backend form must not appear in the modal');
});

test('task excerpts render for narrowing, gate and self-check rows, with turn and step where they exist', async () => {
  const task = '修复登录页面，保留现有接口。'.repeat(12);
  globalThis.fetch = async url => {
    if (String(url).includes('/session?')) return envelope({ enabled: true });
    if (String(url).includes('/metrics?')) return envelope({ hasAutomaticDecisions: true, attempts: 3, failures: 1,
      narrow: { attempts: 3, failures: 1, applied: 1, dropped: 1 } });
    if (String(url).includes('/log?')) return envelope({ entries: [
      { id: 'context', at: 1, kind: 'narrow', outcome: 'applied', dropped: 1, kept: 5, tools: ['web_search'], mode: 'enforce', applied: true, task, turn: 7, step: 3 },
      { id: 'failed', at: 2, kind: 'narrow', outcome: 'error', reason: 'unreachable', task: '检查构建问题', turn: 8 },
      { id: 'legacy', at: 3, kind: 'narrow', outcome: 'ok', dropped: 0, kept: 6 },
      { id: 'gate-context', at: 4, kind: 'gate', outcome: 'deny', tool: 'shell', command: 'rm -rf dist', task: '清理构建产物', action: 'deny' },
      { id: 'check-context', at: 5, kind: 'check', outcome: 'ok', score: 2, confidence: 1, task: '核对登录页接口错误', turn: 9 },
    ] });
    if (String(url).endsWith('/config')) return envelope({ url: '', model: '', apiKeySet: false, httpApprovedUrl: '', effectiveUrl: 'https://api.typesafe.ai' });
    throw new Error(`Unexpected URL ${url}`);
  };
  const view = render(React.createElement(Panel, { sessionId: 'narrow-context', t: translate }));
  fireEvent.click(view.getByRole('button', { name: /决策层/ }));
  const summary = await view.findByText(/场景（任务节选）：修复登录页面/);
  const details = summary.closest('details');
  assert.ok(details);
  assert.equal(details.open, false);
  assert.equal(details.querySelector('p').textContent, task);
  fireEvent.click(summary);
  assert.equal(details.open, true);
  fireEvent.click(summary);
  assert.equal(details.open, false);
  assert.match(details.closest('li').textContent, /回合 7 · 第 3 步/);
  assert.match(details.closest('li').textContent, /web_search/);
  assert.match(details.closest('li').textContent, /已生效（下一步起）/);
  const failed = (await view.findByText(/场景（任务节选）：检查构建问题/)).closest('li');
  assert.match(failed.textContent, /回合 8/);
  assert.match(failed.textContent, /评估失败/);
  const legacy = (await view.findByText(/保留 6/)).closest('li');
  assert.equal(legacy.querySelector('details'), null);
  // The expandable block is no longer narrowing-only: a gate row carries the
  // excerpt without a turn, and a self-check row carries both.
  const gateRow = (await view.findByText(/场景（任务节选）：清理构建产物/)).closest('li');
  assert.ok(gateRow.querySelector('details'), 'gate rows render the excerpt');
  assert.doesNotMatch(gateRow.textContent, /回合/);
  const checkRow = (await view.findByText(/场景（任务节选）：核对登录页接口错误/)).closest('li');
  assert.ok(checkRow.querySelector('details'), 'self-check rows render the excerpt');
  assert.match(checkRow.textContent, /回合 9/);
  assert.match(checkRow.textContent, /通过/);
});

test('narrow log with too-many-candidates shows the count once and no duplicate observe tag', async () => {
  globalThis.fetch = async url => {
    if (String(url).includes('/session?')) return envelope({ enabled: true });
    if (String(url).includes('/metrics?')) return envelope({ hasAutomaticDecisions: true, attempts: 1, failures: 0,
      narrow: { attempts: 1, failures: 0, applied: 0, dropped: 0 } });
    if (String(url).includes('/log?')) return envelope({ entries: [
      { at: 1_700_000_003_000, kind: 'narrow', outcome: 'ok', mode: 'observe', dropped: 0, kept: 53, reason: 'too-many-candidates', candidates: 40 },
    ] });
    if (String(url).endsWith('/config')) return envelope({ url: '', model: '', apiKeySet: false, httpApprovedUrl: '', effectiveUrl: 'https://api.typesafe.ai' });
    throw new Error(`Unexpected URL ${url}`);
  };
  const view = render(React.createElement(Panel, { sessionId: 'narrow-log', t: translate }));
  fireEvent.click(view.getByRole('button', { name: /决策层/ }));
  const row = (await view.findByText(/候选 40 个偏多/)).closest('li') ?? (await view.findByText(/候选 40 个偏多/)).parentElement;
  // the candidate count appears mid-line, and "仅观察" appears exactly once as the final verdict
  assert.match(row.textContent, /候选 40 个偏多/);
  assert.equal((row.textContent.match(/仅观察/g) ?? []).length, 1, 'the final mode tag shows observe once');
});

test('narrow log does not claim an enforced pass when nothing was dropped', async () => {
  globalThis.fetch = async url => {
    if (String(url).includes('/session?')) return envelope({ enabled: true });
    if (String(url).includes('/metrics?')) return envelope({ hasAutomaticDecisions: true, attempts: 1, failures: 0,
      narrow: { attempts: 1, failures: 0, applied: 0, dropped: 0 } });
    if (String(url).includes('/log?')) return envelope({ entries: [
      { at: 1_700_000_004_000, kind: 'narrow', outcome: 'ok', mode: 'enforce', dropped: 0, kept: 80, applied: false },
    ] });
    if (String(url).endsWith('/config')) return envelope({ url: '', model: '', apiKeySet: false, httpApprovedUrl: '', effectiveUrl: 'https://api.typesafe.ai' });
    throw new Error(`Unexpected URL ${url}`);
  };
  const view = render(React.createElement(Panel, { sessionId: 'narrow-no-drop', t: translate }));
  fireEvent.click(view.getByRole('button', { name: /决策层/ }));
  const row = (await view.findByText(/保留 80/)).closest('li') ?? (await view.findByText(/保留 80/)).parentElement;
  // nothing was dropped, so the pass neither enforced nor failed to enforce
  assert.doesNotMatch(row.textContent, /已生效/);
  assert.doesNotMatch(row.textContent, /未生效/);
});

test('narrow log marks a vetoed enforce pass as not applied', async () => {
  globalThis.fetch = async url => {
    if (String(url).includes('/session?')) return envelope({ enabled: true });
    if (String(url).includes('/metrics?')) return envelope({ hasAutomaticDecisions: true, attempts: 1, failures: 0,
      narrow: { attempts: 1, failures: 0, applied: 0, dropped: 5 } });
    if (String(url).includes('/log?')) return envelope({ entries: [
      // The server's low-keep shape: a drop was computed, then vetoed.
      { at: 1_700_000_005_000, kind: 'narrow', outcome: 'applied', mode: 'enforce', dropped: 5, kept: 3, applied: false, reason: 'low-keep' },
    ] });
    if (String(url).endsWith('/config')) return envelope({ url: '', model: '', apiKeySet: false, httpApprovedUrl: '', effectiveUrl: 'https://api.typesafe.ai' });
    throw new Error(`Unexpected URL ${url}`);
  };
  const view = render(React.createElement(Panel, { sessionId: 'narrow-vetoed', t: translate }));
  fireEvent.click(view.getByRole('button', { name: /决策层/ }));
  const row = (await view.findByText(/摘除 5/)).closest('li') ?? (await view.findByText(/摘除 5/)).parentElement;
  assert.match(row.textContent, /保留过少/);
  assert.equal((row.textContent.match(/未生效/g) ?? []).length, 1, 'the veto is stated once, by the mode tag');
  assert.doesNotMatch(row.textContent, /已生效/);
});

test('narrow log reads a legacy low-keep row without an applied field as not applied', async () => {
  globalThis.fetch = async url => {
    if (String(url).includes('/session?')) return envelope({ enabled: true });
    if (String(url).includes('/metrics?')) return envelope({ hasAutomaticDecisions: true, attempts: 1, failures: 0,
      narrow: { attempts: 1, failures: 0, applied: 0, dropped: 5 } });
    if (String(url).includes('/log?')) return envelope({ entries: [
      { at: 1_700_000_006_000, kind: 'narrow', outcome: 'applied', mode: 'enforce', dropped: 5, kept: 3, reason: 'low-keep' },
    ] });
    if (String(url).endsWith('/config')) return envelope({ url: '', model: '', apiKeySet: false, httpApprovedUrl: '', effectiveUrl: 'https://api.typesafe.ai' });
    throw new Error(`Unexpected URL ${url}`);
  };
  const view = render(React.createElement(Panel, { sessionId: 'narrow-legacy-vetoed', t: translate }));
  fireEvent.click(view.getByRole('button', { name: /决策层/ }));
  const row = (await view.findByText(/摘除 5/)).closest('li') ?? (await view.findByText(/摘除 5/)).parentElement;
  assert.equal((row.textContent.match(/未生效/g) ?? []).length, 1, 'a row logged before applied existed is still read as not applied');
  assert.doesNotMatch(row.textContent, /已生效/);
});

test('config form discloses HTTPS destination and clears password draft on unmount', async () => {
  globalThis.fetch = async url => {
    if (String(url).endsWith('/config')) return envelope({ url: 'https://custom.test', model: 'jev-latest', apiKeySet: false,
      httpApprovedUrl: '', effectiveUrl: 'https://custom.test', checkSettings: { mode: 'observe', lowScoreThreshold: 1 } });
    throw new Error(`Unexpected URL ${url}`);
  };
  const view = render(React.createElement(ConfigForm, { t: translate }));
  assert.equal(view.getByRole('button', { name: '测试连接' }).disabled, true);
  assert.equal(view.getByLabelText('服务地址').disabled, true);
  await view.findByText(/https:\/\/custom\.test/);
  assert.equal(view.getByLabelText('服务地址').disabled, false);
  assert.equal(view.getByRole('button', { name: '测试连接' }).disabled, false);
  assert.match(view.getByText(/裁决时会向以下后端发送/).textContent, /custom\.test/);
  fireEvent.change(view.getByLabelText('服务地址'), { target: { value: 'https://unsaved.test' } });
  assert.equal(view.getByRole('button', { name: '测试连接' }).disabled, true);
});

test('connection-test result renders inline next to the test button', async () => {
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/config')) return envelope({ url: '', model: '', apiKeySet: true, httpApprovedUrl: '', effectiveUrl: 'https://api.typesafe.ai', checkSettings: { mode: 'observe', lowScoreThreshold: 1 } });
    if (String(url).endsWith('/probe') && init?.method === 'POST') return envelope({ connected: true });
    throw new Error(`Unexpected URL ${url}`);
  };
  const view = render(React.createElement(ConfigForm, { t: translate }));
  const button = await view.findByRole('button', { name: '测试连接' });
  fireEvent.click(button);
  const result = await view.findByText('连接成功');
  // the verdict sits in the same action row as the test button, not the shared footer
  assert.equal(result.closest('.decision-actions'), button.closest('.decision-actions'));
});

test('config form reflects steer mode and posts the chosen mode on save', async () => {
  let savedBody;
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/config') && init?.method === 'PUT') { savedBody = JSON.parse(init.body); return envelope({ url: '', model: '', apiKeySet: false, httpApprovedUrl: '', effectiveUrl: 'https://api.typesafe.ai', checkSettings: { mode: 'steer', lowScoreThreshold: 1 } }); }
    if (String(url).endsWith('/config')) return envelope({ url: '', model: '', apiKeySet: false, httpApprovedUrl: '', effectiveUrl: 'https://api.typesafe.ai', checkSettings: { mode: 'observe', lowScoreThreshold: 1 } });
    throw new Error(`Unexpected URL ${url}`);
  };
  const view = render(React.createElement(ConfigForm, { t: translate }));
  const toggle = await view.findByRole('checkbox', { name: '得分偏低时自动补一轮' });
  assert.equal(toggle.checked, false, 'observe mode is unchecked by default');
  fireEvent.click(toggle);
  fireEvent.click(view.getByRole('button', { name: '保存高级配置' }));
  await waitFor(() => assert.equal(savedBody?.checkSettings?.mode, 'steer'));
  assert.equal(savedBody.url, undefined, 'advanced save must not touch backend url');
});

test('task-completion switch and steer post the chosen state on advanced save', async () => {
  let savedBody;
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/config') && init?.method === 'PUT') { savedBody = JSON.parse(init.body); return envelope({ url: '', model: '', apiKeySet: false, httpApprovedUrl: '', effectiveUrl: 'https://api.typesafe.ai', completeSettings: { mode: savedBody.completeSettings.mode } }); }
    if (String(url).endsWith('/config')) return envelope({ url: '', model: '', apiKeySet: false, httpApprovedUrl: '', effectiveUrl: 'https://api.typesafe.ai', completeSettings: { mode: 'observe' }, features: { complete: true } });
    throw new Error(`Unexpected URL ${url}`);
  };
  const view = render(React.createElement(ConfigForm, { t: translate }));
  const steer = await view.findByRole('checkbox', { name: '有未满足条件时自动补一轮' });
  assert.equal(steer.checked, false, 'completion observe mode is unchecked by default');
  fireEvent.click(steer);
  fireEvent.click(view.getByRole('button', { name: '保存高级配置' }));
  await waitFor(() => assert.equal(savedBody?.completeSettings?.mode, 'steer'));
  // advanced save no longer carries the feature switches (those save immediately)
  assert.equal(savedBody.features, undefined, 'advanced save must not touch the feature switches');
});

test('a basic feature switch saves immediately and posts only the features', async () => {
  const puts = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/config') && init?.method === 'PUT') { const body = JSON.parse(init.body); puts.push(body);
      return envelope({ url: '', model: '', apiKeySet: false, httpApprovedUrl: '', effectiveUrl: 'https://api.typesafe.ai', features: body.features }); }
    if (String(url).endsWith('/config')) return envelope({ url: '', model: '', apiKeySet: false, httpApprovedUrl: '', effectiveUrl: 'https://api.typesafe.ai', features: { gate: true, check: true, narrow: true, complete: true } });
    throw new Error(`Unexpected URL ${url}`);
  };
  const view = render(React.createElement(ConfigForm, { t: translate }));
  const gate = await view.findByRole('checkbox', { name: '危险门控' });
  assert.equal(gate.checked, true, 'gate starts on');
  fireEvent.click(gate);
  // toggling posts immediately, with only the features field and the full set
  await waitFor(() => assert.equal(puts.length, 1, 'a toggle saves immediately without a save button'));
  assert.equal(puts[0].features.gate, false, 'the toggled feature is posted off');
  assert.equal(puts[0].features.check, true, 'the other features round-trip unchanged');
  assert.equal(puts[0].url, undefined, 'an immediate feature save must not touch the backend url');
  assert.equal(puts[0].checkSettings, undefined, 'an immediate feature save must not touch advanced settings');
  await waitFor(() => assert.equal(view.getByRole('checkbox', { name: '危险门控' }).checked, false));
});

test('a failed feature toggle reverts to its previous state', async () => {
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/config') && init?.method === 'PUT') return new Response(JSON.stringify({ ok: false, error: 'boom' }), { status: 500, headers: { 'content-type': 'application/json' } });
    if (String(url).endsWith('/config')) return envelope({ url: '', model: '', apiKeySet: false, httpApprovedUrl: '', effectiveUrl: 'https://api.typesafe.ai', features: { gate: true, check: true, narrow: true, complete: true } });
    throw new Error(`Unexpected URL ${url}`);
  };
  const view = render(React.createElement(ConfigForm, { t: translate }));
  const narrow = await view.findByRole('checkbox', { name: '工具收窄' });
  assert.equal(narrow.checked, true);
  fireEvent.click(narrow);
  // after the write fails the switch reverts to on
  await waitFor(() => assert.equal(view.getByRole('checkbox', { name: '工具收窄' }).checked, true, 'a failed toggle reverts'));
});

test('trigger icon carries the quality-trend severity class from the metrics', async () => {
  globalThis.fetch = async url => {
    if (String(url).includes('/session?')) return envelope({ enabled: true });
    if (String(url).includes('/metrics?')) return envelope({ hasAutomaticDecisions: true, attempts: 4, failures: 0,
      check: { attempts: 4, failures: 0, low: 3, trend: { run: 5, severity: 'severe' } } });
    if (String(url).includes('/log?')) return envelope({ entries: [] });
    if (String(url).endsWith('/config')) return envelope({ url: '', model: '', apiKeySet: false, httpApprovedUrl: '', effectiveUrl: 'https://api.typesafe.ai' });
    throw new Error(`Unexpected URL ${url}`);
  };
  const view = render(React.createElement(Panel, { sessionId: 'trend', t: translate }));
  const button = view.getByRole('button', { name: /决策层/ });
  await waitFor(() => assert.ok(button.className.includes('decision-trend-severe'), 'severe trend tints the trigger'));
  assert.ok(button.getAttribute('title'), 'a hover explanation is present in severe state');
});

test('trigger icon is normal severity when there is no trend data', async () => {
  globalThis.fetch = async url => {
    if (String(url).includes('/session?')) return envelope({ enabled: true });
    if (String(url).includes('/metrics?')) return envelope({ hasAutomaticDecisions: false, attempts: 0, failures: 0 });
    if (String(url).includes('/log?')) return envelope({ entries: [] });
    if (String(url).endsWith('/config')) return envelope({ url: '', model: '', apiKeySet: false, httpApprovedUrl: '', effectiveUrl: 'https://api.typesafe.ai' });
    throw new Error(`Unexpected URL ${url}`);
  };
  const view = render(React.createElement(Panel, { sessionId: 'trend-normal', t: translate }));
  const button = view.getByRole('button', { name: /决策层/ });
  await waitFor(() => assert.ok(button.className.includes('decision-trend-normal')));
  assert.equal(button.getAttribute('title'), null, 'normal state has no alarm tooltip');
});

test('completion log entry shows three-state tally and result', async () => {
  globalThis.fetch = async url => {
    if (String(url).includes('/session?')) return envelope({ enabled: true });
    if (String(url).includes('/metrics?')) return envelope({ hasAutomaticDecisions: true, attempts: 1, failures: 0,
      complete: { attempts: 1, failures: 0, satisfied: 1, unsatisfied: 1, insufficient: 0, steered: 0 } });
    if (String(url).includes('/logs?')) return envelope({ totalDecisions: 1, annotations: { rated: 0, good: 0, bad: 0, unsure: 0 }, ratings: {}, trendBacktest: { warnHits: 0, severeHits: 0, maxRun: 0 } });
    if (String(url).includes('/log?')) return envelope({ entries: [
      { id: 'k1', at: 1_700_000_004_000, kind: 'complete', outcome: 'unsatisfied', conditions: 2, satisfied: 1, unsatisfied: 1, insufficient: 0 },
    ] });
    if (String(url).endsWith('/config')) return envelope({ url: '', model: '', apiKeySet: false, httpApprovedUrl: '', effectiveUrl: 'https://api.typesafe.ai' });
    throw new Error(`Unexpected URL ${url}`);
  };
  const view = render(React.createElement(Panel, { sessionId: 'complete-log', t: translate }));
  fireEvent.click(view.getByRole('button', { name: /决策层/ }));
  // the completion metric card renders (there is both a card title and a log label)
  await view.findByText('满足');
  const row = (await view.findByText(/有未满足/)).closest('li');
  assert.match(row.textContent, /条件 2/);
  assert.match(row.textContent, /未满足 1/);
});

test('a decision log row can be rated and the rating posts to /annotate', async () => {
  let annotateBody;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/session?')) return envelope({ enabled: true });
    if (String(url).includes('/metrics?')) return envelope({ hasAutomaticDecisions: true, attempts: 1, failures: 0,
      gate: { attempts: 1, failures: 0, allow: 0, ask: 0, deny: 1, actual: { allow: 0, deny: 1, error: 0 } } });
    if (String(url).includes('/logs?')) return envelope({ totalDecisions: 1, annotations: { rated: 0, good: 0, bad: 0, unsure: 0 }, ratings: {}, trendBacktest: { warnHits: 0, severeHits: 0, maxRun: 0 } });
    if (String(url).includes('/log?')) return envelope({ entries: [
      { id: 'dec-1', at: 1_700_000_010_000, kind: 'gate', outcome: 'deny', tool: 'bash', action: 'deny' },
    ] });
    if (String(url).endsWith('/annotate') && init?.method === 'POST') { annotateBody = JSON.parse(init.body); return envelope({ ok: true, target: annotateBody.target, rating: annotateBody.rating }); }
    if (String(url).endsWith('/config')) return envelope({ url: '', model: '', apiKeySet: false, httpApprovedUrl: '', effectiveUrl: 'https://api.typesafe.ai' });
    throw new Error(`Unexpected URL ${url}`);
  };
  const view = render(React.createElement(Panel, { sessionId: 'rate-me', t: translate }));
  fireEvent.click(view.getByRole('button', { name: /决策层/ }));
  const good = await view.findByRole('button', { name: '判对了' });
  fireEvent.click(good);
  await waitFor(() => assert.equal(annotateBody?.rating, 'good'));
  assert.equal(annotateBody.target, 'dec-1', 'the decision id is the annotation target');
  assert.equal(annotateBody.sessionId, 'rate-me');
  await waitFor(() => assert.equal(view.getByRole('button', { name: '判对了' }).getAttribute('aria-pressed'), 'true'));
});

test('persisted ratings from /logs pre-fill the rating state on open', async () => {
  globalThis.fetch = async url => {
    if (String(url).includes('/session?')) return envelope({ enabled: true });
    if (String(url).includes('/metrics?')) return envelope({ hasAutomaticDecisions: true, attempts: 1, failures: 0,
      gate: { attempts: 1, failures: 0, allow: 0, ask: 0, deny: 1, actual: { allow: 0, deny: 1, error: 0 } } });
    if (String(url).includes('/logs?')) return envelope({ totalDecisions: 1, annotations: { rated: 1, good: 0, bad: 1, unsure: 0 }, ratings: { 'dec-9': 'bad' }, trendBacktest: { warnHits: 0, severeHits: 0, maxRun: 0 } });
    if (String(url).includes('/log?')) return envelope({ entries: [
      { id: 'dec-9', at: 1_700_000_011_000, kind: 'gate', outcome: 'deny', tool: 'bash', action: 'deny' },
    ] });
    if (String(url).endsWith('/config')) return envelope({ url: '', model: '', apiKeySet: false, httpApprovedUrl: '', effectiveUrl: 'https://api.typesafe.ai' });
    throw new Error(`Unexpected URL ${url}`);
  };
  const view = render(React.createElement(Panel, { sessionId: 'prefilled', t: translate }));
  fireEvent.click(view.getByRole('button', { name: /决策层/ }));
  await waitFor(() => assert.equal(view.getByRole('button', { name: '判错了' }).getAttribute('aria-pressed'), 'true'));
  // the rated-count summary lives in the analysis tab, not the dock modal
  assert.equal(view.queryByText(/已标注/), null, 'the modal no longer shows the annotation summary');
});

test('a failed re-rate rolls back to the previous rating instead of erasing it', async () => {
  // The row starts persisted as good; the user re-rates it bad and the POST
  // fails. The row must revert to good (its prior value), not become unrated.
  let failNext = false;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/session?')) return envelope({ enabled: true });
    if (String(url).includes('/metrics?')) return envelope({ hasAutomaticDecisions: true, attempts: 1, failures: 0,
      gate: { attempts: 1, failures: 0, allow: 0, ask: 0, deny: 1, actual: { allow: 0, deny: 1, error: 0 } } });
    if (String(url).includes('/logs?')) return envelope({ totalDecisions: 1, annotations: { rated: 1, good: 1, bad: 0, unsure: 0 }, ratings: { 'dec-2': 'good' }, trendBacktest: { warnHits: 0, severeHits: 0, maxRun: 0 } });
    if (String(url).includes('/log?')) return envelope({ entries: [
      { id: 'dec-2', at: 1_700_000_012_000, kind: 'gate', outcome: 'deny', tool: 'bash', action: 'deny' },
    ] });
    if (String(url).endsWith('/annotate') && init?.method === 'POST') {
      if (failNext) return new Response(JSON.stringify({ ok: false, error: 'boom' }), { status: 500, headers: { 'content-type': 'application/json' } });
      return envelope({ ok: true });
    }
    if (String(url).endsWith('/config')) return envelope({ url: '', model: '', apiKeySet: false, httpApprovedUrl: '', effectiveUrl: 'https://api.typesafe.ai' });
    throw new Error(`Unexpected URL ${url}`);
  };
  const view = render(React.createElement(Panel, { sessionId: 'rollback', t: translate }));
  fireEvent.click(view.getByRole('button', { name: /决策层/ }));
  // seeded as good
  await waitFor(() => assert.equal(view.getByRole('button', { name: '判对了' }).getAttribute('aria-pressed'), 'true'));
  // re-rate to bad, but make the write fail
  failNext = true;
  fireEvent.click(view.getByRole('button', { name: '判错了' }));
  // after the failed write it reverts to good, not unrated
  await waitFor(() => assert.equal(view.getByRole('button', { name: '判对了' }).getAttribute('aria-pressed'), 'true'));
  assert.equal(view.getByRole('button', { name: '判错了' }).getAttribute('aria-pressed'), 'false', 'the failed rating is not left applied');
});

test('advanced save posts keep prefixes split on commas or newlines and leaves the backend url alone', async () => {
  let savedBody;
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/config') && init?.method === 'PUT') { savedBody = JSON.parse(init.body); return envelope({ url: 'https://saved.test', model: 'jev-latest', apiKeySet: false, httpApprovedUrl: '', effectiveUrl: 'https://saved.test', narrowSettings: { mode: 'enforce', keepPrefixes: savedBody.narrowSettings.keepPrefixes } }); }
    if (String(url).endsWith('/config')) return envelope({ url: 'https://saved.test', model: 'jev-latest', apiKeySet: false, httpApprovedUrl: '', effectiveUrl: 'https://saved.test', narrowSettings: { mode: 'enforce', keepPrefixes: ['mcp__openviking'] } });
    throw new Error(`Unexpected URL ${url}`);
  };
  const view = render(React.createElement(ConfigForm, { t: translate }));
  const box = await view.findByPlaceholderText('mcp__openviking');
  fireEvent.change(box, { target: { value: 'mcp__openviking, mcp__git\nmcp__openviking' } });
  fireEvent.click(view.getByRole('button', { name: '保存高级配置' }));
  await waitFor(() => assert.deepEqual(savedBody?.narrowSettings?.keepPrefixes, ['mcp__openviking', 'mcp__git']));
  assert.equal(savedBody.url, undefined, 'advanced save must omit the backend url');
  assert.equal(savedBody.apiKey, undefined, 'advanced save must omit the api key');
});

test('advanced save posts the configured candidate cap', async () => {
  let savedBody;
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/config') && init?.method === 'PUT') { savedBody = JSON.parse(init.body); return envelope({ url: '', model: '', apiKeySet: false, httpApprovedUrl: '', effectiveUrl: 'https://api.typesafe.ai', narrowSettings: { mode: 'enforce', maxCandidates: savedBody.narrowSettings.maxCandidates } }); }
    if (String(url).endsWith('/config')) return envelope({ url: '', model: '', apiKeySet: false, httpApprovedUrl: '', effectiveUrl: 'https://api.typesafe.ai', narrowSettings: { mode: 'enforce', maxCandidates: 20 } });
    throw new Error(`Unexpected URL ${url}`);
  };
  const view = render(React.createElement(ConfigForm, { t: translate }));
  const cap = await view.findByPlaceholderText('20');
  fireEvent.change(cap, { target: { value: '50' } });
  fireEvent.click(view.getByRole('button', { name: '保存高级配置' }));
  await waitFor(() => assert.equal(savedBody?.narrowSettings?.maxCandidates, 50, 'the configured cap is posted'));
});

test('advanced save posts the configured drop threshold clamped to [0,1]', async () => {
  let savedBody;
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/config') && init?.method === 'PUT') { savedBody = JSON.parse(init.body); return envelope({ url: '', model: '', apiKeySet: false, httpApprovedUrl: '', effectiveUrl: 'https://api.typesafe.ai', narrowSettings: { mode: 'enforce', threshold: savedBody.narrowSettings.threshold } }); }
    if (String(url).endsWith('/config')) return envelope({ url: '', model: '', apiKeySet: false, httpApprovedUrl: '', effectiveUrl: 'https://api.typesafe.ai', narrowSettings: { mode: 'enforce', threshold: 0.7 } });
    throw new Error(`Unexpected URL ${url}`);
  };
  const view = render(React.createElement(ConfigForm, { t: translate }));
  const box = await view.findByPlaceholderText('0.7');
  fireEvent.change(box, { target: { value: '0.2' } });
  fireEvent.click(view.getByRole('button', { name: '保存高级配置' }));
  await waitFor(() => assert.equal(savedBody?.narrowSettings?.threshold, 0.2, 'the configured threshold is posted'));
});

test('advanced save button is disabled until an advanced field changes', async () => {
  globalThis.fetch = async url => {
    if (String(url).endsWith('/config')) return envelope({ url: '', model: '', apiKeySet: false, httpApprovedUrl: '', effectiveUrl: 'https://api.typesafe.ai', narrowSettings: { mode: 'enforce', keepPrefixes: ['mcp__openviking'] } });
    throw new Error(`Unexpected URL ${url}`);
  };
  const view = render(React.createElement(ConfigForm, { t: translate }));
  const saveAdvanced = await view.findByRole('button', { name: '保存高级配置' });
  assert.equal(saveAdvanced.disabled, true, 'nothing changed yet');
  // the basic feature switches save immediately and no longer arm the advanced
  // save; an actual advanced field (the self-check steer toggle) does.
  fireEvent.click(view.getByRole('checkbox', { name: '得分偏低时自动补一轮' }));
  assert.equal(view.getByRole('button', { name: '保存高级配置' }).disabled, false, 'an advanced change enables the advanced save');
});

test('delete key is a dedicated button that clears the saved key after confirmation', async () => {
  let putBody;
  const view = (() => {
    globalThis.window.confirm = () => true;
    globalThis.fetch = async (url, init) => {
      if (String(url).endsWith('/config') && init?.method === 'PUT') { putBody = JSON.parse(init.body); return envelope({ url: '', model: '', apiKeySet: false, httpApprovedUrl: '', effectiveUrl: 'https://api.typesafe.ai' }); }
      if (String(url).endsWith('/config')) return envelope({ url: '', model: '', apiKeySet: true, httpApprovedUrl: '', effectiveUrl: 'https://api.typesafe.ai', checkSettings: { mode: 'observe', lowScoreThreshold: 1 } });
      throw new Error(`Unexpected URL ${url}`);
    };
    return render(React.createElement(ConfigForm, { t: translate }));
  })();
  const button = await view.findByRole('button', { name: '删除' });
  assert.equal(view.queryByRole('checkbox', { name: '删除已保存的 Key' }), null, 'delete must not be a toggle');
  fireEvent.click(button);
  await waitFor(() => assert.deepEqual(putBody, { apiKey: '' }));
  await view.findByText('已删除保存的 Key');
});

test('delete key is not offered when no key is saved', async () => {
  globalThis.fetch = async url => {
    if (String(url).endsWith('/config')) return envelope({ url: '', model: '', apiKeySet: false, httpApprovedUrl: '', effectiveUrl: 'https://api.typesafe.ai', checkSettings: { mode: 'observe', lowScoreThreshold: 1 } });
    throw new Error(`Unexpected URL ${url}`);
  };
  const view = render(React.createElement(ConfigForm, { t: translate }));
  await view.findByLabelText('服务地址');
  assert.equal(view.queryByRole('button', { name: '删除' }), null);
});

test('analysis view renders the profile, trend backtest, and accuracy summary from /logs', async () => {
  globalThis.fetch = async url => {
    if (String(url).includes('/session?')) return envelope({ enabled: true });
    if (String(url).includes('/logs?')) return envelope({ totalDecisions: 3,
      annotations: { rated: 2, good: 1, bad: 1, unsure: 0 }, ratings: { 'a-1': 'good', 'a-2': 'bad' },
      trendBacktest: { warnHits: 1, severeHits: 0, maxRun: 3 },
      profile: {
        gate: { attempts: 2, allow: 1, ask: 0, deny: 1, error: 0 },
        check: { attempts: 1, ok: 0, low: 1, error: 0, scoreSum: 1, scoreCount: 1, confidence: {} },
        narrow: { attempts: 0, applied: 0, error: 0, droppedSum: 0, tooManyCandidates: 0 },
        complete: { attempts: 0, satisfied: 0, unsatisfied: 0, insufficient: 0, error: 0, steered: 0 },
      } });
    if (String(url).includes('/logrows?')) return envelope({ entries: [
      { id: 'a-1', at: 1_700_000_020_000, kind: 'gate', outcome: 'deny', tool: 'bash', action: 'deny' },
      { id: 'a-2', at: 1_700_000_021_000, kind: 'check', outcome: 'low', score: 0 },
    ], total: 2, page: 1, pageSize: 100, pages: 1 });
    throw new Error(`Unexpected URL ${url}`);
  };
  const view = render(React.createElement(AnalysisView, { sessionId: 'an-1', t: translate }));
  await view.findByText('过程画像');
  // gate profile card shows the deny count and its share of the total (1/2 = 50%)
  const gateCard = (await view.findByText('危险门控')).closest('article');
  assert.match(gateCard.textContent, /拒绝.*1/);
  assert.match(gateCard.textContent, /50%/);
  await view.findByText('质量趋势回测');
  // accuracy summary reflects the annotation counts, and the decision rows render
  await view.findByText(/已标注 2 条/);
  const denyRow = (await view.findByText(/已拒绝/)).closest('li');
  // the persisted rating pre-fills the deny row's "correct" button pressed state
  await waitFor(() => assert.equal(denyRow.querySelector('.decision-rate-good').getAttribute('aria-pressed'), 'true'));
});

test('analysis view rates a decision row through the shared /annotate route', async () => {
  let annotateBody;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/session?')) return envelope({ enabled: true });
    if (String(url).includes('/logs?')) return envelope({ totalDecisions: 1,
      annotations: { rated: 0, good: 0, bad: 0, unsure: 0 }, ratings: {},
      trendBacktest: { warnHits: 0, severeHits: 0, maxRun: 0 },
      profile: { gate: { attempts: 1, allow: 0, ask: 0, deny: 1, error: 0 }, check: { attempts: 0, ok: 0, low: 0, error: 0, scoreSum: 0, scoreCount: 0, confidence: {} }, narrow: { attempts: 0, applied: 0, error: 0, droppedSum: 0, tooManyCandidates: 0 }, complete: { attempts: 0, satisfied: 0, unsatisfied: 0, insufficient: 0, error: 0, steered: 0 } } });
    if (String(url).includes('/logrows?')) return envelope({ entries: [
      { id: 'row-1', at: 1_700_000_030_000, kind: 'gate', outcome: 'deny', tool: 'bash', action: 'deny' },
    ], total: 1, page: 1, pageSize: 100, pages: 1 });
    if (String(url).endsWith('/annotate') && init?.method === 'POST') { annotateBody = JSON.parse(init.body); return envelope({ ok: true, target: annotateBody.target, rating: annotateBody.rating }); }
    throw new Error(`Unexpected URL ${url}`);
  };
  const view = render(React.createElement(AnalysisView, { sessionId: 'an-rate', t: translate }));
  const bad = await view.findByRole('button', { name: '判错了' });
  fireEvent.click(bad);
  await waitFor(() => assert.equal(annotateBody?.rating, 'bad'));
  assert.equal(annotateBody.target, 'row-1', 'the decision id is the annotation target');
  assert.equal(annotateBody.sessionId, 'an-rate', 'the analysis tab posts the same session id');
});

test('analysis view shows the empty state when there are no decisions', async () => {
  globalThis.fetch = async url => {
    if (String(url).includes('/session?')) return envelope({ enabled: true });
    if (String(url).includes('/logs?')) return envelope({ totalDecisions: 0, annotations: { rated: 0, good: 0, bad: 0, unsure: 0 }, ratings: {}, trendBacktest: { warnHits: 0, severeHits: 0, maxRun: 0 } });
    if (String(url).includes('/logrows?')) return envelope({ entries: [], total: 0, page: 1, pageSize: 100, pages: 1 });
    throw new Error(`Unexpected URL ${url}`);
  };
  const view = render(React.createElement(AnalysisView, { sessionId: 'an-empty', t: translate }));
  await view.findByText('本会话尚无决策记录。');
  assert.equal(view.queryByText('过程画像'), null, 'no profile section without decisions');
});

test('analysis view paginates the decision log and shares the page scroll', async () => {
  const pageSizes = [];
  const requested = [];
  globalThis.fetch = async url => {
    const s = String(url);
    if (s.includes('/session?')) return envelope({ enabled: true });
    if (s.includes('/logs?')) return envelope({ totalDecisions: 150,
      annotations: { rated: 0, good: 0, bad: 0, unsure: 0 }, ratings: {},
      trendBacktest: { warnHits: 0, severeHits: 0, maxRun: 0 },
      profile: { gate: { attempts: 150, allow: 0, ask: 0, deny: 150, error: 0 }, check: { attempts: 0, ok: 0, low: 0, error: 0, scoreSum: 0, scoreCount: 0, confidence: {} }, narrow: { attempts: 0, applied: 0, error: 0, droppedSum: 0, tooManyCandidates: 0 }, complete: { attempts: 0, satisfied: 0, unsatisfied: 0, insufficient: 0, error: 0, steered: 0 } } });
    if (s.includes('/logrows?')) {
      const page = Number(new URL(s, 'http://x').searchParams.get('page'));
      requested.push(page);
      pageSizes.push(new URL(s, 'http://x').searchParams.get('pageSize'));
      return envelope({ entries: [{ id: `p${page}`, at: 1_700_000_000_000 + page, kind: 'gate', outcome: 'deny', tool: 'bash', action: 'deny' }],
        total: 150, page, pageSize: 100, pages: 2 });
    }
    throw new Error(`Unexpected URL ${url}`);
  };
  const view = render(React.createElement(AnalysisView, { sessionId: 'pg-1', t: translate }));
  // first page requested at size 100, pager visible with 2 pages
  await view.findByText(/第 1\/2 页 · 共 150 条/);
  assert.equal(pageSizes[0], '100');
  assert.deepEqual(requested, [1]);
  // the analysis log shares the page scroll (no inner max-height scroll container)
  const list = view.container.querySelector('.decision-analysis .decision-log');
  assert.ok(list, 'the log list renders inside the analysis region');
  // Next advances to page 2 and refetches
  fireEvent.click(await view.findByRole('button', { name: '下一页' }));
  await view.findByText(/第 2\/2 页 · 共 150 条/);
  assert.deepEqual(requested, [1, 2], 'clicking next fetches page 2');
  // on the last page, Next is disabled
  assert.equal((await view.findByRole('button', { name: '下一页' })).disabled, true);
});

test('analysis view filters the persisted log to low self-check scores', async () => {
  const requested = [];
  globalThis.fetch = async url => {
    const s = String(url);
    if (s.includes('/session?')) return envelope({ enabled: true });
    if (s.includes('/logs?')) return envelope({ totalDecisions: 3,
      annotations: { rated: 0, good: 0, bad: 0, unsure: 0 }, ratings: {},
      trendBacktest: { warnHits: 0, severeHits: 0, maxRun: 0 },
      profile: { gate: { attempts: 1, allow: 0, ask: 0, deny: 1, error: 0 },
        check: { attempts: 2, ok: 1, low: 1, error: 0, scoreSum: 2, scoreCount: 2, confidence: {} },
        narrow: { attempts: 0, applied: 0, error: 0, droppedSum: 0, tooManyCandidates: 0 },
        complete: { attempts: 0, satisfied: 0, unsatisfied: 0, insufficient: 0, error: 0, steered: 0 } } });
    if (s.includes('/logrows?')) {
      requested.push(s);
      const lowOnly = new URL(s, 'http://x').searchParams.get('lowOnly') === '1';
      const entries = lowOnly
        ? [{ id: 'low-1', at: 1_700_000_003_000, kind: 'check', outcome: 'low', score: 0.41, confidence: 0.29, lowConfidence: true, task: '补上', turn: 22 }]
        : [
            { id: 'gate-1', at: 1_700_000_001_000, kind: 'gate', outcome: 'allow', tool: 'read', action: 'pass' },
            { id: 'check-1', at: 1_700_000_002_000, kind: 'check', outcome: 'ok', score: 2, confidence: 0.9 },
            { id: 'low-1', at: 1_700_000_003_000, kind: 'check', outcome: 'low', score: 0.41, confidence: 0.29, lowConfidence: true, task: '补上', turn: 22 },
          ];
      return envelope({ entries, total: entries.length, page: 1, pageSize: 100, pages: 1 });
    }
    throw new Error(`Unexpected URL ${s}`);
  };
  const view = render(React.createElement(AnalysisView, { sessionId: 'filter-1', t: translate }));
  const filter = view.getByRole('button', { name: /只看低评分/ });
  await waitFor(() => assert.equal(filter.disabled, false));
  assert.equal(filter.getAttribute('aria-pressed'), 'false');
  assert.equal(requested.at(-1).includes('lowOnly=1'), false, 'the default view shows every decision');
  // Turning the filter on asks the server for the low rows only and resets paging.
  fireEvent.click(filter);
  await waitFor(() => assert.equal(filter.getAttribute('aria-pressed'), 'true'));
  await waitFor(() => assert.equal(requested.at(-1).includes('lowOnly=1'), true));
  const lowRow = (await view.findByText(/噪声，可忽略/)).closest('li');
  assert.match(lowRow.textContent, /低评分/);
  assert.match(lowRow.textContent, /「补上」/);
  assert.equal(view.queryByText(/未干预/), null, 'only the low row is rendered');
  // Turning it off restores the full log.
  fireEvent.click(filter);
  await waitFor(() => assert.equal(requested.at(-1).includes('lowOnly=1'), false));
  await view.findByText(/未干预/);
});

test('analysis view disables the low filter when the session has no low scores', async () => {
  globalThis.fetch = async url => {
    const s = String(url);
    if (s.includes('/session?')) return envelope({ enabled: true });
    if (s.includes('/logs?')) return envelope({ totalDecisions: 1,
      annotations: { rated: 0, good: 0, bad: 0, unsure: 0 }, ratings: {},
      trendBacktest: { warnHits: 0, severeHits: 0, maxRun: 0 },
      profile: { gate: { attempts: 1, allow: 1, ask: 0, deny: 0, error: 0 },
        check: { attempts: 0, ok: 0, low: 0, error: 0, scoreSum: 0, scoreCount: 0, confidence: {} },
        narrow: { attempts: 0, applied: 0, error: 0, droppedSum: 0, tooManyCandidates: 0 },
        complete: { attempts: 0, satisfied: 0, unsatisfied: 0, insufficient: 0, error: 0, steered: 0 } } });
    if (s.includes('/logrows?')) return envelope({ entries: [], total: 0, page: 1, pageSize: 100, pages: 1 });
    throw new Error(`Unexpected URL ${s}`);
  };
  const view = render(React.createElement(AnalysisView, { sessionId: 'filter-empty', t: translate }));
  const filter = await view.findByRole('button', { name: /只看低评分/ });
  assert.equal(filter.disabled, true, 'no low score = no filter to offer');
});

test('analysis view enables this session\'s decisions from the header control', async () => {
  let putBody;
  globalThis.fetch = async (url, init) => {
    const s = String(url);
    if (s.includes('/session?')) return envelope({ enabled: false });
    if (s.endsWith('/session') && init?.method === 'PUT') {
      putBody = JSON.parse(init.body);
      return envelope({ enabled: putBody.enabled });
    }
    if (s.includes('/logs?')) return envelope({ totalDecisions: 0, annotations: { rated: 0, good: 0, bad: 0, unsure: 0 }, ratings: {}, trendBacktest: { warnHits: 0, severeHits: 0, maxRun: 0 } });
    if (s.includes('/logrows?')) return envelope({ entries: [], total: 0, page: 1, pageSize: 100, pages: 1 });
    throw new Error(`Unexpected URL ${s}`);
  };
  const view = render(React.createElement(AnalysisView, { sessionId: 'an-toggle', t: translate }));
  const changes = [];
  const record = event => changes.push(event.detail);
  window.addEventListener('dsh-decision-layer:session-enabled', record);
  const toggle = await view.findByRole('button', { name: /本会话自动介入/ });
  await waitFor(() => assert.equal(toggle.getAttribute('aria-pressed'), 'false'));
  // with decisions off and no history, the empty state explains why nothing new appears
  await view.findByText('本会话的自动介入已关闭。开启后，新的回合才会产生决策记录。');
  fireEvent.click(toggle);
  await waitFor(() => assert.deepEqual(putBody, { sessionId: 'an-toggle', enabled: true }));
  await waitFor(() => assert.equal(toggle.getAttribute('aria-pressed'), 'true'));
  assert.match(toggle.textContent, /本会话自动介入.*已开启/);
  // the confirmed write is broadcast so the dock panel's master switch follows
  assert.deepEqual(changes.at(-1), { sessionId: 'an-toggle', enabled: true });
  // and a change made in the dock panel updates this tab's control
  window.dispatchEvent(new window.CustomEvent('dsh-decision-layer:session-enabled', { detail: { sessionId: 'an-toggle', enabled: false } }));
  await waitFor(() => assert.equal(toggle.getAttribute('aria-pressed'), 'false'));
  window.removeEventListener('dsh-decision-layer:session-enabled', record);
});

test('analysis view offers a retry when the session read fails', async () => {
  let reads = 0;
  globalThis.fetch = async url => {
    const s = String(url);
    if (s.includes('/session?')) {
      reads += 1;
      if (reads === 1) throw new Error('offline');
      return envelope({ enabled: false });
    }
    if (s.includes('/logs?')) return envelope({ totalDecisions: 0, annotations: { rated: 0, good: 0, bad: 0, unsure: 0 }, ratings: {}, trendBacktest: { warnHits: 0, severeHits: 0, maxRun: 0 } });
    if (s.includes('/logrows?')) return envelope({ entries: [], total: 0, page: 1, pageSize: 100, pages: 1 });
    throw new Error(`Unexpected URL ${s}`);
  };
  const view = render(React.createElement(AnalysisView, { sessionId: 'an-read-fail', t: translate }));
  const toggle = await view.findByRole('button', { name: /本会话自动介入/ });
  await waitFor(() => assert.match(toggle.textContent, /不可用/));
  assert.equal(toggle.disabled, false, 'a failed read leaves the control clickable so it can retry');
  fireEvent.click(toggle);
  await waitFor(() => assert.equal(toggle.getAttribute('aria-pressed'), 'false'));
  assert.match(toggle.textContent, /已关闭/);
});

test('analysis view reports a failed toggle and clears the error after a successful retry', async () => {
  let writes = 0;
  globalThis.fetch = async (url, init) => {
    const s = String(url);
    if (s.includes('/session?')) return envelope({ enabled: false });
    if (s.endsWith('/session') && init?.method === 'PUT') {
      writes += 1;
      if (writes === 1) throw new Error('offline');
      return envelope({ enabled: true });
    }
    if (s.includes('/logs?')) return envelope({ totalDecisions: 0, annotations: { rated: 0, good: 0, bad: 0, unsure: 0 }, ratings: {}, trendBacktest: { warnHits: 0, severeHits: 0, maxRun: 0 } });
    if (s.includes('/logrows?')) return envelope({ entries: [], total: 0, page: 1, pageSize: 100, pages: 1 });
    throw new Error(`Unexpected URL ${s}`);
  };
  const view = render(React.createElement(AnalysisView, { sessionId: 'an-write-fail', t: translate }));
  const toggle = await view.findByRole('button', { name: /本会话自动介入/ });
  await waitFor(() => assert.equal(toggle.getAttribute('aria-pressed'), 'false'));
  fireEvent.click(toggle);
  await view.findByText('操作失败，请重试。');
  assert.equal(toggle.getAttribute('aria-pressed'), 'false', 'a failed write leaves the control on its previous state');
  fireEvent.click(toggle);
  await waitFor(() => assert.equal(toggle.getAttribute('aria-pressed'), 'true'));
  assert.equal(view.queryByText('操作失败，请重试。'), null, 'a successful write clears the stale error');
});

test('analysis view ignores a late session toggle after switching sessions', async () => {
  let resolveWrite;
  globalThis.fetch = async (url, init) => {
    const s = String(url);
    if (s.includes('/session?')) return envelope({ enabled: s.includes('two') });
    if (s.endsWith('/session') && init?.method === 'PUT') return new Promise(resolve => { resolveWrite = resolve; });
    if (s.includes('/logs?')) return envelope({ totalDecisions: 0, annotations: { rated: 0, good: 0, bad: 0, unsure: 0 }, ratings: {}, trendBacktest: { warnHits: 0, severeHits: 0, maxRun: 0 } });
    if (s.includes('/logrows?')) return envelope({ entries: [], total: 0, page: 1, pageSize: 100, pages: 1 });
    throw new Error(`Unexpected URL ${s}`);
  };
  const view = render(React.createElement(AnalysisView, { sessionId: 'one', t: translate }));
  const toggle = await view.findByRole('button', { name: /本会话自动介入/ });
  await waitFor(() => assert.equal(toggle.getAttribute('aria-pressed'), 'false'));
  fireEvent.click(toggle);
  view.rerender(React.createElement(AnalysisView, { sessionId: 'two', t: translate }));
  await waitFor(() => assert.equal(toggle.getAttribute('aria-pressed'), 'true'));
  assert.ok(resolveWrite, 'the old session write is in flight');
  resolveWrite(envelope({ enabled: false }));
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(toggle.getAttribute('aria-pressed'), 'true', 'a late old-session write must not flip the new session');
});

test('advanced save posts every intervention threshold, the rubric, and the batch mode', async () => {
  let savedBody;
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/config') && init?.method === 'PUT') { savedBody = JSON.parse(init.body); return envelope({ url: '', model: '', apiKeySet: false, httpApprovedUrl: '', effectiveUrl: 'https://api.typesafe.ai' }); }
    if (String(url).endsWith('/config')) return envelope({ url: '', model: '', apiKeySet: false, httpApprovedUrl: '', effectiveUrl: 'https://api.typesafe.ai' });
    throw new Error(`Unexpected URL ${url}`);
  };
  const view = render(React.createElement(ConfigForm, { t: translate }));
  fireEvent.change(await view.findByLabelText(/^门控拦截置信度/), { target: { value: '0.55' } });
  fireEvent.click(view.getByRole('button', { name: '保存高级配置' }));
  await waitFor(() => assert.equal(savedBody?.gateSettings?.minConfidence, 0.55));
  // The server replaces each settings object wholesale, so every field the form
  // does not edit must still be posted with its effective value or it is lost.
  assert.equal(savedBody.checkSettings.minConfidence, 0.4);
  assert.equal(savedBody.checkSettings.trendMinConfidence, 0.6);
  assert.equal(savedBody.checkSettings.trendRun, 3);
  assert.equal(savedBody.checkSettings.trendSevereRun, 5);
  assert.equal(savedBody.checkSettings.lowScoreThreshold, 1);
  assert.equal(savedBody.checkSettings.rubric.length, 3);
  assert.equal(savedBody.narrowSettings.batchMode, 'auto');
  assert.equal(savedBody.completeSettings.minConfidence, 0.4);
  assert.equal(savedBody.completeSettings.minConditions, 2);
});

test('advanced fields reflect the saved thresholds, rubric, and batch mode', async () => {
  globalThis.fetch = async url => {
    if (String(url).endsWith('/config')) return envelope({ url: '', model: '', apiKeySet: false, httpApprovedUrl: '', effectiveUrl: 'https://api.typesafe.ai',
      gateSettings: { minConfidence: 0.5 },
      checkSettings: { mode: 'steer', minConfidence: 0.3, trendRun: 2, trendSevereRun: 4, rubric: ['差', '中', '好'] },
      narrowSettings: { mode: 'enforce', batchMode: 'split' },
      completeSettings: { mode: 'steer', minConditions: 4 } });
    throw new Error(`Unexpected URL ${url}`);
  };
  const view = render(React.createElement(ConfigForm, { t: translate }));
  assert.equal((await view.findByLabelText(/^门控拦截置信度/)).value, '0.5');
  assert.equal(view.getByLabelText(/^自检补完置信度/).value, '0.3');
  assert.equal(view.getByLabelText(/^告警连续次数/).value, '2');
  assert.equal(view.getByLabelText(/^严重连续次数/).value, '4');
  assert.equal(view.getByLabelText(/^最少交付条件数/).value, '4');
  assert.equal(view.getByLabelText(/^分批策略/).value, 'split');
  assert.equal(view.getByLabelText(/^评分档位/).value, '差\n中\n好');
});

test('the severe run count is clamped above the warn count instead of being rejected', async () => {
  let savedBody;
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/config') && init?.method === 'PUT') { savedBody = JSON.parse(init.body); return envelope({ url: '', model: '', apiKeySet: false, httpApprovedUrl: '', effectiveUrl: 'https://api.typesafe.ai' }); }
    if (String(url).endsWith('/config')) return envelope({ url: '', model: '', apiKeySet: false, httpApprovedUrl: '', effectiveUrl: 'https://api.typesafe.ai' });
    throw new Error(`Unexpected URL ${url}`);
  };
  const view = render(React.createElement(ConfigForm, { t: translate }));
  fireEvent.change(await view.findByLabelText(/^告警连续次数/), { target: { value: '6' } });
  fireEvent.change(view.getByLabelText(/^严重连续次数/), { target: { value: '4' } });
  fireEvent.click(view.getByRole('button', { name: '保存高级配置' }));
  await waitFor(() => assert.equal(savedBody?.checkSettings?.trendSevereRun, 7, 'severe is pushed above the warn count'));
  assert.equal(savedBody.checkSettings.trendRun, 6);
});

// The load-bearing invariant: the server replaces each settings section
// wholesale, so an advanced save must carry every loaded value it does not edit.
// This starts from NON-default values on every field (the previous test started
// from an empty config, so "display loaded values, post the defaults" — the exact
// regression this guards — would still have passed).
test('advanced save preserves every loaded value it does not edit', async () => {
  let savedBody;
  const loaded = {
    url: '', model: '', apiKeySet: false, httpApprovedUrl: '', effectiveUrl: 'https://api.typesafe.ai',
    gateSettings: { minConfidence: 0.62 },
    checkSettings: { mode: 'steer', rubric: ['差', '中', '好', '优'], lowScoreThreshold: 2, minConfidence: 0.31,
      trendMinConfidence: 0.71, trendRun: 4, trendSevereRun: 6 },
    narrowSettings: { mode: 'observe', keepPrefixes: ['mcp__kept'], maxCandidates: 33, threshold: 0.42, batchMode: 'single' },
    completeSettings: { mode: 'steer', minConditions: 5, minConfidence: 0.27 },
    features: { gate: true, check: true, narrow: true, complete: true },
  };
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/config') && init?.method === 'PUT') { savedBody = JSON.parse(init.body); return envelope(loaded); }
    if (String(url).endsWith('/config')) return envelope(loaded);
    throw new Error(`Unexpected URL ${url}`);
  };
  const view = render(React.createElement(ConfigForm, { t: translate }));
  // change exactly one field, the gate floor
  fireEvent.change(await view.findByLabelText(/^门控拦截置信度/), { target: { value: '0.55' } });
  fireEvent.click(view.getByRole('button', { name: '保存高级配置' }));
  await waitFor(() => assert.equal(savedBody?.gateSettings?.minConfidence, 0.55));
  // every other loaded value must survive the save
  assert.deepEqual(savedBody.checkSettings, { mode: 'steer', rubric: ['差', '中', '好', '优'], lowScoreThreshold: 2,
    minConfidence: 0.31, trendMinConfidence: 0.71, trendRun: 4, trendSevereRun: 6 });
  assert.deepEqual(savedBody.narrowSettings, { mode: 'observe', keepPrefixes: ['mcp__kept'], maxCandidates: 33,
    threshold: 0.42, batchMode: 'single' });
  assert.deepEqual(savedBody.completeSettings, { mode: 'steer', minConditions: 5, minConfidence: 0.27 });
});

// The client's posted body must be accepted by the REAL service validators: a
// field-name drift between the halves (e.g. trendSevere vs trendSevereRun) would
// otherwise keep these client tests green while every save 400s in production.
test('the posted advanced body is accepted by the real config store and round-trips', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { saveConfig, resolveConfig } = await import('../lib/host/config-store.js');
  let savedBody;
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/config') && init?.method === 'PUT') { savedBody = JSON.parse(init.body); return envelope({ url: '', model: '', apiKeySet: false, httpApprovedUrl: '', effectiveUrl: 'https://api.typesafe.ai' }); }
    if (String(url).endsWith('/config')) return envelope({ url: '', model: '', apiKeySet: false, httpApprovedUrl: '', effectiveUrl: 'https://api.typesafe.ai' });
    throw new Error(`Unexpected URL ${url}`);
  };
  const view = render(React.createElement(ConfigForm, { t: translate }));
  fireEvent.change(await view.findByLabelText(/^严重连续次数/), { target: { value: '7' } });
  fireEvent.click(view.getByRole('checkbox', { name: '启用只读过程检查' }));
  fireEvent.click(view.getByRole('button', { name: '保存高级配置' }));
  await waitFor(() => assert.equal(savedBody?.checkSettings?.trendSevereRun, 7));
  await waitFor(() => assert.equal(savedBody?.checkpointSettings?.enabled, true));

  const dir = await mkdtemp(join(tmpdir(), 'decision-roundtrip-'));
  try {
    const file = join(dir, 'config.json');
    await saveConfig(savedBody, file);                     // must not throw
    const persisted = await resolveConfig({ path: file, env: {} });
    assert.equal(persisted.gateSettings.minConfidence, 0.6);
    assert.equal(persisted.checkSettings.trendSevereRun, 7);
    assert.equal(persisted.checkSettings.minConfidence, 0.4);
    assert.equal(persisted.checkSettings.rubric.length, 3);
    assert.equal(persisted.narrowSettings.batchMode, 'auto');
    assert.equal(persisted.completeSettings.minConfidence, 0.4);
    const { DEFAULT_CHECKPOINT_SETTINGS } = await import('../lib/host/checkpoint-review.js');
    assert.deepEqual(persisted.checkpointSettings, { ...DEFAULT_CHECKPOINT_SETTINGS, enabled: true },
      'the client defaults must equal the server defaults, not a drifting copy');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

// An invalid rubric is now refused with a specific message instead of being
// silently replaced by the defaults while reporting success.
test('an invalid rubric blocks the save and names the problem', async () => {
  globalThis.fetch = async url => {
    if (String(url).endsWith('/config')) return envelope({ url: '', model: '', apiKeySet: false, httpApprovedUrl: '', effectiveUrl: 'https://api.typesafe.ai' });
    throw new Error(`Unexpected URL ${url}`);
  };
  const view = render(React.createElement(ConfigForm, { t: translate }));
  const box = await view.findByLabelText(/^评分档位/);
  fireEvent.change(box, { target: { value: '只有一档' } });
  assert.ok(view.getByText('至少需要 2 档（每行一档）。'), 'the reason is shown inline');
  assert.equal(view.getByRole('button', { name: '保存高级配置' }).disabled, true, 'an invalid rubric blocks the save');
  fireEvent.change(box, { target: { value: `差\n${'x'.repeat(300)}` } });
  assert.ok(view.getByText('第 2 档超过 256 字，请精简后再保存。'), 'the offending level is named');
  assert.equal(view.getByRole('button', { name: '保存高级配置' }).disabled, true);
  fireEvent.change(box, { target: { value: '差\n中' } });
  assert.equal(view.getByRole('button', { name: '保存高级配置' }).disabled, false, 'a valid rubric re-enables the save');
});

// The dock entry sits in the same composer row as the official context meter,
// which renders nothing until the session has a context-pressure reading — so a
// fresh chat showed our trigger alone under the composer. The gate below mirrors
// the meter's predicate exactly; these tests pin the three states.
const panelFetch = () => {
  globalThis.fetch = async url => {
    if (String(url).includes('/session?')) return envelope({ enabled: true });
    if (String(url).includes('/metrics?')) return envelope({ hasAutomaticDecisions: false, attempts: 0, failures: 0 });
    if (String(url).includes('/log?')) return envelope({ entries: [] });
    throw new Error(`Unexpected URL ${url}`);
  };
};

test('the dock trigger stays hidden while the session has no context reading', async () => {
  panelFetch();
  const useProjection = () => undefined;
  const view = render(React.createElement(Panel, { sessionId: 'blank', t: translate, useProjection }));
  await waitFor(() => assert.equal(globalThis.fetch !== undefined, true));
  assert.equal(view.queryByRole('button', { name: /决策层/ }), null, 'a fresh chat shows nothing, like the official meter');
});

test('the dock trigger appears as soon as a context reading exists', async () => {
  panelFetch();
  const useProjection = () => ({ pressureTokens: 1200, contextWindow: 128000 });
  const view = render(React.createElement(Panel, { sessionId: 'started', t: translate, useProjection }));
  assert.ok(view.getByRole('button', { name: /决策层/ }), 'once the meter has data, our entry shows too');
});

test('a host without the projection reader keeps the trigger visible', async () => {
  panelFetch();
  const view = render(React.createElement(Panel, { sessionId: 'legacy', t: translate }));
  assert.ok(view.getByRole('button', { name: /决策层/ }), 'absence of the capability must not remove the entry point');
});

const baseConfig = { url: '', model: '', apiKeySet: false, httpApprovedUrl: '', effectiveUrl: 'https://configured.test' };
const emptyProfile = () => ({
  gate: { attempts: 0, allow: 0, ask: 0, deny: 0, error: 0 },
  check: { attempts: 0, ok: 0, low: 0, error: 0, scoreSum: 0, scoreCount: 0, confidence: {} },
  narrow: { attempts: 0, applied: 0, error: 0, droppedSum: 0, tooManyCandidates: 0 },
  complete: { attempts: 0, satisfied: 0, unsatisfied: 0, insufficient: 0, error: 0, steered: 0 },
});

function configFixture(initial = {}) {
  let config = { ...baseConfig, ...initial };
  const writes = [];
  globalThis.fetch = async (url, init) => {
    if (!String(url).endsWith('/config')) throw new Error(`Unexpected URL ${url}`);
    if (init?.method === 'PUT') {
      const body = JSON.parse(init.body);
      writes.push(body);
      config = { ...config, ...body };
    }
    return envelope(config);
  };
  return writes;
}

const openAdvanced = view => fireEvent.click(view.getByText('高级配置'));

test('checkpoint settings default off and disclose extra process evidence before opt-in', async () => {
  const writes = configFixture();
  const view = render(React.createElement(ConfigForm, { t: translate }));
  await waitFor(() => assert.equal(view.getByLabelText('服务地址').disabled, false));
  openAdvanced(view);
  const toggle = view.getByRole('checkbox', { name: '启用只读过程检查' });
  assert.equal(toggle.checked, false);
  assert.equal(view.getByLabelText('心跳步数', { exact: false }).value, '6');
  assert.equal(view.getByLabelText('连续失败阈值', { exact: false }).value, '3');
  assert.equal(view.getByLabelText('过程检查超时（毫秒）', { exact: false }).value, '1500');
  assert.match(view.getByText(/有界的脱敏过程证据/).textContent, /当前要求/);
  assert.match(view.getByText(/有界的脱敏过程证据/).textContent, /已配置.*端点/);
  assert.match(view.getByText(/有界的脱敏过程证据/).textContent, /不.*提示.*不.*限制/);
  assert.equal(writes.length, 0, 'reading defaults never implicitly enables or saves');
  fireEvent.click(toggle);
  fireEvent.change(view.getByLabelText('心跳步数', { exact: false }), { target: { value: '12' } });
  fireEvent.change(view.getByLabelText('连续失败阈值', { exact: false }), { target: { value: '4' } });
  fireEvent.change(view.getByLabelText('过程检查超时（毫秒）', { exact: false }), { target: { value: '800' } });
  fireEvent.click(view.getByRole('button', { name: '保存高级配置' }));
  await waitFor(() => assert.deepEqual(writes[0]?.checkpointSettings, { enabled: true, heartbeatSteps: 12, failureThreshold: 4, timeoutMs: 800 }));
  assert.equal(writes[0].features, undefined, 'checkpoint is a separate settings section');
  await waitFor(() => assert.equal(view.getByRole('button', { name: '保存高级配置' }).disabled, true));
  fireEvent.click(view.getByRole('checkbox', { name: '启用只读过程检查' }));
  fireEvent.click(view.getByRole('button', { name: '保存高级配置' }));
  await waitFor(() => assert.deepEqual(writes[1]?.checkpointSettings, { enabled: false, heartbeatSteps: 12, failureThreshold: 4, timeoutMs: 800 }));
  await waitFor(() => assert.equal(view.getByRole('checkbox', { name: '启用只读过程检查' }).checked, false));
});

test('other advanced and backend saves preserve the checkpoint section including unedited fields', async () => {
  const checkpointSettings = { enabled: true, heartbeatSteps: 22, failureThreshold: 5, timeoutMs: 950 };
  const writes = configFixture({ checkpointSettings });
  const view = render(React.createElement(ConfigForm, { t: translate }));
  await waitFor(() => assert.equal(view.getByLabelText('服务地址').disabled, false));
  openAdvanced(view);
  assert.equal(view.getByRole('checkbox', { name: '启用只读过程检查' }).checked, true);
  assert.equal(view.getByLabelText('心跳步数', { exact: false }).value, '22');
  fireEvent.click(view.getByRole('checkbox', { name: '得分偏低时自动补一轮' }));
  fireEvent.click(view.getByRole('button', { name: '保存高级配置' }));
  await waitFor(() => assert.deepEqual(writes[0]?.checkpointSettings, checkpointSettings));
  await waitFor(() => assert.equal(view.getByRole('button', { name: '保存高级配置' }).disabled, true));
  fireEvent.change(view.getByLabelText('模型'), { target: { value: 'changed-model' } });
  fireEvent.click(view.getByRole('button', { name: '保存配置' }));
  await waitFor(() => assert.equal(writes[1]?.model, 'changed-model'));
  assert.equal(writes[1].checkpointSettings, undefined, 'backend-only save must leave the stored section alone');
  await waitFor(() => assert.equal(view.getByRole('button', { name: '保存高级配置' }).disabled, true));
  fireEvent.click(view.getByRole('checkbox', { name: '有未满足条件时自动补一轮' }));
  fireEvent.click(view.getByRole('button', { name: '保存高级配置' }));
  await waitFor(() => assert.deepEqual(writes[2]?.checkpointSettings, checkpointSettings));
});

test('checkpoint numeric controls carry server bounds and blank drafts use defaults', async () => {
  const writes = configFixture({ checkpointSettings: { enabled: true, heartbeatSteps: 90, failureThreshold: 9, timeoutMs: 8000 } });
  const view = render(React.createElement(ConfigForm, { t: translate }));
  await waitFor(() => assert.equal(view.getByLabelText('服务地址').disabled, false));
  openAdvanced(view);
  for (const [label, min, max] of [['心跳步数', '2', '100'], ['连续失败阈值', '2', '10'], ['过程检查超时（毫秒）', '100', '10000']]) {
    const input = view.getByLabelText(label, { exact: false });
    assert.equal(input.min, min);
    assert.equal(input.max, max);
    fireEvent.change(input, { target: { value: '' } });
  }
  fireEvent.click(view.getByRole('button', { name: '保存高级配置' }));
  await waitFor(() => assert.deepEqual(writes[0]?.checkpointSettings, { enabled: true, heartbeatSteps: 6, failureThreshold: 3, timeoutMs: 1500 }));
});

function analysisFixture(profile, entries = [], totalDecisions = entries.length) {
  const writes = [];
  globalThis.fetch = async (url, init) => {
    const path = String(url);
    if (path.includes('/session?')) return envelope({ enabled: true });
    if (path.includes('/logs?')) return envelope({ totalDecisions, profile, annotations: { rated: 0, good: 0, bad: 0, unsure: 0 }, ratings: {}, trendBacktest: { warnHits: 0, severeHits: 0, maxRun: 0 } });
    if (path.includes('/logrows?')) return envelope({ entries, total: entries.length, page: 1, pageSize: 100, pages: 1 });
    if (path.endsWith('/annotate') && init?.method === 'POST') { writes.push(JSON.parse(init.body)); return envelope({ ok: true }); }
    throw new Error(`Unexpected URL ${url}`);
  };
  return writes;
}

test('checkpoint log uses fixed read-only outcomes and coordinates, supports annotation, and hides raw payloads', async () => {
  const entries = [
    ['ok', 'heartbeat'],
    ['concern', 'unresolved_failure'],
    ['uncertain', 'verification_after_change'],
    ['error', 'heartbeat'],
    ['skipped', 'heartbeat'],
    ['concern', 'heartbeat'],
  ].map(([outcome, trigger], index) => ({ id: `cp-${index}`, at: 1700000000000 + index, kind: 'checkpoint', outcome, trigger, mode: 'observe', turn: 2, step: index + 1, throughSeq: 40 + index, evidenceCount: 3, lowConfidence: index === 5,
    reason: 'UNTRUSTED_DIAGNOSIS', state: { secret: 'RAW_STATE' }, evidence: 'RAW_EVIDENCE', result: 'RAW_RESULT' }));
  const profile = { ...emptyProfile(), checkpoint: { attempts: 5, concern: 1, uncertain: 2, error: 1, skipped: 1 } };
  const writes = analysisFixture(profile, entries);
  const view = render(React.createElement(AnalysisView, { sessionId: 'checkpoint-log', t: translate }));
  await waitFor(() => assert.equal(view.container.querySelectorAll('.decision-log-item').length, 6));
  const rows = [...view.container.querySelectorAll('.decision-log-item')];
  assert.equal(rows.length, 6);
  const expectedResults = ['观察未见疑点', '观察到待复核信号', '判断不确定', '评估失败', '已跳过', '判断不确定'];
  for (const [index, row] of rows.entries()) {
    assert.match(row.textContent, new RegExp(expectedResults[index]));
    assert.match(row.textContent, /过程检查/);
    assert.match(row.textContent, /只读/);
    assert.match(row.textContent, new RegExp(`回合 2 · 第 ${index + 1} 步`));
    assert.match(row.textContent, new RegExp(`证据截至 #${40 + index}`));
    assert.doesNotMatch(row.textContent, /RAW_|UNTRUSTED_DIAGNOSIS|通过/);
  }
  assert.match(rows[0].textContent, /心跳检查/);
  assert.match(rows[1].textContent, /未解决失败/);
  assert.match(rows[2].textContent, /修改后验证/);
  assert.match(rows[5].textContent, /判断不确定/);
  assert.ok(rows[5].classList.contains('decision-log-muted'), 'low-confidence concern is never highlighted as certain concern');
  fireEvent.click(rows[1].querySelector('button[aria-label="判对了"]'));
  await waitFor(() => assert.deepEqual(writes[0], { sessionId: 'checkpoint-log', target: 'cp-1', rating: 'good' }));
});

test('analysis retains old backend compatibility and shows measured zero separately from unknown', async () => {
  const oldProfile = emptyProfile();
  oldProfile.gate.attempts = 1;
  analysisFixture(oldProfile, [], 1);
  const legacy = render(React.createElement(AnalysisView, { sessionId: 'legacy-profile', t: translate }));
  await legacy.findByText('过程画像');
  assert.equal(legacy.queryByText('过程检查'), null);
  assert.equal(legacy.queryByText('决策测量'), null);
  legacy.unmount();
  analysisFixture({ ...emptyProfile(), checkpoint: { attempts: 0, concern: 0, uncertain: 0, error: 0, skipped: 1 } }, [], 1);
  const skippedOnly = render(React.createElement(AnalysisView, { sessionId: 'skipped-only', t: translate }));
  await skippedOnly.findByText('过程检查');
  assert.equal(skippedOnly.queryByText('本会话尚无决策记录。'), null, 'skip-only observations remain visible without inflating attempts');
  skippedOnly.unmount();
  const profile = { ...emptyProfile(), checkpoint: { attempts: 2, concern: 1, uncertain: 1, error: 0, skipped: 4 }, telemetry: { measured: 1, latencyMsSum: 0, latencyMsP50: 0, latencyMsP95: 0, inputTokens: 0, outputTokens: 0, usageMeasured: 1, backendAttempts: 0, transportMeasured: 1 } };
  analysisFixture(profile, [], 6);
  const measured = render(React.createElement(AnalysisView, { sessionId: 'measured', t: translate }));
  const card = (await measured.findByText('决策测量')).closest('article');
  assert.match(card.textContent, /1\/2/);
  assert.match(card.textContent, /0 ms/);
  assert.match(card.textContent, /0.*已测 1 次/);
  assert.doesNotMatch(card.textContent, /后端请求次数.*未知/);
  const checkpoint = measured.getByText('过程检查').closest('article');
  assert.match(checkpoint.textContent, /跳过.*4|4.*跳过/);
  measured.unmount();
  analysisFixture({ ...profile, telemetry: { ...profile.telemetry, measured: 1, usageMeasured: 0, latencyMsSum: 0, latencyMsP50: 0, latencyMsP95: 0, inputTokens: 0, outputTokens: 0, transportMeasured: 0, backendAttempts: 0 } }, [], 6);
  const unknown = render(React.createElement(AnalysisView, { sessionId: 'unknown', t: translate }));
  const unknownCard = (await unknown.findByText('决策测量')).closest('article');
  assert.match(unknownCard.textContent, /未知/);
  assert.match(unknownCard.textContent, /0 ms/, 'a measured zero latency is not unknown');
  const backendStat = [...unknownCard.querySelectorAll('.decision-stat')].find(node => node.textContent.includes('后端请求次数'));
  assert.ok(backendStat);
  assert.match(backendStat.textContent, /未知/);
  unknown.unmount();
  // With no measurement at all the card is pure noise and must not render.
  analysisFixture({ ...profile, telemetry: { measured: 0, usageMeasured: 0, latencyMsSum: 0, latencyMsP50: null, latencyMsP95: null, inputTokens: 0, outputTokens: 0, transportMeasured: 0, backendAttempts: 0 } }, [], 6);
  const unmeasured = render(React.createElement(AnalysisView, { sessionId: 'unmeasured', t: translate }));
  await unmeasured.findByText('过程画像');
  assert.equal(unmeasured.queryByText('决策测量'), null);
  unknown.unmount();
  analysisFixture({ ...profile, telemetry: { ...profile.telemetry, transportMeasured: undefined, backendAttempts: 0 } }, [], 6);
  const legacyTelemetry = render(React.createElement(AnalysisView, { sessionId: 'legacy-telemetry', t: translate }));
  const legacyCard = (await legacyTelemetry.findByText('决策测量')).closest('article');
  const legacyBackendStat = [...legacyCard.querySelectorAll('.decision-stat')].find(node => node.textContent.includes('后端请求次数'));
  assert.ok(legacyBackendStat);
  assert.match(legacyBackendStat.textContent, /未知/);
});

test('a checkpoint-only session keeps the automatic-decision total at zero and still shows its log', async () => {
  globalThis.fetch = async url => {
    const s = String(url);
    if (s.includes('/session?')) return envelope({ enabled: true });
    if (s.includes('/metrics?')) return envelope({ hasAutomaticDecisions: false, attempts: 0, failures: 0,
      checkpoint: { attempts: 1, failures: 0, concern: 1, uncertain: 0, skipped: 0 } });
    if (s.includes('/log?')) return envelope({ entries: [
      { id: 'cp-only-1', at: 1_700_000_000_000, kind: 'checkpoint', outcome: 'concern', trigger: 'heartbeat', mode: 'observe', turn: 1, step: 2 },
    ] });
    if (s.endsWith('/config')) return envelope({ url: '', model: '', apiKeySet: false, httpApprovedUrl: '', effectiveUrl: 'https://api.typesafe.ai' });
    throw new Error(`Unexpected URL ${url}`);
  };
  const view = render(React.createElement(Panel, { sessionId: 'cp-only', t: translate }));
  const trigger = view.getByRole('button', { name: '决策层' });
  assert.match(trigger.textContent, /决策 0/);
  fireEvent.click(trigger);
  await view.findByText('尚无自动裁决。手动裁决不计入这里。');
  await view.findByText(/另有 1 次只读过程检查/);
  await view.findByText(/观察到待复核信号/);
  assert.doesNotMatch(view.getByRole('dialog', { hidden: true }).textContent, /RAW_|evidence/);
});

test('a canceled checkpoint reads as discarded, never as an evaluation failure', async () => {
  const entries = [{ id: 'cp-cancel', at: 1_700_000_000_000, kind: 'checkpoint', outcome: 'skipped', reason: 'canceled',
    trigger: 'heartbeat', mode: 'observe', turn: 1, step: 3, throughSeq: 9, evidenceCount: 1 }];
  analysisFixture({ ...emptyProfile(), checkpoint: { attempts: 0, concern: 0, uncertain: 0, error: 0, skipped: 1 } }, entries, 1);
  const view = render(React.createElement(AnalysisView, { sessionId: 'cp-canceled', t: translate }));
  await waitFor(() => assert.equal(view.container.querySelectorAll('.decision-log-item').length, 1));
  const row = view.container.querySelector('.decision-log-item');
  assert.match(row.textContent, /已跳过/);
  assert.match(row.textContent, /已取消 \/ 结果已失效/);
  assert.doesNotMatch(row.textContent, /评估失败/);
  assert.ok(row.classList.contains('decision-log-muted'));
});
