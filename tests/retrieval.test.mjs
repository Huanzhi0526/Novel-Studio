import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { Store } from '../app/main/store.mjs';
import { ReferenceService, ImportService } from '../app/main/reference.mjs';
import { SearchService } from '../app/main/search.mjs';
import { RetrievalService } from '../app/main/retrieval.mjs';

async function setup(t, transport) {
  const folder = mkdtempSync(join(tmpdir(), 'novel-retrieval-'));
  const store = new Store(join(folder, 'library.sqlite'));
  t.after(() => { store.close(); rmSync(folder, { recursive: true, force: true }); });
  const reference = new ReferenceService(store);
  const imports = new ImportService(reference);
  const review = await imports.inspect(fileURLToPath(new URL('../scripts/fixtures/xiyou/result.zip', import.meta.url)));
  imports.commit({ batchId: review.id });
  const search = new SearchService(reference, null);
  const calls = [];
  const service = new RetrievalService(search, store, join(folder, 'retrieval-api.json'), {}, async request => {
    calls.push(request);
    return transport(request, calls.length, reference);
  });
  await service.setting('configSave', { endpoint: 'http://127.0.0.1:1234/v1/chat/completions', model: 'test' });
  return { service, calls, reference, search };
}

test('AI retrieval rewrites, filters real cards, preserves scope and pages without another API request', async t => {
  const { service, calls, reference } = await setup(t, (_r, n) =>
    n === 1 ? '{"queries":["水帘洞","花果山"]}' : '{"matches":[1,2]}');
  const workId = reference.db.prepare('SELECT work_id FROM reference_works').get().work_id;
  const result = await service.query({ query: '瀑布后面的住处', useAi: true, workIds: [workId], categories: ['location'], limit: 1 });
  assert.equal(result.degraded, false);
  assert.equal(result.hits.length, 1);
  assert.ok(result.hits.every(c => c.work_id === workId && c.category === 'location'));
  const payload = JSON.parse(calls[1].messages[1].content);
  assert.ok(payload.candidates.length > 1);
  assert.ok(payload.candidates.every(c => Object.keys(c).sort().join() === ['id','title','work','category','content'].sort().join()));
  assert.ok(result.cursor);
  await service.query({ query: '瀑布后面的住处', useAi: true, workIds: [workId], categories: ['location'], limit: 1, cursor: result.cursor });
  assert.equal(calls.length, 2);
  assert.equal(reference.db.prepare('SELECT count(*) AS n FROM reference_imports').get().n, 1);
});

test('invalid model IDs fall back, empty selection remains empty, local mode never calls API', async t => {
  let response = '{"matches":[9999]}';
  const { service, calls } = await setup(t, (_r, n) => n % 2 ? '{"queries":["水帘洞"]}' : response);
  const args = { query: '水帘洞', useAi: true };
  const failed = await service.query(args);
  assert.equal(failed.degraded, true);
  assert.ok(failed.hits.length);
  response = '{"matches":[]}';
  assert.deepEqual((await service.query(args)).hits, []);
  const count = calls.length;
  await service.query({ ...args, useAi: false });
  assert.equal(calls.length, count);
});

test('cancellation and changed library cannot expose stale AI results', async t => {
  const controller = new AbortController();
  const { service, reference } = await setup(t, () => {
    controller.abort(new Error('cancelled'));
    return '{"queries":["水帘洞"]}';
  });
  await assert.rejects(service.query({ query: '洞府', useAi: true }, { signal: controller.signal }), /cancelled/);
  service.config.transport = async () => {
    reference.generation++;
    return '{"queries":["水帘洞"]}';
  };
  await assert.rejects(service.query({ query: '洞府', useAi: true }), { code: 'SEARCH_STALE' });
});
