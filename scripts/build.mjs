import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(new URL('../dist/', import.meta.url), { recursive: true });
await build({
  absWorkingDir: root,
  entryPoints: { app: 'app/renderer/App.jsx' },
  outdir: 'dist', platform: 'browser', bundle: true, target: 'chrome140',
  define: { 'process.env.NODE_ENV': '"production"' },
  minify: true, legalComments: 'linked', logLevel: 'info'
});
await copyFile(new URL('../app/renderer/index.html', import.meta.url), new URL('../dist/index.html', import.meta.url));
