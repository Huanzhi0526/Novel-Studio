import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, rename, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import yazl from 'yazl';

const directory = resolve(process.argv[2] ?? '.local/model');
const weightName = 'Qwen3-Embedding-0.6B-Q8_0.gguf';
const weightHash = '06507c7b42688469c4e7298b0a1e16deff06caf291cf0a5b278c308249c3e439';
const runtimeZipHash = 'd7a7a3e014a02dbfce46977f9da6d9b58196b9c83b80bcf6ef2337134103c3d6';

async function verify(file, expected) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(join(directory, file))) hash.update(chunk);
  if (hash.digest('hex') !== expected) throw new Error(`Source checksum mismatch: ${file}`);
}

await Promise.all([verify(weightName, weightHash), verify('llama-cpp-win-cpu.zip', runtimeZipHash)]);
const runtime = join(directory, 'llama-cpp');
const entries = await readdir(runtime, { withFileTypes: true });
const selected = entries.filter(item => item.isFile() && (
  /^(.*\.dll|llama-server\.exe|LICENSE-LLVM-OpenMP)$/i.test(item.name)
));
if (!selected.some(item => item.name === 'llama-server.exe')) throw new Error('llama-server.exe is missing');
await mkdir('release', { recursive: true });
const zip = new yazl.ZipFile();
zip.addFile(join(directory, weightName), `model/${weightName}`, { compress: false });
for (const item of selected) zip.addFile(join(runtime, item.name), `model/llama-cpp/${item.name}`);
zip.addFile(join(directory, 'LICENSE-QWEN'), 'model/LICENSE-QWEN.txt');
zip.addFile(join(directory, 'LICENSE-LLAMA'), 'model/LICENSE-LLAMA.txt');
zip.addBuffer(Buffer.from([
  'Novel Studio 本地语义模型', '',
  '将 model 文件夹解压到工作台的资料目录，随后重启应用。',
  '权重为 Qwen 官方 Qwen3-Embedding-0.6B-Q8_0，Apache-2.0。',
  'https://huggingface.co/Qwen/Qwen3-Embedding-0.6B-GGUF',
  `权重 SHA-256 ${weightHash}`,
  'llama.cpp b12224 Windows CPU x64，MIT。',
  'https://github.com/ggml-org/llama.cpp/releases/tag/b12224',
  `上游运行时 ZIP SHA-256 ${runtimeZipHash}`
].join('\r\n'), 'utf8'), 'model/README.txt');
zip.end();
const filename = resolve('release/NovelStudio-LocalModel-Qwen3-Q8_0.zip');
const pending = resolve('release', `.model-${randomUUID()}.tmp`);
try {
  await pipeline(zip.outputStream, createWriteStream(pending));
  await rename(pending, filename);
} finally {
  await rm(pending, { force: true });
}
console.log(filename);
