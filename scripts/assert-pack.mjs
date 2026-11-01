// Assert that the packed tarball is actually installable (ADR-0012, ADR-0015).
//
// `lib/` is not committed, so the only thing keeping a release from shipping
// without a host tree or client bundle is the pipeline building it before
// `npm pack`. This script is the check that catches a forgotten or partial
// build: it extracts the tarball and fails loudly when a required file is
// missing, when any emitted host module imports a module that is not in the
// tarball or not declared as a dependency, when the client bundle is not the
// built module-loader wrapper, or when source/test/service trees leaked in.
//
//   node scripts/assert-pack.mjs [dsh-decision-layer-<version>.tgz]
//
// With no argument it packs the current worktree into a temporary directory
// first, so `npm run check` exercises exactly the tarball a release would ship.
// Exits non-zero on any violation so a release step stops before publishing.

import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Script } from 'node:vm';

// Files the host or the plugin needs at load time (see src/host/index.ts).
const REQUIRED = [
  'package/package.json',
  'package/lib/host/index.js',
  'package/lib/host/index.d.ts',
  'package/lib/host/types.js',
  'package/lib/client.js',
  'package/skills/decision-layer/SKILL.md',
  'package/cordis.patch.yml',
  'package/icon.svg',
  'package/README.md',
  'package/README.en.md',
  'package/LICENSE',
  'package/locale/zh.json',
  'package/locale/en.json',
  'package/docs/zh/DETAIL.md',
  'package/docs/en/DETAIL.md',
];

// Never ship sources, tests, or local-only notes: they are not needed at runtime
// and docs/local/ is deliberately excluded from the repository.
const FORBIDDEN_PREFIXES = ['package/src/', 'package/tests/', 'package/service/', 'package/docs/local/', 'package/node_modules/'];

// `import "x"`, `import ... from "x"`, and `import("x")` — the shapes our
// non-bundled host emit can use.
const SPECIFIER = /\bfrom\s*["']([^"']+)["']|\bimport\s*\(?\s*["']([^"']+)["']/g;

let tgz = process.argv[2];
let generated;
if (!tgz) {
  generated = await mkdtemp(join(tmpdir(), 'assert-pack-pack-'));
  execFileSync('npm', ['pack', '--silent', '--pack-destination', generated], { stdio: ['ignore', 'ignore', 'inherit'] });
  const packed = (await readdir(generated)).filter(name => name.endsWith('.tgz'));
  if (packed.length !== 1) {
    console.error(`assert-pack: npm pack produced ${packed.length} tarballs (expected exactly one)`);
    process.exit(1);
  }
  tgz = join(generated, packed[0]);
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

  const manifest = JSON.parse(await readFile(join(directory, 'package/package.json'), 'utf8'));
  if (manifest.name !== 'dsh-decision-layer') fail(`unexpected package name: ${manifest.name}`);
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.version)) fail(`unexpected version: ${manifest.version}`);
  if (manifest.main !== './lib/host/index.js') fail(`unexpected main: ${manifest.main}`);

  // Every entry point the manifest advertises must exist inside the tarball.
  const advertised = [
    ['main', manifest.main],
    ['types', manifest.types],
    ['exports["."].types', manifest.exports?.['.']?.types],
    ['exports["."].default', manifest.exports?.['.']?.default],
    ['exports["./client"]', manifest.exports?.['./client']],
  ];
  for (const [field, relative] of advertised) {
    if (typeof relative !== 'string') { fail(`package.json ${field} is not a path`); continue; }
    const stats = await stat(join(directory, 'package', relative)).catch(() => undefined);
    if (!stats?.isFile()) fail(`package.json ${field} points at missing ${relative}`);
  }

  // Every literal path in `files` must have made it into the tarball; a typo or
  // a new runtime directory missing from the whitelist is otherwise invisible.
  for (const entry of Array.isArray(manifest.files) ? manifest.files : []) {
    if (typeof entry !== 'string' || entry.includes('*')) continue;
    const stats = await stat(join(directory, 'package', entry)).catch(() => undefined);
    if (!stats) fail(`package.json files entry ${entry} is missing from the tarball`);
  }

  // A locale's meta.detail is what the plugin detail page loads (a package-relative
  // .md path). A rename that skips package.json/files otherwise only shows up as
  // a silent README fallback.
  for (const locale of ['zh', 'en']) {
    try {
      const data = JSON.parse(await readFile(join(directory, `package/locale/${locale}.json`), 'utf8'));
      const detail = data?.meta?.detail;
      if (typeof detail !== 'string' || !detail || detail.startsWith('/') || detail.split('/').includes('..')) {
        fail(`locale/${locale}.json meta.detail is not a safe package-relative path`);
        continue;
      }
      const stats = await stat(join(directory, 'package', detail)).catch(() => undefined);
      if (!stats?.isFile()) fail(`locale/${locale}.json meta.detail points at missing ${detail}`);
    } catch (error) {
      fail(`locale/${locale}.json is unreadable: ${error.message}`);
    }
  }

  // The client bundle must be the built module-loader wrapper, not a stray file,
  // and it must parse: a truncated banner/footer otherwise only fails in a browser.
  const bundleStats = await stat(join(directory, 'package/lib/client.js')).catch(() => undefined);
  if (bundleStats?.isFile()) {
    const code = await readFile(join(directory, 'package/lib/client.js'), 'utf8');
    if (!code.includes('__ModuleLoader__')) fail('lib/client.js is not the built client bundle (no __ModuleLoader__ wrapper)');
    if (!code.includes(`id: '${manifest.name}'`)) fail('lib/client.js loader id does not match the package name');
    if (code.length < 10_000) fail(`lib/client.js looks truncated (${code.length} bytes)`);
    try { new Script(code, { filename: 'lib/client.js' }); }
    catch (error) { fail(`lib/client.js does not parse: ${error.message}`); }
  }

  // Walk every emitted host module: each relative specifier must resolve inside
  // the tarball, and each bare package must be declared, so a missing sibling in
  // a leaf module (not imported directly by the entry) cannot slip through.
  const hostDir = join(directory, 'package/lib/host');
  const declared = new Set([...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.peerDependencies ?? {})]);
  const hostModules = (await readdir(hostDir, { recursive: true }).catch(() => []))
    .filter(name => typeof name === 'string' && name.endsWith('.js'));
  if (hostModules.length === 0) fail('lib/host contains no emitted modules');
  for (const relative of hostModules) {
    const file = join(hostDir, relative);
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(SPECIFIER)) {
      const specifier = match[1] ?? match[2];
      if (!specifier || specifier.startsWith('node:')) continue;
      if (specifier.startsWith('.')) {
        const target = join(dirname(file), specifier);
        const stats = await stat(target).catch(() => undefined);
        if (!stats?.isFile()) fail(`lib/host/${relative} imports missing ${specifier}`);
        continue;
      }
      const packageName = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
      if (!declared.has(packageName)) fail(`lib/host/${relative} imports undeclared package ${packageName}`);
    }
  }

  // Every emitted module must ship its declaration too: `exports["."].types`
  // points at index.d.ts, and its relative imports only resolve if the sibling
  // declarations are present (a consumer otherwise degrades to `any`).
  for (const relative of hostModules) {
    const declaration = relative.replace(/\.js$/, '.d.ts');
    const stats = await stat(join(hostDir, declaration)).catch(() => undefined);
    if (!stats?.isFile()) fail(`lib/host/${declaration} is missing (the published types must resolve)`);
  }

  const entries = execFileSync('tar', ['-tzf', tgz], { encoding: 'utf8' }).split('\n').filter(Boolean);
  for (const entry of entries) {
    const leaked = FORBIDDEN_PREFIXES.find(prefix => entry.startsWith(prefix));
    if (leaked) fail(`unexpected ${leaked} in the tarball (${entry})`);
  }

  console.log(`assert-pack: ${manifest.name}@${manifest.version} — ${entries.length} entries, ${hostModules.length} host modules, lib/client.js ${bundleStats?.size ?? 0} bytes`);
} finally {
  await rm(directory, { recursive: true, force: true });
  if (generated) await rm(generated, { recursive: true, force: true });
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`assert-pack: ${problem}`);
  console.error(`assert-pack: FAILED with ${problems.length} problem(s) — run \`npm run build\` before packing`);
  process.exit(1);
}
console.log('assert-pack: ok');
