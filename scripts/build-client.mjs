import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const output = await build({
  entryPoints: [resolve(root, 'src/client/index.tsx')], bundle: true, write: false,
  format: 'cjs', platform: 'browser', target: 'es2022', jsx: 'automatic',
  external: ['react', 'react/jsx-runtime'],
});
const code = output.outputFiles[0]?.text;
if (!code) throw new Error('Client bundle was empty');
const bundled = `window.__ModuleLoader__.load({
  id: 'dsh-decision-layer',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
${code}
    return module.exports;
  }
});\n`;
await mkdir(resolve(root, 'lib'), { recursive: true });
await writeFile(resolve(root, 'lib/client.js'), bundled);
