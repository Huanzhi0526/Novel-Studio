import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Store } from '../app/main/store.mjs';
import {
  buildFtsMatchExpression,
  extractQueryCore,
  extractSearchTermsV2,
  tokenizeForIndex
} from '../app/kb-v2/text-index.mjs';
import { ReferenceStoreV2, volumeOrderNumber } from '../app/kb-v2/store-v2.mjs';
import { SearchEngineV2 } from '../app/kb-v2/search-v2.mjs';
import { parseLooseJson, RetrievalEngineV2 } from '../app/kb-v2/retrieval-v2.mjs';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { AgyFlashClient, resolveWindowsSystemProxy } from '../app/kb-v2/agy-client.mjs';

function makeSampleExport() {
  return {
    work: {
      work_id: 'work-alpha',
      title: '公女殿下的家庭教师（测试卷）'
    },
    resources: [],
    structures: [
      {
        volume_id: 'vol-01',
        revision_id: 'rev-01',
        structure_id: 'chap-01',
        parent_id: null,
        type: 'chapter',
        title: '第一章 私服约会与王立测验',
        start: 'p000001',
        end: 'p000006'
      }
    ],
    volumes: [
      {
        volume_id: 'vol-01',
        revision_id: 'rev-01',
        title: '第一卷 谦虚青年的破格魔法教学',
        normalized_payload: {
          blocks: [
            { kind: 'text', text: '周末清晨，缇娜换上了一袭群青色丝绒连衣裙，裙摆缀着银色蕾丝花边，头戴白色贝雷帽站在喷泉广场前等待亚伦。' },
            { kind: 'text', text: '两人并肩逛过王都商业街的甜点铺，在露天咖啡座分食草莓塔，气氛微妙而暧昧。' },
            { kind: 'text', text: '下午的贵族公开测验上，高阶贵族子弟当众嘲讽平民出身的亚伦不懂高等极光魔法。' },
            { kind: 'text', text: '亚伦不慌不忙地改写咏唱术式，瞬发七重无咏唱冰炎复合魔法击碎结界，全场考官与贵族震惊失声。' },
            { kind: 'text', text: '但连续展开复合术式会急剧消耗精神力，若超过临界负荷将导致魔力回路灼伤停滞。' },
            { kind: 'text', text: '夕阳下缇娜红着脸拽住亚伦的袖口，小声抱怨他总是藏拙。' }
          ]
        }
      }
    ]
  };
}

function makeMockEmbedding() {
  return {
    id: 'mock-embed-8d',
    modelPath: 'mock://local-qwen3',
    async embed(texts) {
      return texts.map(t => {
        const s = String(t);
        return [
          s.includes('连衣裙') || s.includes('服装') || s.includes('穿搭') || s.includes('蕾丝') ? 3.0 : 0.2,
          s.includes('逛') || s.includes('约会') || s.includes('咖啡') || s.includes('甜点') ? 3.0 : 0.2,
          s.includes('嘲讽') || s.includes('震惊') || s.includes('装逼') || s.includes('实力') ? 3.0 : 0.2,
          s.includes('代价') || s.includes('限制') || s.includes('负荷') || s.includes('魔力回路') ? 3.0 : 0.2,
          s.includes('大小姐') || s.includes('千金') || s.includes('缇娜') ? 2.5 : 0.2,
          1.0,
          0.5,
          0.25
        ];
      });
    }
  };
}

function setupFixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'novel-kb-v2-'));
  const writingStore = new Store(join(dir, 'library.sqlite'));
  const refV2 = new ReferenceStoreV2(join(dir, 'reference-v2.sqlite'));
  t.after(() => {
    refV2.close();
    writingStore.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const sample = makeSampleExport();
  const ingest = refV2.ingestExportedBook(sample, null, { chunkTargetChars: 110, chunkMaxChars: 220 });
  assert.equal(ingest.totalVolumes, 1);
  assert.ok(ingest.chunksBuilt >= 2);

  refV2.replaceVolumeScenes('work-alpha', 'vol-01', 'rev-01', [
    {
      title: '商业街私服同行与露天咖啡座分食甜点',
      chapter_title: '第一章 私服约会与王立测验',
      setting_context: '王都喷泉广场与商业街露天咖啡座',
      characters: ['亚伦', '缇娜'],
      objective_summary: '缇娜精心打扮穿群青色连衣裙赴约，与亚伦单独逛商业街并在露天咖啡座分食草莓塔，两人互动暧昧升温。',
      interaction_dynamics: '公女千金私下羞涩期待与青年温和照顾的反差拉扯',
      narrative_highlights: '通过私服穿搭细节与分食甜点的日常动作自然推进感情线',
      start_p: 1,
      end_p: 2
    },
    {
      title: '王立公开测验瞬发复合魔法震慑嘲讽贵族',
      chapter_title: '第一章 私服约会与王立测验',
      setting_context: '王立学园公开测验结界场',
      characters: ['亚伦', '高阶贵族子弟'],
      objective_summary: '高阶贵族当众轻视嘲讽平民讲师亚伦，亚伦改写术式瞬发七重无咏唱冰炎复合魔法击碎结界，令全场震惊失声。',
      interaction_dynamics: '考前傲慢轻视与实测压倒性实力展现后的剧烈态度反转',
      narrative_highlights: '先抑后扬的实力展露节奏，用客观考官反应烘托破格水准',
      start_p: 3,
      end_p: 4
    }
  ]);

  refV2.replaceWorkDossiers('work-alpha', [
    {
      entity_type: 'character',
      name: '缇娜·霍华德',
      aliases: ['冰华公女'],
      summary: '四大公爵家次女，外表端庄凛然、私下努力笨拙的公女大小姐',
      facets: [
        {
          facet_kind: 'identity_appearance',
          title: '缇娜 · 公女千金身份与群青丝绒连衣裙穿搭',
          content: '- **贵族身份**：霍华德公爵家大小姐。\n- **私服造型**：外出时穿群青色丝绒连衣裙，裙摆点缀银色蕾丝花边，配白色贝雷帽。',
          evidence: [{ volume_id: 'vol-01', start: 1, end: 2 }]
        }
      ]
    },
    {
      entity_type: 'world_rule',
      name: '复合无咏唱术式回路规则',
      aliases: ['复合术式'],
      summary: '高速改写咏唱并叠加多属性魔法的进阶体系及其精神负荷限制',
      facets: [
        {
          facet_kind: 'cost_constraints',
          title: '复合术式 · 精神力临界负荷与魔力回路灼伤代价',
          content: '连续展开复合术式会急剧消耗精神力，一旦超过临界负荷就会导致魔力回路灼伤停滞。',
          evidence: [{ volume_id: 'vol-01', start: 4, end: 5 }]
        }
      ]
    }
  ]);

  return { dir, writingStore, refV2 };
}

test('text-index strips question framing and preserves CJK bigrams for OOV tropes', () => {
  assert.equal(extractQueryCore('有哪些装逼打脸情节？'), '装逼打脸');
  assert.equal(extractQueryCore('请问有哪些大小姐人设？'), '大小姐');
  assert.ok(extractQueryCore('有哪些服装设计与描写？').includes('服装'));

  const terms = extractSearchTermsV2('有哪些装逼打脸情节？');
  assert.ok(terms.includes('装逼'));
  assert.ok(terms.includes('打脸'));
  assert.ok(!terms.includes('哪些'));

  const idxTokens = tokenizeForIndex('哥特萝莉连衣裙与修罗场装逼打脸');
  assert.ok(idxTokens.includes('哥特'));
  assert.ok(idxTokens.includes('萝莉'));
  assert.ok(idxTokens.includes('修罗'));
  assert.ok(idxTokens.includes('罗场'));
  assert.ok(buildFtsMatchExpression(terms)?.includes('"装逼"'));
});

test('volumeOrderNumber sorts prequels, Chinese/numeric main volumes, and side stories properly', () => {
  assert.equal(volumeOrderNumber('前传 0 王立学校篇'), 0);
  assert.equal(volumeOrderNumber('第一卷 谦虚青年'), 1);
  assert.equal(volumeOrderNumber('第十卷 决战'), 10);
  assert.equal(volumeOrderNumber('第十四卷 誓言'), 14);
  assert.equal(volumeOrderNumber('第20卷 终章'), 20);
  assert.equal(volumeOrderNumber('短篇 幕间日常'), 900);
  assert.deepEqual(resolveWindowsSystemProxy({ HTTPS_PROXY: 'http://127.0.0.1:9999' }), {});

  const multilineJson = '{\n  "scenes": [\n    { "title": "第一行\n第二行\t制表", "start_p": 1, }\n  ]\n}';
  const parsedControl = parseLooseJson(multilineJson);
  assert.equal(parsedControl.scenes[0].title, '第一行\n第二行\t制表');

  const retriedStream = '{"scenes":[{"end_p":\n⚠ Your previous turn was interrupted, retrying...\n```json\n{"scenes":[{"title":"重试成功","start_p":1,"end_p":12}]}\n```';
  assert.equal(parseLooseJson(retriedStream).scenes[0].title, '重试成功');

  assert.throws(
    () => parseLooseJson('{"scenes":[{"end_p":\n⚠ Your previous turn failed.'),
    { code: 'AGY_STREAM_INTERRUPTED' }
  );
});

test('ReferenceStoreV2 decouples storage from library.sqlite and supports reader & card adapters', t => {
  const { writingStore, refV2 } = setupFixture(t);

  // Writing database has zero KB v2 items; KB v2 has zero original manuscript tables
  const writingRefWorks = writingStore.db.prepare('SELECT count(*) AS c FROM reference_works').get().c;
  assert.equal(writingRefWorks, 0);
  const v2Tables = refV2.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
  assert.ok(v2Tables.includes('dossiers') && v2Tables.includes('scenes') && v2Tables.includes('passage_chunks'));
  assert.ok(!v2Tables.includes('projects') && !v2Tables.includes('documents'));

  const listed = refV2.list();
  assert.equal(listed.works.length, 1);
  assert.equal(listed.works[0].volumes.length, 1);

  const bookshelf = refV2.listCards({ workId: 'work-alpha', offset: 0 });
  assert.equal(bookshelf.cards.length, 4); // 2 facets + 2 scenes

  const sceneCard = bookshelf.cards.find(c => c.v2_layer === 'scene' && c.title.includes('公开测验'));
  assert.ok(sceneCard.evidence.length === 1);
  assert.equal(sceneCard.evidence[0].start, 'p000003');
  assert.equal(sceneCard.evidence[0].end, 'p000004');
  const readView = refV2.read({
    workId: sceneCard.work_id,
    volumeId: sceneCard.evidence[0].volume_id,
    revisionId: sceneCard.evidence[0].revision_id,
    start: sceneCard.evidence[0].start,
    end: sceneCard.evidence[0].end
  });
  assert.ok(readView.blocks.some(b => b.highlighted));
  assert.equal(refV2.getCard({ workId: sceneCard.work_id, cardId: sceneCard.card_id }).title, sceneCard.title);
});

test('SearchEngineV2 and RetrievalEngineV2 support local, fast, and agentic deep modes', async t => {
  const { refV2 } = setupFixture(t);
  const searchV2 = new SearchEngineV2(refV2, makeMockEmbedding());
  const indexed = await searchV2.prepare({ includePassages: true, batchSize: 10 });
  assert.ok(indexed.indexed >= 6);

  // 1. Local hybrid mode (never calls LLM)
  let llmCalls = 0;
  const localEngine = new RetrievalEngineV2(searchV2, {
    customComplete: async () => {
      llmCalls++;
      return '{}';
    }
  });
  const localRes = await localEngine.query({ query: '连衣裙蕾丝穿搭描写', mode: 'local', limit: 5 });
  assert.equal(llmCalls, 0);
  assert.equal(localRes.degraded, false);
  assert.ok(localRes.hits.length >= 2);
  assert.ok(localRes.hits.some(h => h.v2_layer === 'passage' || h.v2_layer === 'character_facet'));

  // 2. Fast mode (intent expansion + curator + takeaway + synthesis)
  let fastStep = 0;
  const fastEngine = new RetrievalEngineV2(searchV2, {
    customComplete: async messages => {
      fastStep++;
      if (fastStep === 1) {
        return JSON.stringify({
          focus: 'scene',
          entity_type: null,
          facet_kind: null,
          semantic_cues: ['男女角色单独逛商业街、在露天咖啡座分食甜点、刻意穿私服赴约的暧昧互动'],
          lexical_keywords: ['逛', '咖啡座', '甜点', '连衣裙', '赴约']
        });
      }
      const userPayload = JSON.parse(messages[1].content);
      const best = userPayload.candidates.find(c => c.title.includes('咖啡座') || c.text.includes('草莓塔')) ?? userPayload.candidates[0];
      return JSON.stringify({
        synthesis: '命中案例采用私服视觉反差与共享甜点动作来推进日常约会张力。',
        matches: [
          { id: best.id, takeaway: '用群青丝绒连衣裙私服点出重视感，再借分食草莓塔拉近距离' },
          { id: 9999, takeaway: '非法越界编号应被自动丢弃' }
        ]
      });
    }
  });
  const fastRes = await fastEngine.query({ query: '有哪些约会情节？', mode: 'fast', limit: 5 });
  assert.equal(fastRes.degraded, false);
  assert.equal(fastRes.hits.length, 1);
  assert.ok(fastRes.synthesis.includes('日常约会张力'));
  assert.ok(fastRes.hits[0].content.includes('参考看点'));

  // 3. Agentic Deep mode (multi-round search + read_original_range verification + hallucination guard)
  let deepStep = 0;
  const deepEngine = new RetrievalEngineV2(searchV2, {
    customComplete: async messages => {
      deepStep++;
      if (deepStep === 1) {
        return JSON.stringify({
          action: 'tools',
          thought: '先搜场次与原文切片查找被嘲讽后展露实力以及服装细节',
          calls: [
            { tool: 'search_scenes', args: { query: '贵族当众嘲讽后展现压倒性魔法实力震惊全场', keywords: ['嘲讽', '震惊', '瞬发'] } },
            { tool: 'search_passages', args: { query: '连衣裙蕾丝私服描写', keywords: ['连衣裙', '蕾丝'] } }
          ]
        });
      }
      if (deepStep === 2) {
        const obs = JSON.parse(messages.at(-1).content).observations;
        const topScene = obs[0].hits[0];
        return JSON.stringify({
          action: 'tools',
          thought: '翻阅原文段落核实术式施展细节',
          calls: [
            { tool: 'read_original_range', args: { volumeId: topScene.volume_id, startOrdinal: topScene.range[0], endOrdinal: topScene.range[1] } }
          ]
        });
      }
      // Round 3: finalize
      const round1Obs = JSON.parse(messages[3].content).observations;
      const validSceneRef = round1Obs[0].hits[0].ref;
      const validPassageRef = round1Obs[1].hits[0].ref;
      return JSON.stringify({
        action: 'final',
        synthesis: '经翻阅原文核实，本作通过考前贵族轻视与瞬发七重复合魔法击碎结界形成强反差。',
        selections: [
          { ref: validSceneRef, takeaway: '先让高阶贵族立靶嘲讽平民出身，再无咏唱瞬发破结界完成打脸' },
          { ref: validPassageRef, takeaway: '原文第1段对群青色丝绒连衣裙与银色蕾丝裙摆的色彩材质描写' },
          { ref: 'scene:888888', takeaway: '未经过工具召回的伪造引用必须被拦截' }
        ]
      });
    }
  });
  const deepRes = await deepEngine.query({ query: '有哪些装逼打脸情节和服装描写？', mode: 'deep', limit: 10 });
  assert.equal(deepRes.degraded, false);
  assert.equal(deepRes.hits.length, 2);
  assert.ok(deepRes.reason.includes('1 次翻阅原文'));
  assert.ok(deepRes.synthesis.includes('七重复合魔法'));

  // 4. Graceful fallback when LLM errors
  const brokenEngine = new RetrievalEngineV2(searchV2, {
    customComplete: async () => {
      throw new Error('network timeout');
    }
  });
  const fallbackRes = await brokenEngine.query({ query: '魔力回路负荷代价', mode: 'deep', limit: 5 });
  assert.equal(fallbackRes.degraded, true);
  assert.ok(fallbackRes.hits.length >= 1);
});

test('AgyFlashClient ignores delayed exit from superseded child after timeout reset', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'kb-v2-agy-race-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  let spawnCount = 0;
  const fakeSpawn = () => {
    const idx = ++spawnCount;
    const proc = new EventEmitter();
    proc.killed = false;
    proc.stdout = new PassThrough();
    proc.stderr = new PassThrough();
    proc.stdin = new PassThrough();
    proc.kill = () => {
      proc.killed = true;
      // Delayed exit arrives AFTER the next child has already started its own RPCs
      setTimeout(() => proc.emit('exit', null), 25);
    };

    let inBuf = '';
    proc.stdin.on('data', chunk => {
      inBuf += chunk.toString('utf8');
      let nl;
      while ((nl = inBuf.indexOf('\n')) >= 0) {
        const line = inBuf.slice(0, nl);
        inBuf = inBuf.slice(nl + 1);
        const req = JSON.parse(line);
        if (req.method === 'initialize') {
          const delay = idx === 1 ? 5 : 45;
          setTimeout(() => {
            proc.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: req.id, result: { protocolVersion: 1 } }) + '\n');
          }, delay);
        } else if (req.method === 'session/new') {
          if (idx === 1) {
            // Child 1 hangs on session/new to trigger resetOnTimeout
            continue;
          }
          setTimeout(() => {
            proc.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: req.id, result: { sessionId: 'sess-2' } }) + '\n');
          }, 5);
        } else if (req.method === 'session/set_model') {
          proc.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: req.id, result: {} }) + '\n');
        } else if (req.method === 'session/set_config_option') {
          proc.stdout.write(JSON.stringify({
            jsonrpc: '2.0',
            id: req.id,
            result: { configOptions: [{ id: 'thought_level', currentValue: 'low' }] }
          }) + '\n');
        } else if (req.method === 'session/prompt') {
          proc.stdout.write(JSON.stringify({
            jsonrpc: '2.0',
            method: 'session/update',
            params: { sessionId: 'sess-2', update: { sessionUpdate: 'agent_message_chunk', content: { text: '{"ok":true}' } } }
          }) + '\n');
          proc.stdout.write(JSON.stringify({
            jsonrpc: '2.0',
            id: req.id,
            result: { stopReason: 'end_turn', usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } }
          }) + '\n');
        }
      }
    });
    return proc;
  };

  const client = new AgyFlashClient({
    executable: 'fake-agy',
    cwd: dir,
    spawnImpl: fakeSpawn,
    sessionNewTimeoutMs: 30
  });
  t.after(() => client.close());

  await assert.rejects(() => client.promptText('first try'), /请求超时/);
  // Immediately retry while child 1's delayed exit(null) is still in flight
  const second = await client.promptText('second try');
  assert.equal(second.text, '{"ok":true}');
  assert.equal(spawnCount, 2);
});
