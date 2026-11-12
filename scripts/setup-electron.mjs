import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const metadataPath = require.resolve('electron/package.json');
const directory = dirname(metadataPath);
const archive = process.argv[2];

if (!archive) {
  const install = spawnSync(process.execPath, [join(directory, 'install.js')], { stdio: 'inherit' });
  if (install.error) throw install.error;
  process.exitCode = install.status ?? 1;
} else {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('The offline setup requires Windows x64.');
  const { version } = require(metadataPath);
  const checksums = require(join(directory, 'checksums.json'));
  const name = `electron-v${version}-win32-x64.zip`;
  const input = resolve(archive);
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(input)) hash.update(bytes);
  if (hash.digest('hex') !== checksums[name]) throw new Error(`Archive checksum does not match ${name}.`);

  const { extract } = createRequire(metadataPath)('@electron-internal/extract-zip');
  const dist = join(directory, 'dist');
  await mkdir(dist, { recursive: true });
  await extract(input, { dir: dist });
  const installedVersion = (await readFile(join(dist, 'version'), 'utf8')).trim().replace(/^v/, '');
  if (installedVersion !== version) throw new Error('The extracted Electron runtime has an unexpected version.');
  await writeFile(join(directory, 'path.txt'), 'electron.exe');
  console.log(`Electron ${installedVersion} installed from the verified Windows x64 archive.`);
}
