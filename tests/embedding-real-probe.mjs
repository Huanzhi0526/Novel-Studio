import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EmbeddingProvider } from '../app/main/embedding.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modelPath = path.join(root, '.local/model/Qwen3-Embedding-0.6B-Q8_0.gguf');
const runtimePath = path.join(root, '.local/model/llama-cpp/llama-server.exe');
const pairs = [
  ['主角为了寻找失踪的妹妹进入地下王国。', '主人公踏上旅途，想找回不见的妹妹，并发现地下国度。'],
  ['魔法学院的新生要通过入学试炼。', '刚入学的学徒必须完成学院的考核。'],
  ['王位继承人被迫离开王都。', '皇储遭到政变驱逐，只能逃出首都。'],
  ['药师发现村民的疾病与井水有关。', '医生调查后怀疑镇上的水源导致多人患病。'],
  ['两位宿敌在边境战争中暂时结盟。', '交战双方为了共同敌人签下短期停战协议。'],
  ['古老钟楼每逢月圆就会倒转时间。', '满月时城中塔钟会让周围时光逆流。'],
  ['船员在暴风雨后漂流到无人岛。', '海难幸存者被冲上没有居民的岛屿。'],
  ['侦探从一封被烧毁的信中寻找线索。', '调查者检查残缺焦纸，试图还原案件证据。'],
  ['机械师修复了一具拥有记忆的机器人。', '技师让旧型仿生人重新启动并恢复记忆。'],
  ['音乐家为了完成最后一首曲子回到故乡。', '作曲者返乡，想写完未竟的终章。'],
  ['森林守护者阻止矿业公司开采圣地。', '山林居民试图拦下破坏祖先禁地的采矿计划。'],
  ['商会继承人调查家族账本中的失踪款项。', '年轻掌柜追查旧账里被挪走的资金。'],
  ['幽灵只在午夜出现在旧火车站。', '废弃车站每到半夜便会出现一个鬼影。'],
  ['厨师用比赛赢回祖母留下的餐馆。', '年轻主厨参加料理大赛，想保住家里的小店。'],
  ['外交官试图在两国之间避免战争。', '使节通过谈判阻止邻国冲突升级。'],
];
const queries = pairs.flat();
const provider = new EmbeddingProvider({
  backend: 'llama.cpp', runtimePath, modelPath,
  modelId: 'Qwen3-Embedding-0.6B-Q8_0@ggml-org-b12224',
  timeoutMs: 120_000, startupTimeoutMs: 30_000,
});
function avg(values) { return values.reduce((a, b) => a + b, 0) / values.length; }
function cosine(a, b) {
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; }
  return dot / Math.sqrt(aa * bb);
}
try {
  const coldStart = performance.now();
  const cold = await provider.embed([queries[0]], { query: true });
  const coldMs = performance.now() - coldStart;
  const batchStart = performance.now();
  const vectors = await provider.embed(queries, { query: true });
  const batchMs = performance.now() - batchStart;
  const sameTopic = pairs.map((_, i) => cosine(vectors[i * 2], vectors[i * 2 + 1]));
  const differentTopic = pairs.map((_, i) => cosine(vectors[i * 2], vectors[((i + 5) % pairs.length) * 2]));
  let processMemory = null;
  if (provider.child?.pid) {
    try { processMemory = Number(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(Get-Process -Id ${Number(provider.child.pid)}).WorkingSet64`], { encoding: 'utf8' }).trim()); } catch {}
  }
  console.log(JSON.stringify({ smokeTest: true, relevanceEvaluation: false, modelId: provider.id,
    runtimeVersion: 'llama.cpp b12224 (official Windows CPU archive)', modelFileBytes: 639150592,
    queryCount: vectors.length, vectorDimensions: [...new Set(vectors.map((v) => v.length))],
    coldSingleQueryMs: Math.round(coldMs), warmBatch30Ms: Math.round(batchMs),
    warmMsPerQuery: Math.round(batchMs / queries.length),
    similarParaphraseCosineMean: Number(avg(sameTopic).toFixed(5)),
    unrelatedTopicCosineMean: Number(avg(differentTopic).toFixed(5)),
    runtimeWorkingSetBytes: processMemory, vectorsFinite: vectors.every((row) => row.every(Number.isFinite)),
  }, null, 2));
} finally { await provider.close(); }
