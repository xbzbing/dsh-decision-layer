import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);

test('package advertises one DSH bundle and matching browser loader identity', async () => {
  const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  const patch = await readFile(new URL('cordis.patch.yml', root), 'utf8');
  const bundle = await readFile(new URL('scripts/build-client.mjs', root), 'utf8');
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml');
  assert.match(patch, /id: decision-layer\s+name: dsh-decision-layer/);
  assert.match(bundle, /id: 'dsh-decision-layer'/);
  assert.equal(manifest.exports['./client'], './lib/client.js');
});
