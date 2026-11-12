import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { resolveAgyExecutable } from '../../app/kb-v2/agy-client.mjs';
import { ReferenceStoreV2, volumeOrderNumber } from '../../app/kb-v2/store-v2.mjs';
import { SearchEngineV2 } from '../../app/kb-v2/search-v2.mjs';
import { EmbeddingProvider } from '../../app/main/embedding.mjs';
import { captureAntigravityUsage } from '../capture-antigravity-usage.mjs';

async function main() {
  const mvpRoot = resolve('.local/kb-v2-mvp');
  const workerCwd = join(mvpRoot, 'worker-cwd');
  const samplesRoot = join(mvpRoot, 'samples');
  const extractionsRoot = join(mvpRoot, 'data/extractions');
  const reportsRoot = join(mvpRoot, 'reports');
  const dbPath = join(mvpRoot, 'data/app-profile/reference-v2.sqlite');

  const manifest = JSON.parse(readFileSync(join(reportsRoot, 'export-all-manifest.json'), 'utf8'));
  const store = new ReferenceStoreV2(dbPath);
  const startedAt = Date.now();

  let syncedVolumes = 0;
  let syncedBooks = 0;
  const incomplete = [];
  const bookRows = [];

  for (const item of manifest.works) {
    const workId = item.work_id;
    const samp = JSON.parse(readFileSync(join(samplesRoot, workId, 'result.json'), 'utf8'));
    const sortedVols = [...samp.volumes].sort((a, b) => {
      const oa = volumeOrderNumber(a.title);
      const ob = volumeOrderNumber(b.title);
      return oa - ob || a.title.localeCompare(b.title, 'zh-CN');
    });
    const wdir = join(extractionsRoot, workId);

    let doneVols = 0;
    for (const v of sortedVols) {
      const cp = join(wdir, `${v.volume_id}.json`);
      if (!existsSync(cp)) {
        incomplete.push({ type: 'missing_vol', work: samp.work.title, vol: v.title, volume_id: v.volume_id });
        continue;
      }
      const cached = JSON.parse(readFileSync(cp, 'utf8'));
      if (!cached.skippedEmpty && !cached.fullCoverage) {
        incomplete.push({ type: 'partial_vol', work: samp.work.title, vol: v.title, volume_id: v.volume_id, coveredUpTo: cached.coveredUpTo });
        continue;
      }
      const expectedCount = cached.scenes?.length ?? 0;
      const dbScenes = store.db.prepare('SELECT count(*) AS c FROM scenes WHERE work_id=? AND volume_id=?').get(workId, v.volume_id).c;
      const dbMaxEnd = store.db.prepare('SELECT coalesce(max(evidence_end), 0) AS m FROM scenes WHERE work_id=? AND volume_id=?').get(workId, v.volume_id).m;
      const cachedMaxEnd = expectedCount > 0 ? Math.max(...cached.scenes.map(s => Number(s.end_p) || 0)) : 0;
      if (dbScenes !== expectedCount || dbMaxEnd !== cachedMaxEnd) {
        store.replaceVolumeScenes(workId, v.volume_id, v.revision_id, cached.scenes ?? []);
        syncedVolumes++;
      }
      doneVols++;
    }

    const dp = join(wdir, 'dossiers-synthesized.json');
    let synthOk = false;
    if (existsSync(dp)) {
      const dd = JSON.parse(readFileSync(dp, 'utf8'));
      if (dd.fullCoverage === true && Array.isArray(dd.dossiers) && dd.dossiers.length > 0) {
        const expectedFacets = dd.dossiers.reduce((n, d) => n + (Array.isArray(d.facets) ? d.facets.filter(f => f?.content?.trim()).length : 0), 0);
        const dbDossiers = store.db.prepare('SELECT count(*) AS c FROM dossiers WHERE work_id=?').get(workId).c;
        const dbFacets = store.db.prepare('SELECT count(*) AS c FROM dossier_facets WHERE work_id=?').get(workId).c;
        const dbMaxUpdated = store.db.prepare('SELECT coalesce(max(updated_at), 0) AS m FROM dossiers WHERE work_id=?').get(workId).m;
        const dpMtimeMs = Math.floor(statSync(dp).mtimeMs);
        if (dbDossiers !== dd.dossiers.length || dbFacets !== expectedFacets || dpMtimeMs > dbMaxUpdated) {
          store.replaceWorkDossiers(workId, dd.dossiers);
          syncedBooks++;
        }
        synthOk = true;
      } else {
        incomplete.push({ type: 'partial_synth', work: samp.work.title, work_id: workId, expectedFacets: 0 });
      }
    } else {
      incomplete.push({ type: 'missing_synth', work: samp.work.title, work_id: workId });
    }

    const scenes = store.db.prepare('SELECT count(*) AS c FROM scenes WHERE work_id=?').get(workId).c;
    const dossiers = store.db.prepare('SELECT count(*) AS c FROM dossiers WHERE work_id=?').get(workId).c;
    const facets = store.db.prepare('SELECT count(*) AS c FROM dossier_facets WHERE work_id=?').get(workId).c;
    const passages = store.db.prepare('SELECT count(*) AS c FROM passage_chunks WHERE work_id=?').get(workId).c;

    bookRows.push({
      work_id: workId,
      title: samp.work.title,
      totalVolumes: sortedVols.length,
      doneVolumes: doneVols,
      failedVolumes: sortedVols.length - doneVols,
      synthesized: synthOk,
      scenes,
      dossiers,
      facets,
      passageChunks: passages
    });
  }

  console.log(`[SQLite Sync] syncedVolumes=${syncedVolumes}, syncedBooks=${syncedBooks}, incompleteItems=${incomplete.length}`);
  if (incomplete.length > 0) {
    console.log('[Incomplete Items]', JSON.stringify(incomplete, null, 2));
  }

  // Embed all pending facets, scenes, and passages on RTX 4060 Vulkan0
  const modelPath = resolve('.local/model/Qwen3-Embedding-0.6B-Q8_0.gguf');
  const vulkanRuntime = resolve('.local/kb-v2-mvp/llama-cpp-vulkan/llama-server.exe');
  const cpuRuntime = resolve('.local/model/llama-cpp/llama-server.exe');
  const useVulkan = existsSync(vulkanRuntime);
  const { size, mtimeMs } = statSync(modelPath);
  const modelId = `Qwen3-Embedding-0.6B-Q8_0:${size}:${Math.trunc(mtimeMs)}`;

  const emb = new EmbeddingProvider({
    modelPath,
    runtimePath: useVulkan ? vulkanRuntime : cpuRuntime,
    fallbackRuntimePath: cpuRuntime,
    id: modelId,
    idleTimeoutMs: 0,
    startupTimeoutMs: 45_000,
    extraArgs: useVulkan
      ? ['-ngl', '99', '--device', 'Vulkan0', '--ctx-size', '16384', '--batch-size', '2048', '--ubatch-size', '1024']
      : ['--ctx-size', '16384', '--batch-size', '2048', '--ubatch-size', '1024', '--threads', '8', '--threads-batch', '8']
  });

  let newlyEmbedded = 0;
  let activeBackend = null;
  try {
    const searchEngine = new SearchEngineV2(store, emb);
    const prepRes = await searchEngine.prepare({ includePassages: true, batchSize: 16 });
    newlyEmbedded = prepRes.indexed;
    activeBackend = emb.activeBackendMode;
    console.log(`[GPU Embed] newlyEmbedded=${newlyEmbedded}, backend=${activeBackend}`);
  } finally {
    await emb.close();
  }

  // Checkpoint WAL cleanly into reference-v2.sqlite
  store.db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  const dbStats = store.stats();
  store.close();

  const dbFileBytes = statSync(dbPath).size;

  try {
    await captureAntigravityUsage({
      executable: resolveAgyExecutable(),
      filename: join(reportsRoot, 'quota-after-full-library.json'),
      cwd: workerCwd
    });
  } catch (e) {
    console.warn('[Quota After Warning]', e.message);
  }

  const completedBooks = bookRows.filter(r => r.doneVolumes === r.totalVolumes && r.synthesized).length;
  const completedVolumes = bookRows.reduce((n, r) => n + r.doneVolumes, 0);
  const totalVolumes = bookRows.reduce((n, r) => n + r.totalVolumes, 0);
  const status = incomplete.length === 0 && completedBooks === bookRows.length ? 'completed' : 'partial';

  const progressJson = {
    updatedAt: new Date().toISOString(),
    status,
    elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
    completedBooks,
    totalBooks: bookRows.length,
    completedVolumes,
    totalVolumes,
    vectorsNewlyEmbedded: newlyEmbedded,
    embeddingBackend: activeBackend || 'gpu',
    dbFileBytes,
    dbFileMB: Number((dbFileBytes / (1024 * 1024)).toFixed(1)),
    dbStats,
    incomplete,
    books: bookRows
  };
  writeFileSync(join(reportsRoot, 'full-library-progress.json'), JSON.stringify(progressJson, null, 2));

  const totalVecs = dbStats.vectors.reduce((n, v) => n + v.c, 0);
  const mdLines = [
    '# KB v2 全书库（27 部 / 278 卷）全卷无截断拆解与索引最终台账',
    '',
    `- 更新时间：\`${progressJson.updatedAt}\`（状态：\`${status}\`，数据库体积：\`${progressJson.dbFileMB} MB\`）`,
    `- 整书完成进度：**${completedBooks} / ${bookRows.length} 部**｜满卷覆盖进度：**${completedVolumes} / ${totalVolumes} 卷**`,
    `- 数据库总计：档案 **${dbStats.dossiers}** 份（独立切面 **${dbStats.facets}** 条）｜顺序场次 **${dbStats.scenes}** 场｜原文切片 **${dbStats.passages}** 片`,
    `- 向量索引总计（后端：\`${progressJson.embeddingBackend}\`）：**${totalVecs}** 条 1024 维向量（切面 ${dbStats.vectors.find(v => v.unit_type === 'facet')?.c ?? 0} + 场次 ${dbStats.vectors.find(v => v.unit_type === 'scene')?.c ?? 0} + 切片 ${dbStats.vectors.find(v => v.unit_type === 'passage')?.c ?? 0}）`,
    '',
    '| # | 书名 | 满卷进度 | 切面档案 | 独立切面 | 顺序场次 | 原文切片 | 状态 |',
    '|---:|---|---:|---:|---:|---:|---:|---|',
    ...bookRows.map((r, idx) => `| ${idx + 1} | ${r.title} | ${r.doneVolumes}/${r.totalVolumes} | ${r.dossiers} | ${r.facets} | ${r.scenes} | ${r.passageChunks} | ${r.synthesized && r.doneVolumes === r.totalVolumes ? '已完成(全覆盖)' : '待补'} |`)
  ];
  writeFileSync(join(reportsRoot, 'full-library-progress.md'), mdLines.join('\n') + '\n');

  console.log(JSON.stringify({
    status,
    completedBooks: `${completedBooks}/${bookRows.length}`,
    completedVolumes: `${completedVolumes}/${totalVolumes}`,
    dbFileMB: progressJson.dbFileMB,
    dbStats,
    incompleteCount: incomplete.length
  }, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
