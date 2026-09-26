import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import { writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React from 'react';
let render, fireEvent, waitFor, cleanup;
import { dictionaries } from '../src/client/i18n.ts';

let Panel, ConfigForm;
let dom;
const originalFetch = globalThis.fetch;
const translate = key => dictionaries.zh[key];
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
  const toggle = await view.findByRole('checkbox', { name: '启用自动介入' });
  await waitFor(() => assert.equal(toggle.checked, true));
  fireEvent.click(toggle);
  view.rerender(React.createElement(Panel, { sessionId: 'two', t: translate }));
  fireEvent.click(view.getByRole('button', { name: /决策层/ }));
  await waitFor(() => assert.equal(view.getByRole('checkbox', { name: '启用自动介入' }).checked, false));
  resolveWrite(envelope({ enabled: false }));
  await waitFor(() => assert.equal(view.getByRole('checkbox', { name: '启用自动介入' }).checked, false));
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
  await view.findByText(/评估失败/);
  await view.findByText(/后端不可达/);
  await view.findByText(/后端连接/);
  assert.equal(view.queryByLabelText('服务地址'), null, 'the backend form must not appear in the modal');
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
  fireEvent.click(view.getByRole('button', { name: '保存配置' }));
  await waitFor(() => assert.equal(savedBody?.checkSettings?.mode, 'steer'));
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
