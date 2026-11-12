import { createWriteStream } from 'node:fs';
import { mkdir, readdir, rename, rm } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import yazl from 'yazl';

const pack = fileURLToPath(new URL('../拆书规范包/', import.meta.url));
const release = fileURLToPath(new URL('../release/', import.meta.url));
await mkdir(release, { recursive: true });
const zip = new yazl.ZipFile();

async function addDirectory(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const filename = join(directory, item.name);
    if (item.isDirectory() && item.name !== '__pycache__') await addDirectory(filename);
    if (item.isFile() && !item.name.endsWith('.pyc')) {
      zip.addFile(filename, '拆书规范包/' + relative(pack, filename).replaceAll('\\', '/'));
    }
  }
}

await addDirectory(pack);
zip.end();
const output = join(release, '通用拆书规范包_v0.4.zip');
const pending = join(release, `.spec-${randomUUID()}.tmp`);
try {
  await pipeline(zip.outputStream, createWriteStream(pending));
  await rename(pending, output);
} finally {
  await rm(pending, { force: true });
}
console.log('Specification pack:', output);
