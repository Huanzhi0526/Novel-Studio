import { createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import yazl from 'yazl';

const root = fileURLToPath(new URL('../', import.meta.url));
const release = join(root, 'release');
const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const zip = new yazl.ZipFile();
const topFiles = ['.gitignore', 'AGENTS.md', 'CONTEXT.md', 'HANDOFF.md', 'README.md', 'CLAUDE_前端体验优化交接.md', 'CLAUDE_前端体验优化执行方案.md', 'package.json', 'package-lock.json'];
const sourceFolders = ['app', 'docs', 'model', 'scripts', 'tests', '拆书规范包'];
const ignored = new Set(['.git', '.local', 'node_modules', '__pycache__']);
let files = 0;

function addFile(path) {
  zip.addFile(path, relative(root, path).replaceAll('\\', '/'));
  files++;
}

async function addDirectory(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name < b.name ? -1 : Number(a.name > b.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory() && !ignored.has(entry.name)) await addDirectory(path);
    if (entry.isFile() && !/^(?:\.env(?:\.|$))|\.(?:pyc|sqlite(?:-wal|-shm)?|gguf)$/i.test(entry.name)) addFile(path);
  }
}

for (const file of topFiles) addFile(join(root, file));
for (const folder of sourceFolders) await addDirectory(join(root, folder));
await mkdir(release, { recursive: true });
const output = join(release, `NovelStudio-${version}-source.zip`);
const pending = join(release, `.source-${randomUUID()}.tmp`);
try {
  zip.end();
  await pipeline(zip.outputStream, createWriteStream(pending));
  await rename(pending, output);
} finally {
  await rm(pending, { force: true });
}
const sha256 = createHash('sha256').update(await readFile(output)).digest('hex');
console.log(JSON.stringify({ file: output, files, sha256 }, null, 2));
