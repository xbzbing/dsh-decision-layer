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

test('a low-confidence low self-check score is tagged as ignorable noise', async () => {
  globalThis.fetch = async url => {
    if (String(url).includes('/session?')) return envelope({ enabled: true });
    if (String(url).includes('/metrics?')) return envelope({ hasAutomaticDecisions: true, attempts: 1, failures: 0,
      check: { attempts: 1, failures: 0, low: 1 } });
    if (String(url).includes('/logs?')) return envelope({ totalDecisions: 1, annotations: { rated: 0, good: 0, bad: 0, unsure: 0 }, ratings: {}, trendBacktest: { warnHits: 0, severeHits: 0, maxRun: 0 } });
    if (String(url).includes('/log?')) return envelope({ entries: [
      { id: 'n1', at: 1_700_000_040_000, kind: 'check', outcome: 'low', score: 0.76, confidence: 0, lowConfidence: true },
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
    if (String(url).endsWith('/config')) return envelope({ url: '', model: '', apiKeySet: false, httpApprovedUrl: '', effectiveUrl: 'https://api.typesafe.ai', narrowSettings: { mode: 'enforce', threshold: 0.3 } });
    throw new Error(`Unexpected URL ${url}`);
  };
  const view = render(React.createElement(ConfigForm, { t: translate }));
  const box = await view.findByPlaceholderText('0.3');
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
    if (String(url).includes('/logs?')) return envelope({ totalDecisions: 3,
      annotations: { rated: 2, good: 1, bad: 1, unsure: 0 }, ratings: { 'a-1': 'good', 'a-2': 'bad' },
      trendBacktest: { warnHits: 1, severeHits: 0, maxRun: 3 },
      profile: {
        gate: { attempts: 2, allow: 1, ask: 0, deny: 1, error: 0 },
        check: { attempts: 1, ok: 0, low: 1, error: 0, scoreSum: 1, scoreCount: 1, confidence: {} },
        narrow: { attempts: 0, applied: 0, error: 0, droppedSum: 0, tooManyCandidates: 0 },
        complete: { attempts: 0, satisfied: 0, unsatisfied: 0, insufficient: 0, error: 0, steered: 0 },
      } });
    if (String(url).includes('/log?')) return envelope({ entries: [
      { id: 'a-1', at: 1_700_000_020_000, kind: 'gate', outcome: 'deny', tool: 'bash', action: 'deny' },
      { id: 'a-2', at: 1_700_000_021_000, kind: 'check', outcome: 'low', score: 0 },
    ] });
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
    if (String(url).includes('/logs?')) return envelope({ totalDecisions: 1,
      annotations: { rated: 0, good: 0, bad: 0, unsure: 0 }, ratings: {},
      trendBacktest: { warnHits: 0, severeHits: 0, maxRun: 0 },
      profile: { gate: { attempts: 1, allow: 0, ask: 0, deny: 1, error: 0 }, check: { attempts: 0, ok: 0, low: 0, error: 0, scoreSum: 0, scoreCount: 0, confidence: {} }, narrow: { attempts: 0, applied: 0, error: 0, droppedSum: 0, tooManyCandidates: 0 }, complete: { attempts: 0, satisfied: 0, unsatisfied: 0, insufficient: 0, error: 0, steered: 0 } } });
    if (String(url).includes('/log?')) return envelope({ entries: [
      { id: 'row-1', at: 1_700_000_030_000, kind: 'gate', outcome: 'deny', tool: 'bash', action: 'deny' },
    ] });
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
    if (String(url).includes('/logs?')) return envelope({ totalDecisions: 0, annotations: { rated: 0, good: 0, bad: 0, unsure: 0 }, ratings: {}, trendBacktest: { warnHits: 0, severeHits: 0, maxRun: 0 } });
    if (String(url).includes('/log?')) return envelope({ entries: [] });
    throw new Error(`Unexpected URL ${url}`);
  };
  const view = render(React.createElement(AnalysisView, { sessionId: 'an-empty', t: translate }));
  await view.findByText('本会话尚无决策记录。');
  assert.equal(view.queryByText('过程画像'), null, 'no profile section without decisions');
});
