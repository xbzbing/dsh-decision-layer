// Assert that the packed tarball is actually installable (ADR-0012).
//
// `lib/` is no longer committed, so the only thing keeping a release from
// shipping without a client bundle is the pipeline building it before `npm pack`.
// This script is the check that catches a forgotten build: it extracts the
// tarball and fails loudly if the bundle is missing or empty, if a runtime file
// the host loads at startup is absent, or if source/test trees leaked in.
//
//   node scripts/assert-pack.mjs dsh-decision-layer-0.6.4.tgz
//
// Exits non-zero on any violation so a release step stops before publishing.

import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Files the host or the plugin needs at load time (see service/dsh.mjs).
const REQUIRED = [
  'package/package.json',
  'package/service/dsh.mjs',
  'package/lib/client.js',
  'package/skills/decision-layer/SKILL.md',
  'package/cordis.patch.yml',
  'package/icon.svg',
  'package/README.md',
  'package/README.en.md',
  'package/LICENSE',
  'package/locale/zh.json',
  'package/locale/en.json',
];

// Never ship sources, tests, or local-only notes: they are not needed at runtime
// and docs/local/ is deliberately excluded from the repository.
const FORBIDDEN_PREFIXES = ['package/src/', 'package/tests/', 'package/docs/local/', 'package/node_modules/'];

const tgz = process.argv[2];
if (!tgz) {
  console.error('usage: node scripts/assert-pack.mjs <package.tgz>');
  process.exit(2);
}

const problems = [];
const fail = message => problems.push(message);

const info = await stat(tgz).catch(() => undefined);
if (!info?.isFile()) {
  console.error(`assert-pack: no such tarball: ${tgz}`);
  process.exit(2);
}

const directory = await mkdtemp(join(tmpdir(), 'assert-pack-'));
try {
  execFileSync('tar', ['-xzf', tgz, '-C', directory], { stdio: 'inherit' });

  for (const relative of REQUIRED) {
    const path = join(directory, relative);
    const stats = await stat(path).catch(() => undefined);
    if (!stats?.isFile()) { fail(`missing ${relative}`); continue; }
    if (stats.size === 0) fail(`empty ${relative}`);
  }

  // The client bundle must be the built module-loader wrapper, not a stray file.
  const bundle = join(directory, 'package/lib/client.js');
  const bundleStats = await stat(bundle).catch(() => undefined);
  if (bundleStats?.isFile()) {
    const code = await readFile(bundle, 'utf8');
    if (!code.includes('__ModuleLoader__')) fail('lib/client.js is not the built client bundle (no __ModuleLoader__ wrapper)');
    if (code.length < 10_000) fail(`lib/client.js looks truncated (${code.length} bytes)`);
  }

  const entries = execFileSync('tar', ['-tzf', tgz], { encoding: 'utf8' }).split('\n').filter(Boolean);
  for (const entry of entries) {
    const leaked = FORBIDDEN_PREFIXES.find(prefix => entry.startsWith(prefix));
    if (leaked) fail(`unexpected ${leaked} in the tarball (${entry})`);
  }

  const manifest = JSON.parse(await readFile(join(directory, 'package/package.json'), 'utf8'));
  if (manifest.name !== 'dsh-decision-layer') fail(`unexpected package name: ${manifest.name}`);
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.version)) fail(`unexpected version: ${manifest.version}`);
  if (manifest.main !== './service/dsh.mjs') fail(`unexpected main: ${manifest.main}`);

  console.log(`assert-pack: ${manifest.name}@${manifest.version} — ${entries.length} entries, lib/client.js ${bundleStats?.size ?? 0} bytes`);
} finally {
  await rm(directory, { recursive: true, force: true });
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`assert-pack: ${problem}`);
  console.error(`assert-pack: FAILED with ${problems.length} problem(s) — run \`npm run build:client\` before packing`);
  process.exit(1);
}
console.log('assert-pack: ok');
