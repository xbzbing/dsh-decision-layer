/**
 * dsh-decision-layer build script (self-contained; run by hand while developing
 * and by the release workflow before packing — never as an install-time
 * lifecycle hook. `lib/` is not committed: these artifacts are what `npm pack`
 * ships (docs/adr/0012, docs/adr/0015).
 *
 * 1. Host half: tsc emits the `lib/host/*.d.ts` declarations (which also
 *    type-checks the whole half) and esbuild transpiles `src/host/*.ts` one file
 *    per module into `lib/host/*.js`, so the shipped tree is a plain ESM package
 *    whose relative `./x.js` imports all resolve inside it. No bundling: a stack
 *    trace names the module that raised, and a host-only edit stays reviewable
 *    per file.
 * 2. Client half: esbuild bundles `src/client/index.tsx` into one
 *    `lib/client.js` wrapped in the `window.__ModuleLoader__.load({id,factory})`
 *    closure the web shell materializes. Platform modules (react, react-dom,
 *    @deepseek-ai/*) stay external and resolve through the loader-provided
 *    `require` — bundling any of them would fork the host's module singletons.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const TSC = resolve(ROOT, 'node_modules/typescript/bin/tsc');
const PLUGIN_ID = 'dsh-decision-layer';

function run(cmd, args) {
  const result = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', encoding: 'utf8' });
  // A spawn failure (ENOENT / EPERM) leaves status null; report it instead of
  // exiting silently, so a broken toolchain does not look like a clean build.
  if (result.error !== undefined) {
    console.error(`build: cannot run ${cmd}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// Start from an empty `lib/`: a failed build must not leave a previous run's
// artifacts behind, where a stale-but-valid `lib/client.js` would pass both
// `npm pack` and `assert-pack` and ship an old half.
rmSync(resolve(ROOT, 'lib'), { recursive: true, force: true });

// ── Host half: tsc declarations (type-checks) + per-module esbuild transpile ─
// tsc through its JS entry rather than `npx`: npx is a shell script (a .cmd shim
// on Windows) and cannot be spawned as a child process there.
run(process.execPath, [TSC, '-p', 'tsconfig.host.json']);
const HOST_SRC = resolve(ROOT, 'src/host');
// Recursive so a future `src/host/<area>/x.ts` cannot emit a declaration via
// tsconfig's `**/*.ts` while esbuild misses the matching `.js`.
const hostEntries = readdirSync(HOST_SRC, { recursive: true })
  .filter(file => typeof file === 'string' && file.endsWith('.ts') && !file.endsWith('.d.ts'))
  .map(file => resolve(HOST_SRC, file));
await esbuild.build({
  entryPoints: hostEntries,
  bundle: false,
  outdir: resolve(ROOT, 'lib/host'),
  outbase: HOST_SRC,
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  minify: false,
  sourcemap: false,
  logLevel: 'info',
});

// ── Client half: type-check (no emit) + single-file ModuleLoader bundle ─────
run(process.execPath, [TSC, '-p', 'tsconfig.client.json']);
await esbuild.build({
  entryPoints: [resolve(ROOT, 'src/client/index.tsx')],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/*'],
  minify: false,
  sourcemap: false,
  outfile: resolve(ROOT, 'lib/client.js'),
  logLevel: 'info',
  banner: {
    js: `window.__ModuleLoader__.load({ id: '${PLUGIN_ID}', factory: (require) => {\nvar module = { exports: {} }; var exports = module.exports;`,
  },
  footer: {
    js: 'return module.exports;\n} });',
  },
});

// Neither half is optional: a silently missing artifact would only surface when
// dsh loads the plugin (or when `assert-pack` rejects the tarball).
for (const artifact of ['lib/host/index.js', 'lib/host/index.d.ts', 'lib/client.js']) {
  if (!existsSync(resolve(ROOT, artifact))) {
    console.error(`build: missing ${artifact}`);
    process.exit(1);
  }
}
