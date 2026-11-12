import { execFileSync } from 'node:child_process';
import { access, cp, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import './build.mjs';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const release = join(root, 'release');
const temp = join(root, '.local');
await mkdir(release, { recursive: true });
await mkdir(temp, { recursive: true });
const stage = await mkdtemp(join(temp, 'win-package-'));
const runtime = dirname(require('electron'));
await cp(runtime, stage, { recursive: true });
const executable = join(stage, 'Novel Studio.exe');
await rename(join(stage, 'electron.exe'), executable);
const icon = join(root, 'app', 'assets', 'app-icon.ico');
execFileSync('powershell.exe', [
  '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File',
  join(root, 'scripts', 'embed-windows-icon.ps1'), '-Executable', executable, '-Icon', icon
], { stdio: 'inherit', windowsHide: true });
const app = join(stage, 'resources', 'app');
await mkdir(join(app, 'app', 'main'), { recursive: true });
await mkdir(join(app, 'app', 'assets'), { recursive: true });
await cp(icon, join(app, 'app', 'assets', 'app-icon.ico'));
await cp(join(root, 'app', 'assets', 'app-icon.png'), join(app, 'app', 'assets', 'app-icon.png'));
await writeFile(join(app, 'package.json'), JSON.stringify({
  name: packageJson.name, version: packageJson.version, type: 'module', main: packageJson.main
}, null, 2));
await build({
  absWorkingDir: root,
  entryPoints: ['app/main/index.mjs'], outfile: join(app, 'app', 'main', 'index.mjs'),
  bundle: true, external: ['electron'], format: 'esm', platform: 'node', target: 'node24',
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  legalComments: 'linked', logLevel: 'info'
});
await cp(join(root, 'app/main/preload.cjs'), join(app, 'app/main/preload.cjs'));
await cp(join(root, 'dist'), join(app, 'dist'), { recursive: true });
await cp(join(root, 'model'), join(app, 'model'), {
  recursive: true, filter: filename => !filename.includes('__pycache__') && !filename.endsWith('.pyc')
});
await cp(join(root, '拆书规范包/schema'), join(app, '拆书规范包/schema'), { recursive: true });

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  const dirs = [];
  for (const entry of entries) {
    const absolute = join(directory, entry.name);
    if (!entry.isDirectory()) {
      files.push(absolute);
      continue;
    }
    const nested = await walk(absolute);
    files.push(...nested.files);
    dirs.push(...nested.dirs, absolute);
  }
  return { files, dirs };
}

const tree = await walk(stage);
const uninstall = join(temp, basename(stage) + '-uninstall.nsh');
await writeFile(uninstall, '\ufeff' + [
  ...tree.files.map(file => 'Delete "$INSTDIR\\' + relative(stage, file).replaceAll('$', '$$') + '"'),
  ...tree.dirs.map(dir => 'RMDir "$INSTDIR\\' + relative(stage, dir).replaceAll('$', '$$') + '"')
].join('\r\n'), 'utf8');
const output = join(release, `NovelStudio-${packageJson.version}-x64-Setup.exe`);
const pending = join(release, '.' + basename(stage) + '-setup.exe');
const nsis = process.env.NOVEL_STUDIO_MAKENSIS ? resolve(process.env.NOVEL_STUDIO_MAKENSIS) : 'makensis.exe';
try {
  execFileSync(nsis, [
    '/V2', `/DOUTPUT=${pending}`, `/DSOURCE=${stage}`, `/DVERSION=${packageJson.version}`,
    `/DUNINSTALL_FILES=${uninstall}`, `/DAPP_ICON=${icon}`, join(root, 'scripts', 'setup.nsi')
  ], { stdio: 'inherit', windowsHide: true });
  await rename(pending, output);
} finally {
  await rm(pending, { force: true });
}

console.log('Installer:', output);
console.log('Unpacked application:', stage);
try { await access(join(release, '通用拆书规范包_v0.4.zip')); }
catch { await import('./package-spec.mjs'); }
