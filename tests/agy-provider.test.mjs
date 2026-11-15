import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgyRetrievalProvider, parseAgyModels, accountEnvironment } from '../app/kb-v2/agy-provider.mjs';
import { RetrievalEngineV2 } from '../app/kb-v2/retrieval-v2.mjs';

const catalogue = 'Fetching models...\ngemini-3.8-flash-low\tGemini 3.8 Flash (Low)\ngemini-4-hydrogen-xhigh\tGemini 4 Hydrogen (XHigh)\ngemini-pro-orchestrator\tOrchestrator (Carbon)\nclaude-opus-high\tClaude Opus\n';
function setup(t, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'agy-provider-'));
  const provider = new AgyRetrievalProvider(directory, {
    env: { NOVEL_STUDIO_AGY_BIN: process.execPath },
    run: (_exe, args, _options, done) => { assert.deepEqual(args, ['models']); done(null, catalogue); },
    ...options
  });
  t.after(() => { provider.close(); rmSync(directory, { recursive: true, force: true }); });
  return { directory, provider };
}

test('CLI catalogue discovers Gemini families and only the available effort variants', () => {
  const models = parseAgyModels(catalogue);
  assert.equal(models.length, 3);
  assert.equal(models[0].familyName, 'Gemini 3.8 Flash');
  assert.equal(models[1].effort, 'xhigh');
  assert.equal(models[2].effort, null);
  assert.equal(models[2].familyName, 'Orchestrator (Carbon)');
});

test('model selection persists separately and never rewrites API credentials; new names need discovery', async t => {
  const { directory, provider } = setup(t);
  const api = join(directory, 'retrieval-api.json');
  writeFileSync(api, 'keep-sealed-api');
  assert.equal(provider.get().source, 'auto');
  await assert.rejects(provider.save({ source: 'agy', modelId: 'gemini-fabricated' }), { code: 'AGY_MODEL_UNKNOWN' });
  await provider.listModels();
  await provider.save({ source: 'agy', modelId: 'gemini-4-hydrogen-xhigh' });
  assert.equal(provider.read().source, 'agy');
  const reopened = new AgyRetrievalProvider(directory);
  assert.equal(reopened.read().modelId, 'gemini-4-hydrogen-xhigh');
  assert.equal(readFileSync(api, 'utf8'), 'keep-sealed-api');
  await assert.rejects(provider.save({ source: 'shell', modelId: 'gemini-4-hydrogen-xhigh' }), { code: 'RETRIEVAL_PROVIDER_INPUT' });
});

test('account integration removes inherited API authentication and never reveals CLI errors', async t => {
  assert.deepEqual(accountEnvironment({ GEMINI_API_KEY: 'secret', google_api_key: 'secret', ELECTRON_RUN_AS_NODE: '1', PATH: 'keep' }), { PATH: 'keep' });
  const { provider } = setup(t, { run: (_exe, _args, _options, done) => done(new Error('token=secret')) });
  await assert.rejects(provider.listModels(), error => error.code === 'AGY_MODELS' && !error.message.includes('secret'));
});

test('chosen model and effort reach ACP client; switching replaces client only before the next request', async t => {
  const clients = [];
  let release;
  const { provider } = setup(t, { clientFactory: options => {
    const client = { options, closed: false, close() { this.closed = true; }, complete: async () => new Promise(resolve => { release = resolve; }) };
    clients.push(client); return client;
  } });
  await provider.listModels();
  await provider.save({ source: 'agy', modelId: 'gemini-4-hydrogen-xhigh' });
  const request = provider.complete([], {}, undefined);
  while(!release)await new Promise(resolve => setTimeout(resolve,5));
  assert.equal(clients[0].options.thoughtLevel, 'xhigh');
  await provider.save({ source: 'agy', modelId: 'gemini-pro-orchestrator' });
  assert.equal(clients[0].closed, false);
  release('first'); await request;
  release=null;const second = provider.complete([], {}, undefined);
  while(!release)await new Promise(resolve => setTimeout(resolve,5));
  assert.equal(clients[0].closed, true);
  assert.equal(clients[1].options.modelId, 'gemini-pro-orchestrator');
  assert.equal(clients[1].options.thoughtLevel, null);
  release('second'); await second;
});

function fakeSearch() {
  return { reference: { generation: 0 }, query: async () => ({ hits: [], reason: 'local' }),
    multiLayerSearch: async () => ({ candidates: [], channels: {} }), rankedPage: (_args, _items, meta) => meta };
}
test('manual source selection overrides existing API, auto preserves API priority, API mode never uses account', async () => {
  let source = 'agy', apiCalls = 0, accountCalls = 0;
  const engine = new RetrievalEngineV2(fakeSearch(), { sourceProvider: {
    read: () => ({ source }), snapshot: () => source,
    complete: async () => { accountCalls++; return '{}'; }
  } });
  engine.config = { read: () => ({ profiles: [{}] }), complete: async () => { apiCalls++; return '{}'; } };
  await engine.query({ query: 'test', mode: 'fast' });
  assert.deepEqual([apiCalls, accountCalls], [0, 1]);
  source = 'auto'; await engine.query({ query: 'test', mode: 'fast' });
  assert.deepEqual([apiCalls, accountCalls], [1, 1]);
  source = 'api'; engine.config.read = () => ({ profiles: [] });
  const response = await engine.query({ query: 'test', mode: 'fast' });
  assert.equal(response.degraded, true);
  assert.equal(accountCalls, 1);
});

test('switching account model during retrieval discards old AI results', async () => {
  let snapshot = 'old';
  const engine = new RetrievalEngineV2(fakeSearch(), { sourceProvider: {
    read: () => ({ source: 'agy' }), snapshot: () => snapshot,
    complete: async () => { snapshot = 'new'; return '{}'; }
  } });
  await assert.rejects(engine.query({ query: 'test', mode: 'fast' }), { code: 'SEARCH_CONFIG_CHANGED' });
});

test('corrupt provider settings fail visibly rather than silently choosing a different billing source', t => {
  const { provider } = setup(t);
  writeFileSync(provider.filename, '{broken');
  assert.throws(() => provider.get(), { code: 'RETRIEVAL_PROVIDER_READ' });
});


test('expansion and retrieval use independent selections and plain prose client mode', async t => {
  const { directory, provider: retrieval } = setup(t);
  let options;
  const expansion = new AgyRetrievalProvider(directory, { purpose: 'expand', env: { NOVEL_STUDIO_AGY_BIN: process.execPath }, clientFactory: value => {
    options = value; return { complete: async () => '正文', close() {} };
  } });
  t.after(() => expansion.close());
  assert.equal(expansion.read().source, 'api');
  assert.equal(retrieval.read().source, 'auto');
  await expansion.save({ source: 'agy', modelId: 'gemini-3.8-flash-low' });
  assert.equal(retrieval.read().source, 'auto');
  await expansion.complete([], {});
  assert.equal(options.outputMode, 'text');
  assert.notEqual(expansion.filename, retrieval.filename);
});

test('parallel retrieval calls queue and cancelling a queued request never sends it',async t=>{
 let active=0,peak=0,calls=0;
 const {provider}=setup(t,{clientFactory:()=>({close(){},complete:async()=>{calls++;active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,25));active--;return 'ok';}})});
 const c=new AbortController();
 const a=provider.complete([],{},undefined),b=provider.complete([],{},c.signal),d=provider.complete([],{},undefined);
 c.abort();await assert.rejects(b,{name:'AbortError'});assert.equal(await a,'ok');assert.equal(await d,'ok');assert.equal(peak,1);assert.equal(calls,2);
});


test('model discovery queues behind conflicting session startup and queued cancellation never spawns models',async t=>{
 const {startupLane}=await import('../app/kb-v2/operation.mjs');let release,calls=0;
 const blocker=startupLane.run(()=>new Promise(resolve=>release=resolve));while(!release)await new Promise(resolve=>setImmediate(resolve));
 const {provider}=setup(t,{run:(_exe,_args,_options,done)=>{calls++;done(null,catalogue);}}),controller=new AbortController();
 const job=provider.listModels(undefined,{signal:controller.signal}),assertion=assert.rejects(job,{name:'AbortError'});
 try{for(let i=0;i<200&&startupLane.size<2;i++)await new Promise(resolve=>setTimeout(resolve,5));assert.equal(startupLane.size,2);controller.abort();await assertion;}
 finally{controller.abort();release();await blocker;await startupLane.tail.catch(()=>{});await provider.discovery?.catch(()=>{});}
 assert.equal(calls,0);
});
