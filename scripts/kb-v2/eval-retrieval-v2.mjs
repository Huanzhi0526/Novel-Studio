import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { AgyFlashClient, resolveAgyExecutable } from '../../app/kb-v2/agy-client.mjs';
import { ReferenceStoreV2 } from '../../app/kb-v2/store-v2.mjs';
import { SearchEngineV2 } from '../../app/kb-v2/search-v2.mjs';
import { RetrievalEngineV2 } from '../../app/kb-v2/retrieval-v2.mjs';
import { EmbeddingProvider } from '../../app/main/embedding.mjs';
import { captureAntigravityUsage } from '../capture-antigravity-usage.mjs';

const QUERIES = [
  {
    id: 'ojousama',
    query: '有哪些大小姐人设？',
    note: '人物原型检索（贵族千金/大小姐属性与反差）',
    modes: ['local', 'fast']
  },
  {
    id: 'face_slap',
    query: '有哪些装逼打脸情节？',
    note: '爽点桥段检索（被轻视嘲讽后展露实力震慑全场）',
    modes: ['local', 'fast', 'deep']
  },
  {
    id: 'dating',
    query: '有哪些约会情节？',
    note: '未预设标签检验：男女角色单独外出、逛街、用餐或暧昧同行桥段',
    modes: ['local', 'fast', 'deep']
  },
  {
    id: 'fashion_outfit',
    query: '有哪些服装设计与穿搭描写可以参考？',
    note: '未预设细节检验：制服、私服、礼服、饰品配色与外貌穿搭描写',
    modes: ['local', 'fast', 'deep']
  },
  {
    id: 'magic_cost',
    query: '有哪些能力或魔法的使用限制与代价？',
    note: '世界观与能力机制切面检索',
    modes: ['local', 'fast']
  },
  {
    id: 'jealousy_banter',
    query: '有哪些吃醋、修罗场或败犬逞强的互动桥段？',
    note: '未预设人物关系张力与喜剧反差互动检索',
    modes: ['local', 'fast']
  }
];

function summarizeResult(res) {
  return {
    elapsedMs: res.elapsed,
    degraded: res.degraded,
    reason: res.reason,
    synthesis: res.synthesis ?? '',
    channels: res.channels,
    hitCount: res.hits.length,
    layerDistribution: res.hits.reduce((acc, h) => {
      acc[h.v2_layer] = (acc[h.v2_layer] ?? 0) + 1;
      return acc;
    }, {}),
    topHits: res.hits.slice(0, 6).map(h => ({
      unit_key: h.unit_key,
      layer: h.v2_layer,
      badge: h.v2_badge,
      work: h.work_title,
      title: h.title,
      takeaway: h.creative_takeaway || '',
      snippet: h.content.replace(/\s+/g, ' ').slice(0, 190),
      evidence: h.evidence.slice(0, 2).map(e => `${e.volume_title} ${e.start}-${e.end}`)
    }))
  };
}

async function main() {
  const mvpRoot = resolve('.local/kb-v2-mvp');
  const dbPath = join(mvpRoot, 'data/app-profile/reference-v2.sqlite');
  const reportsRoot = join(mvpRoot, 'reports');
  mkdirSync(reportsRoot, { recursive: true });

  const agyExecutable = resolveAgyExecutable();
  await captureAntigravityUsage({
    executable: agyExecutable,
    filename: join(reportsRoot, 'quota-before-eval.json'),
    cwd: mvpRoot
  }).catch(() => {});

  const store = new ReferenceStoreV2(dbPath);
  const modelPath = resolve('.local/model/Qwen3-Embedding-0.6B-Q8_0.gguf');
  const runtimePath = resolve('.local/model/llama-cpp/llama-server.exe');
  const { size, mtimeMs } = statSync(modelPath);
  const embedding = new EmbeddingProvider({
    modelPath,
    runtimePath,
    id: `Qwen3-Embedding-0.6B-Q8_0:${size}:${Math.trunc(mtimeMs)}`,
    extraArgs: ['--threads', '8', '--threads-batch', '12']
  });
  const agy = new AgyFlashClient();
  const searchV2 = new SearchEngineV2(store, embedding);
  const retrievalV2 = new RetrievalEngineV2(searchV2, {
    customComplete: (messages, opts, sig) => agy.complete(messages, opts, sig)
  });

  const report = {
    evaluatedAt: new Date().toISOString(),
    dbStats: store.stats(),
    cases: []
  };

  try {
    for (const item of QUERIES) {
      console.log(`\n=== Evaluating: ${item.query} ===`);
      const entry = { id: item.id, query: item.query, note: item.note, results: {} };
      for (const mode of item.modes) {
        const t0 = Date.now();
        const res = await retrievalV2.query({ query: item.query, mode, limit: 10 });
        const wallMs = Date.now() - t0;
        const summary = summarizeResult(res);
        summary.wallMs = wallMs;
        entry.results[mode] = summary;
        console.log(`  [${mode.toUpperCase()}] ${summary.hitCount} hits in ${(wallMs / 1000).toFixed(1)}s | layers=${JSON.stringify(summary.layerDistribution)}`);
        if (summary.synthesis) {
          console.log(`    Synthesis: ${summary.synthesis.slice(0, 110)}...`);
        }
        for (const h of summary.topHits.slice(0, 2)) {
          console.log(`    -> [${h.badge}] 《${h.work}》 ${h.title} (${h.evidence.join(', ')})`);
        }
      }
      report.cases.push(entry);
    }
    report.llmUsageTotals = agy.usageTotals;
  } finally {
    agy.close();
    await embedding.close();
    store.close();
  }

  await captureAntigravityUsage({
    executable: agyExecutable,
    filename: join(reportsRoot, 'quota-after-eval.json'),
    cwd: mvpRoot
  }).catch(() => {});

  const outPath = join(reportsRoot, 'retrieval-eval.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nSaved evaluation report to ${outPath}`);
  console.log('Total Eval LLM Usage:', JSON.stringify(report.llmUsageTotals));
}

main().catch(err => {
  console.error('Eval failed:', err);
  process.exitCode = 1;
});
