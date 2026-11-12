import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { EmbeddingProvider } from '../app/main/embedding.mjs';
import { ImportService, ReferenceService } from '../app/main/reference.mjs';
import { SearchService } from '../app/main/search.mjs';
import { Store } from '../app/main/store.mjs';

const customSuite = process.argv[2];
const suite = customSuite ? resolve(customSuite) : fileURLToPath(new URL('./fixtures/xiyou/', import.meta.url));
const reportDirectory = customSuite ? suite : resolve('.local/search-qa');
const modelDirectory = resolve(process.argv[3] ?? '.local/model');
const candidate = process.argv[4] == null ? undefined : Number(process.argv[4]);
const queries = JSON.parse(await readFile(join(suite, 'queries.json'), 'utf8'));
const store = new Store(':memory:');
const reference = new ReferenceService(store);
const imports = new ImportService(reference);
const embedding = new EmbeddingProvider({
  modelPath: join(modelDirectory, 'Qwen3-Embedding-0.6B-Q8_0.gguf'),
  runtimePath: join(modelDirectory, 'llama-cpp', 'llama-server.exe'),
  id: 'qwen3-embedding-0.6b-q8_0:06507c7b:llama-b12224'
});
const hybrid = new SearchService(reference, embedding, { semanticThreshold: candidate });
const keywords = new SearchService(reference, null);
const mib = bytes => Math.round(bytes / (1024 * 1024));
const percentile = (values, n) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * n) - 1];

try {
  const review = await imports.inspect(join(suite, 'result.zip'));
  const { stats } = imports.commit({ batchId: review.id });
  const start = performance.now();
  const warm = await hybrid.prepare();
  const coldIndexMs = Math.round(performance.now() - start);
  const observations = [];
  for (const { query, expected } of queries) {
    const lexical = await keywords.query({ query, limit: 5 });
    const result = await hybrid.query({ query, limit: 5 });
    const expectedHit = response => expected.length
      ? response.hits.some(hit => expected.includes(hit.card_id))
      : response.hits.length === 0;
    observations.push({
      query, expected, keywordOK: expectedHit(lexical), hybridOK: expectedHit(result), degraded: result.degraded,
      elapsedMs: result.elapsed, channels: result.channels, returned: result.hits.map(hit => hit.title)
    });
  }
  const present = observations.filter(entry => entry.expected.length);
  const absent = observations.filter(entry => !entry.expected.length);
  const memory = {};
  if (process.platform === 'win32' && embedding.child?.pid) {
    const raw = execFileSync('powershell.exe', ['-NoProfile', '-Command',
      `(Get-Process -Id ${embedding.child.pid}).WorkingSet64`], { encoding: 'utf8', windowsHide: true });
    memory.embeddingWorkingSetMiB = mib(Number(raw.trim()));
  }
  const scoped = await hybrid.query({ query: '孫悟空', categories: ['character'], workIds: [review.work.work_id] });
  assert.ok(scoped.hits.length && scoped.hits.every(card => card.category === 'character' && card.work_id === review.work.work_id));
  const controller = new AbortController();
  const cancelled = hybrid.query({ query: '孫悟空的來歷', limit: 5 }, { signal: controller.signal });
  const timer = setTimeout(() => controller.abort(new Error('QA 取消')), 15);
  await assert.rejects(cancelled, /QA 取消/);
  clearTimeout(timer);
  assert.equal((await hybrid.query({ query: '孫悟空', limit: 5 })).degraded, false);
  const interrupted = hybrid.query({ query: '孫悟空', limit: 5 });
  await delay(20);
  embedding.child.kill();
  const fallback = await interrupted;
  assert.equal(fallback.degraded, true);
  assert.ok(fallback.hits.length);
  const recovered = await hybrid.query({ query: '孫悟空', limit: 5 });
  assert.equal(recovered.degraded, false);
  const report = {
    model: embedding.id, threshold: hybrid.semanticThreshold, stats, warm, coldIndexMs,
    answerable: present.length, hybridHitAt5: present.filter(entry => entry.hybridOK).length,
    keywordHitAt5: present.filter(entry => entry.keywordOK).length,
    noAnswer: absent.length, hybridNoAnswerCorrect: absent.filter(entry => entry.hybridOK).length,
    keywordNoAnswerCorrect: absent.filter(entry => entry.keywordOK).length,
    degradedQueries: observations.filter(entry => entry.degraded).length,
    p50Ms: percentile(observations.map(entry => entry.elapsedMs), .5),
    p95Ms: percentile(observations.map(entry => entry.elapsedMs), .95),
    appServiceRSSMiB: mib(process.memoryUsage().rss), ...memory,
    filters: 'pass', cancellation: 'pass', forcedWorkerExit: 'keyword-fallback-and-recovery-pass'
  };
  await mkdir(reportDirectory, { recursive: true });
  const filename = join(reportDirectory, `retrieval-${hybrid.semanticThreshold}.json`);
  await writeFile(filename, JSON.stringify({ report, observations }, null, 2));
  console.log(report);
  for (const row of observations.filter(entry => !entry.hybridOK)) console.log('MISS', row.query, row.channels, row.returned.join(' / '));
  console.log(filename);
} finally {
  await embedding.close();
  store.close();
}
