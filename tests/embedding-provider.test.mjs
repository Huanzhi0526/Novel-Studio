import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EmbeddingProvider, stripGpuArgs } from '../app/main/embedding.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fake = path.join(here, 'embedding-test-worker.mjs');

test('provider returns Float32Array rows over isolated child protocol', async () => {
  const provider = new EmbeddingProvider({ modelPath: 'test-model', pythonPath: process.execPath, workerPath: fake });
  const got = await provider.embed(['甲', '乙'], { query: true });
  assert.equal(got.length, 2);
  assert.ok(got[0] instanceof Float32Array);
  assert.deepEqual([...got[0]], [1, 0]);
  await provider.close();
});

test('provider reports missing model configuration without starting child', async () => {
  const provider = new EmbeddingProvider({ modelPath: '' });
  await assert.rejects(provider.embed(['查询']), { code: 'EMBED_MODEL_NOT_CONFIGURED' });
  await provider.close();
});

test('provider unloads idle worker after idleTimeoutMs and restarts seamlessly on next embed', async () => {
  const provider = new EmbeddingProvider({
    modelPath: 'test-model',
    pythonPath: process.execPath,
    workerPath: fake,
    idleTimeoutMs: 60
  });
  const first = await provider.embed(['第一轮']);
  assert.equal(first.length, 1);
  const firstPid = provider.child?.pid;
  assert.ok(firstPid);

  await new Promise(resolve => setTimeout(resolve, 120));
  assert.equal(provider.child, null);
  assert.equal(provider.ready, false);

  const second = await provider.embed(['第二轮']);
  assert.equal(second.length, 1);
  assert.ok(provider.child?.pid);
  assert.notEqual(provider.child.pid, firstPid);
  await provider.close();
});

test('llama.cpp backend falls back from broken GPU runtime to CPU runtime with GPU args stripped', async () => {
  assert.deepEqual(
    stripGpuArgs(['-ngl', '99', '--device', 'Vulkan0', '--ctx-size', '16384', '--batch-size', '4096']),
    ['--ctx-size', '16384', '--batch-size', '4096']
  );

  const spawnCalls = [];
  const servers = [];
  const mockSpawn = (exe, args) => {
    spawnCalls.push({ exe, args });
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.killed = false;
    child.exitCode = null;
    child.kill = () => {
      if (child.killed) return;
      child.killed = true;
      child.exitCode = 0;
      child._server?.close();
      queueMicrotask(() => child.emit('exit', 0));
    };

    if (exe.includes('vulkan-broken')) {
      queueMicrotask(() => {
        child.exitCode = 1;
        child.emit('exit', 1);
      });
      return child;
    }

    const portIdx = args.indexOf('--port');
    const port = Number(args[portIdx + 1]);
    const srv = http.createServer((req, res) => {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => {
        const parsed = JSON.parse(body);
        const data = parsed.input.map((_, index) => ({ index, embedding: [0.6, 0.8] }));
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ data }));
      });
    });
    servers.push(srv);
    child._server = srv;
    srv.listen(port, '127.0.0.1', () => {
      child.stderr.write(`main: server is listening on http://127.0.0.1:${port}\n`);
    });
    return child;
  };

  const provider = new EmbeddingProvider({
    modelPath: 'D:\\mock\\Qwen3.gguf',
    runtimePath: 'D:\\mock\\vulkan-broken\\llama-server.exe',
    fallbackRuntimePath: 'D:\\mock\\cpu\\llama-server.exe',
    extraArgs: ['-ngl', '99', '--device', 'Vulkan0', '--ctx-size', '16384'],
    spawnImpl: mockSpawn
  });

  try {
    const vecs = await provider.embed(['测试回退'], { query: true });
    assert.equal(vecs.length, 1);
    assert.equal(provider.activeBackendMode, 'cpu-fallback');
    assert.equal(spawnCalls.length, 2);
    assert.ok(spawnCalls[0].args.includes('Vulkan0'));
    assert.ok(!spawnCalls[1].args.includes('Vulkan0'));
    assert.ok(!spawnCalls[1].args.includes('-ngl'));
    assert.ok(spawnCalls[1].args.includes('16384'));
  } finally {
    await provider.close();
    for (const s of servers) s.close();
  }
});
