import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const working = await mkdtemp(join(tmpdir(), 'assert-pack-test-'));
after(() => rm(working, { recursive: true, force: true }));

// `npm run check` builds both halves before running the tests, so this is the
// tarball a release would ship. Pack once; the mutation cases start from it.
execFileSync('npm', ['pack', '--silent', '--pack-destination', working], { cwd: root, stdio: 'ignore' });
const name = (await readdir(working)).find(entry => entry.endsWith('.tgz'));
assert.ok(name, 'npm pack produced a tarball');
const packed = join(working, name);

const run = args => execFileSync(process.execPath, [join(root, 'scripts/assert-pack.mjs'), ...args], { cwd: root, encoding: 'utf8' });

async function repack(label, mutate) {
  const extract = join(working, `extract-${label}`);
  await mkdir(extract, { recursive: true });
  execFileSync('tar', ['-xzf', packed, '-C', extract]);
  await mutate(extract);
  const broken = join(working, `${label}.tgz`);
  execFileSync('tar', ['-czf', broken, '-C', extract, 'package']);
  return broken;
}

test('the packed tarball passes', () => {
  assert.match(run([packed]), /assert-pack: ok/);
});

test('no-argument mode packs the worktree itself', () => {
  assert.match(run([]), /assert-pack: ok/);
});

test('a missing host declaration is rejected', async () => {
  const broken = await repack('missing-decl', async extract => {
    await rm(join(extract, 'package/lib/host/narrowing.d.ts'));
  });
  assert.throws(() => run([broken]), error => /narrowing\.d\.ts/.test(String(error.stderr)));
});

test('a locale detail pointing at a missing file is rejected', async () => {
  const broken = await repack('missing-detail', async extract => {
    const locale = join(extract, 'package/locale/zh.json');
    const data = JSON.parse(await readFile(locale, 'utf8'));
    data.meta.detail = 'docs/zh/MISSING.md';
    await writeFile(locale, JSON.stringify(data));
  });
  assert.throws(() => run([broken]), error => /meta\.detail/.test(String(error.stderr)));
});
