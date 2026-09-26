import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import { writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React from 'react';
let render, fireEvent, waitFor, cleanup;
import { dictionaries } from '../src/client/i18n.ts';

let Panel;
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
  const compiled = await build({ entryPoints: ['src/client/panel.tsx'], platform: 'node', format: 'esm', bundle: true,
    external: ['react', 'react/jsx-runtime'], jsx: 'automatic', write: false });
  await writeFile('lib/panel-test.mjs', compiled.outputFiles[0].text);
  Panel = (await import('../lib/panel-test.mjs')).DecisionPanel;
});

afterEach(() => cleanup());
after(() => { globalThis.fetch = originalFetch; dom?.window.close(); });

test('switching session does not show stale enabled state or accept a late update', async () => {
  let resolveWrite;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/session?')) return envelope({ enabled: !String(url).includes('two') });
    if (String(url).includes('/metrics?')) return envelope({ hasAutomaticDecisions: false, attempts: 0, failures: 0 });
    if (String(url).endsWith('/session') && init?.method === 'PUT') return new Promise(resolve => { resolveWrite = resolve; });
    if (String(url).endsWith('/config')) return envelope({ url: '', model: '', apiKeySet: false, httpApprovedUrl: '', effectiveUrl: 'https://api.typesafe.ai' });
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

test('dialog discloses HTTPS destination and clears password when closed', async () => {
  globalThis.fetch = async url => {
    if (String(url).includes('/session?')) return envelope({ enabled: true });
    if (String(url).includes('/metrics?')) return envelope({ hasAutomaticDecisions: false, attempts: 0, failures: 0 });
    if (String(url).endsWith('/config')) return envelope({ url: 'https://custom.test', model: 'jev-latest', apiKeySet: false,
      httpApprovedUrl: '', effectiveUrl: 'https://custom.test', checkSettings: { mode: 'observe', lowScoreThreshold: 1 } });
    throw new Error(`Unexpected URL ${url}`);
  };
  const view = render(React.createElement(Panel, { sessionId: 'privacy', t: translate }));
  fireEvent.click(view.getByRole('button', { name: /决策层/ }));
  assert.equal(view.getByRole('button', { name: '测试连接' }).disabled, true);
  assert.equal(view.getByLabelText('服务地址').disabled, true);
  assert.equal(view.getByLabelText('API Key').disabled, true);
  await view.findByText(/https:\/\/custom\.test/);
  assert.equal(view.getByLabelText('服务地址').disabled, false);
  assert.equal(view.getByRole('button', { name: '测试连接' }).disabled, false);
  assert.match(view.getByText(/裁决时会向以下后端发送/).textContent, /custom\.test/);
  fireEvent.change(view.getByLabelText('服务地址'), { target: { value: 'https://unsaved.test' } });
  assert.match(view.getByText(/裁决时会向以下后端发送/).textContent, /custom\.test/);
  assert.equal(view.getByRole('button', { name: '测试连接' }).disabled, true);
  fireEvent.change(view.getByLabelText('API Key'), { target: { value: 'draft-secret' } });
  fireEvent.click(view.getByRole('button', { name: '关闭' }));
  await waitFor(() => assert.equal(view.getByLabelText('API Key').value, ''));
});

test('self-check steer toggle reflects config and posts the chosen mode on save', async () => {
  let savedBody;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/session?')) return envelope({ enabled: true });
    if (String(url).includes('/metrics?')) return envelope({ hasAutomaticDecisions: false, attempts: 0, failures: 0 });
    if (String(url).endsWith('/config') && init?.method === 'PUT') { savedBody = JSON.parse(init.body); return envelope({ url: '', model: '', apiKeySet: false, httpApprovedUrl: '', effectiveUrl: 'https://api.typesafe.ai', checkSettings: { mode: 'steer', lowScoreThreshold: 1 } }); }
    if (String(url).endsWith('/config')) return envelope({ url: '', model: '', apiKeySet: false, httpApprovedUrl: '', effectiveUrl: 'https://api.typesafe.ai', checkSettings: { mode: 'observe', lowScoreThreshold: 1 } });
    throw new Error(`Unexpected URL ${url}`);
  };
  const view = render(React.createElement(Panel, { sessionId: 'check', t: translate }));
  fireEvent.click(view.getByRole('button', { name: /决策层/ }));
  const toggle = await view.findByRole('checkbox', { name: '低分时补完（硬 steer）' });
  assert.equal(toggle.checked, false, 'observe mode is unchecked by default');
  fireEvent.click(toggle);
  fireEvent.click(view.getByRole('button', { name: '保存配置' }));
  await waitFor(() => assert.equal(savedBody?.checkSettings?.mode, 'steer'));
});

test('panel renders v0.2 gate metrics with separated suggestion and actual counters', async () => {
  globalThis.fetch = async url => {
    if (String(url).includes('/session?')) return envelope({ enabled: true });
    if (String(url).includes('/metrics?')) return envelope({ hasAutomaticDecisions: true, attempts: 5, failures: 1,
      gate: { attempts: 5, failures: 1, allow: 1, ask: 2, deny: 1, actual: { allow: 1, deny: 2, error: 0 } } });
    if (String(url).endsWith('/config')) return envelope({ url: '', model: '', apiKeySet: false, httpApprovedUrl: '', effectiveUrl: 'https://api.typesafe.ai' });
    throw new Error(`Unexpected URL ${url}`);
  };
  const view = render(React.createElement(Panel, { sessionId: 'metrics', t: translate }));
  fireEvent.click(view.getByRole('button', { name: /决策层/ }));
  await view.findByText('模型建议（放行 / 询问 / 拒绝）');
  assert.match(view.getByText('模型建议（放行 / 询问 / 拒绝）').closest('div').textContent, /1 \/ 2 \/ 1/);
  assert.match(view.getByText('实际宿主结果（放行 / 拒绝）').closest('div').textContent, /1 \/ 2/);
});
