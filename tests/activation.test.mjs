import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));

test('package advertises one DSH bundle and matching browser loader identity', async () => {
  const patch = await readFile(new URL('cordis.patch.yml', root), 'utf8');
  const bundle = await readFile(new URL('build.mjs', root), 'utf8');
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml');
  // The install identity lives in three places; tie all three to the manifest
  // name so a rename cannot leave one of them stale (a mismatch hides the panel).
  assert.match(patch, new RegExp(`id: decision-layer\\s+name: ${manifest.name}`));
  assert.match(bundle, new RegExp(`const PLUGIN_ID = '${manifest.name}'`));
  assert.equal(manifest.exports['./client'], './lib/client.js');
  // The loader identity is what makes the dock panel appear; assert it in the
  // built bundle, not only in the source constant it is interpolated from.
  const client = await readFile(new URL('lib/client.js', root), 'utf8');
  assert.match(client, new RegExp(`__ModuleLoader__\\.load\\(\\{ id: '${manifest.name}',`));
});

test('the host entry is the built tree, not TypeScript sources', async () => {
  assert.equal(manifest.main, './lib/host/index.js');
  assert.deepEqual(manifest.exports['.'], { types: './lib/host/index.d.ts', default: './lib/host/index.js' });
  assert.ok(manifest.files.includes('lib/host'));
  assert.ok(!manifest.files.includes('service'));
  // The entry resolves inside the package and its relative imports point at
  // emitted modules, so a packed install has no missing sibling.
  const entry = await readFile(new URL('lib/host/index.js', root), 'utf8');
  assert.match(entry, /from ["']\.\/backend\.js["']/);
  assert.match(entry, /from ["']\.\/config-store\.js["']/);
  assert.match(entry, /new URL\(["']\.\.\/\.\.\/skills\/decision-layer\/SKILL\.md["']/);
});

test('the built client bundle loads through the module loader with platform externals only', async () => {
  const source = await readFile(new URL('lib/client.js', root), 'utf8');
  let registration;
  const sandbox = { window: { __ModuleLoader__: { load: value => { registration = value; } } } };
  vm.runInNewContext(source, sandbox, { filename: 'lib/client.js' });
  assert.equal(registration?.id, manifest.name);
  assert.equal(typeof registration?.factory, 'function');

  // Evaluate the factory with the loader's `require`: a bundled platform module
  // (react / @deepseek-ai) would fork the host's singletons, and a broken banner
  // or footer would throw here instead of in the browser.
  const nodeRequire = createRequire(import.meta.url);
  const required = [];
  const modules = registration.factory(id => { required.push(id); return nodeRequire(id); });
  assert.deepEqual([...new Set(required)].sort(), ['react', 'react/jsx-runtime']);
  assert.ok(Array.isArray(modules.inject) && modules.inject.length > 0, 'client injects its slot services');
  for (const name of ['apply', 'AnalysisView', 'ConfigForm']) assert.equal(typeof modules[name], 'function', `${name} is exported`);
});
