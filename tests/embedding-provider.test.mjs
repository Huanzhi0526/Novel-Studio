import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EmbeddingProvider } from '../app/main/embedding.mjs';

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
