import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { paragraphNumber } from '../../app/main/protocol.mjs';
import { AgyFlashClient, resolveAgyExecutable } from '../../app/kb-v2/agy-client.mjs';
import { parseLooseJson } from '../../app/kb-v2/retrieval-v2.mjs';
import { ReferenceStoreV2, volumeOrderNumber } from '../../app/kb-v2/store-v2.mjs';
import { SearchEngineV2 } from '../../app/kb-v2/search-v2.mjs';
import { EmbeddingProvider } from '../../app/main/embedding.mjs';
import { captureAntigravityUsage } from '../capture-antigravity-usage.mjs';

function minScenesForBlocks(blockCount) {
  if (blockCount < 350) return 1;
  if (blockCount < 1400) return 3;
  return 5;
}

function formatVolumeForPrompt(volume, structures) {
  const sections = structures
    .filter(s => s.volume_id === volume.volume_id && s.revision_id === volume.revision_id && s.type !== 'volume' && s.type !== 'frontmatter')
    .map(s => ({ start: paragraphNumber(s.start), title: s.title || s.type }))
    .sort((a, b) => a.start - b.start);

  const chapterStarts = new Map();
  for (const sec of sections) {
    if (sec.start && !chapterStarts.has(sec.start)) chapterStarts.set(sec.start, sec.title);
  }

  const lines = [`# 作品分卷：${volume.title}（volume_id: ${volume.volume_id}，总段数: ${volume.normalized_payload.blocks.length}）`];
  const blocks = volume.normalized_payload.blocks;
  for (let i = 0; i < blocks.length; i++) {
    const ord = i + 1;
    if (chapterStarts.has(ord)) {
      lines.push(`\n=== 章节：${chapterStarts.get(ord)} ===`);
    }
    const b = blocks[i];
    if (b.kind === 'text' && b.text?.trim()) {
      lines.push(`[${ord}] ${b.text.trim()}`);
    }
  }
  return lines.join('\n');
}

function buildVolumeExtractionPrompt(workTitle, volume, formattedText) {
  const blockCount = volume.normalized_payload.blocks.length;
  const sceneRangeHint = blockCount < 350
    ? '短篇合集按实际篇幅切分为 2～5 个连续场次'
    : blockCount < 1400
      ? '中短篇分卷按实际篇幅切分为 6～14 个连续场次'
      : '一卷通常切分为 16～28 个连续场次';
  const obsRangeHint = blockCount < 350
    ? '本短篇提取 3～8 条高价值人物切面（尤其外貌服饰、性格反差、关系）与设定细节'
    : blockCount < 1400
      ? '本卷提取 6～14 条高价值人物切面（尤其外貌服饰、性格反差、关系）与设定规则细节'
      : '每卷提取 12～24 条高价值人物切面（尤其外貌服饰、性格反差、关系）与设定规则细节';

  return [
    `你正在为本地小说创作参考库（KB v2）对《${workTitle}》的「${volume.title}」执行客观结构化拆解。`,
    '核心原则：【严禁过拟合预设标签】。不要去猜用户未来会搜什么口号词，也不要只挑主线大战而忽略日常戏。请忠实、客观、高密度地记录全卷每一场戏的真实过程与细节。',
    '',
    '请输出一个严格合法的纯 JSON 对象（不要 Markdown 代码块外的多余文字），结构如下：',
    '{',
    '  "scenes": [',
    '    {',
    '      "title": "简明具体的场次标题（8-20字）",',
    '      "chapter_title": "所属章节标题",',
    '      "setting_context": "具体场景地点、时间氛围与环境特征（15-45字）",',
    '      "characters": ["在场角色标准名1", "角色2"],',
    '      "objective_summary": "客观完整概括本场戏的前因、具体行为对话互动、冲突或关系升温过程与结果（100-180字；必须包含具体干了什么，如逛街买什么、吃什么、怎么交手、谁嘲讽谁又如何被实力震慑等）",',
    '      "interaction_dynamics": "人物之间的心理张力、性格反差、情绪转折或气氛拉扯（35-80字）",',
    '      "narrative_highlights": "本场戏在写作设计上的参考看点（如反差萌塑造、节奏铺垫、喜剧包袱、以弱胜强/展露实力震慑旁人、服饰与环境烘托等，35-80字）",',
    '      "start_p": 1,',
    '      "end_p": 180',
    '    }',
    '  ],',
    '  "observations": [',
    '    {',
    '      "entity_type": "character" | "world_rule",',
    '      "name": "角色标准名 或 世界规则/魔法机制/重要组织制度名",',
    '      "aliases": ["别名或称号"],',
    '      "aspect": "identity_appearance" | "persona_style" | "relationships" | "arc_highlights" | "core_mechanism" | "cost_constraints" | "narrative_application",',
    '      "detail": "具体且有信息密度的细节记录（60-150字）。特别注意：① 凡正文中描写的角色服装穿搭（制服、私服、礼服、泳装、女仆装、饰品配色款式）与外貌神态特征，务必归入 identity_appearance 并保留具体款式色彩细节！② 凡涉及魔法/技能/制度的发动条件、限制与代价，务必归入 cost_constraints 或 core_mechanism！",',
    '      "start_p": 50,',
    '      "end_p": 85',
    '    }',
    '  ]',
    '}',
    '',
    '硬性要求：',
    `1. scenes 必须按正文段号 \`[段号]\` 从头到尾顺序切分覆盖整卷所有实质剧情（${sceneRangeHint}），日常闲聊、外出同行/约会、用餐、换装、授课、考试、比武全部如实切入，不得大段跳过正文。`,
    '2. start_p 与 end_p 必须是正文中真实出现的整数段号（对应每行开头的 `[数字]`），且 1 <= start_p <= end_p。',
    `3. observations ${obsRangeHint}。`,
    '4. 只输出纯 JSON 对象，确保引号转义合法。',
    '',
    '================ 以下为本卷标准化正文 ================',
    formattedText,
    '================ 本卷正文结束 ================',
    '请立即严格按上方结构输出纯 JSON 对象（直接以 { 开头、以 } 结尾，必须包含 scenes 与 observations 数组，严禁输出任何对话、反问、总结或额外文字）：'
  ].join('\n');
}

function buildDossierSynthesisPrompt(workTitle, volumeSummaries, focusType = 'all') {
  const focusDesc = focusType === 'character'
    ? '跨全卷「人物切面档案」（entity_type 固定为 "character"）'
    : focusType === 'world_rule'
      ? '跨全卷「世界/机制设定切面档案」（entity_type 固定为 "world_rule"）'
      : '跨卷「人物切面档案」与「世界/机制设定切面档案」';

  const specificRules = focusType === 'character'
    ? [
        '1. 本次仅整理人物档案（entity_type="character"）。男主、核心女主群、重要学姐/学妹/导师/对手等主要角色尽量配齐 identity_appearance、persona_style、relationships、arc_highlights 四个切面；有亮点的次要角色保留 1～2 个最突出的切面（全书共整理约 12～26 名角色）。',
        '2. 人物的 identity_appearance 切面必须把身份背景、外貌特征以及各卷出现过的代表性服装造型（校服、私服、礼服、泳装、祭典/女仆装等款式配色细节）完整汇总；persona_style 写清表里反差与行为模式；arc_highlights 汇总跨卷关键高光与成长转折。'
      ]
    : focusType === 'world_rule'
      ? [
          '1. 本次仅整理世界观、魔法/能力体系、学园/社团/贵族制度、关键舞台或特殊武装道具档案（entity_type="world_rule"，全书共整理约 6～14 项核心设定）。',
          '2. 每项设定按 core_mechanism（核心规则与运作方式）、cost_constraints（发动条件、限制与代价）、narrative_application（对剧情冲突或日常互动的推动作用）组织 2～3 个切面。'
        ]
      : [
          '1. 主要角色尽量配齐 identity_appearance、persona_style、relationships、arc_highlights 四个切面；次要特色角色保留 1～2 个切面。',
          '2. 世界观、魔法/能力体系、学园/贵族制度、关键社团或特殊道具归为 entity_type="world_rule"，按 core_mechanism、cost_constraints、narrative_application 组织切面。'
        ];

  return [
    `你正在为《${workTitle}》汇总${focusDesc}。`,
    '下方提供了从全书各卷正文中直接提取的客观观察记录（附带 volume_id 与起止段号 start_p / end_p）。',
    '请将同一对象在不同分卷的记录去重合并，整理为高信息密度、可直接供小说作者参考的切面档案，并输出严格合法的纯 JSON 对象：',
    '{',
    '  "dossiers": [',
    '    {',
    `      "entity_type": ${focusType === 'character' ? '"character"' : focusType === 'world_rule' ? '"world_rule"' : '"character" | "world_rule"'},`,
    '      "name": "对象标准名称",',
    '      "aliases": ["别名", "头衔", "常见称呼"],',
    '      "summary": "一句话精准概括该角色的人设核心定位（含身份阶级、核心属性反差）或该设定的核心作用（30-70字）",',
    '      "facets": [',
    '        {',
    '          "facet_kind": "identity_appearance" | "persona_style" | "relationships" | "arc_highlights" | "core_mechanism" | "cost_constraints" | "narrative_application",',
    '          "title": "对象名 · 切面具体标题（如：八奈见杏菜 · 身份定位与制服私服穿搭特征）",',
    '          "content": "结构清晰、细节丰富的受限 Markdown 文本（150-420字，可用无序列表和粗体）。",',
    '          "evidence": [',
    '            { "volume_id": "原样保留输入中的volume_id", "start": 50, "end": 85 }',
    '          ]',
    '        }',
    '      ]',
    '    }',
    '  ]',
    '}',
    '',
    '硬性要求：',
    ...specificRules,
    '3. 每个切面的 evidence 数组保留 1～4 条最能支撑该切面的真实 {volume_id, start, end}，严禁编造不存在的 volume_id。',
    '4. 只输出纯 JSON 对象，确保引号转义合法。',
    '',
    '================ 以下为各卷实证观察记录 ================',
    JSON.stringify(volumeSummaries, null, 2),
    '================ 观察记录结束 ================',
    '请立即严格按上方结构输出纯 JSON 对象（直接以 { 开头、以 } 结尾，必须包含 dossiers 数组，严禁输出任何解释或额外文字）：'
  ].join('\n');
}

async function runPool(items, concurrency, workerFn) {
  const results = new Array(items.length);
  let cursor = 0;
  const usageMerged = { calls: 0, inputTokens: 0, outputTokens: 0, cachedReadTokens: 0, thoughtTokens: 0, totalTokens: 0 };
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async (_, laneIdx) => {
    if (laneIdx > 0) await new Promise(r => setTimeout(r, laneIdx * 2000));
    const laneClient = new AgyFlashClient();
    try {
      while (true) {
        const idx = cursor++;
        if (idx >= items.length) break;
        results[idx] = await workerFn(items[idx], idx, laneClient);
      }
    } finally {
      for (const k of Object.keys(usageMerged)) usageMerged[k] += laneClient.usageTotals[k] ?? 0;
      laneClient.close();
    }
  });
  await Promise.all(runners);
  return { results, usageMerged };
}

async function synthesizePart(client, workTitle, compactObs, focusType) {
  const prompt = buildDossierSynthesisPrompt(workTitle, compactObs, focusType);
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { text, usage } = await client.promptText(prompt, { timeoutMs: 300_000 });
      const parsed = parseLooseJson(text);
      if (!Array.isArray(parsed.dossiers) || !parsed.dossiers.length) {
        throw new Error(`Dossier synthesis (${focusType}) returned empty dossiers for ${workTitle}`);
      }
      return { dossiers: parsed.dossiers, usage };
    } catch (err) {
      lastErr = err;
      console.warn(`  [Synth Retry ${attempt}] ${workTitle} (${focusType}) failed: ${err.message}`);
      if (attempt < 3) await new Promise(r => setTimeout(r, 2500 * attempt));
    }
  }
  throw lastErr;
}

function mergeUsage(target, src) {
  if (!src) return;
  for (const k of Object.keys(target)) target[k] += src[k] ?? 0;
}

async function main() {
  const args = process.argv.slice(2);
  const splitAll = args.includes('--all');
  const forceResynthesize = args.includes('--resynthesize');
  const maxMainVolumes = Number(args.find(a => a.startsWith('--max-volumes='))?.split('=')[1] ?? 4);
  const concurrency = Number(args.find(a => a.startsWith('--concurrency='))?.split('=')[1] ?? 3);
  const skipVectors = args.includes('--skip-vectors');

  const mvpRoot = resolve('.local/kb-v2-mvp');
  const samplesRoot = join(mvpRoot, 'samples');
  const extractionsRoot = join(mvpRoot, 'data/extractions');
  const reportsRoot = join(mvpRoot, 'reports');
  const dbPath = join(mvpRoot, 'data/app-profile/reference-v2.sqlite');

  mkdirSync(extractionsRoot, { recursive: true });
  mkdirSync(reportsRoot, { recursive: true });
  mkdirSync(join(mvpRoot, 'data/app-profile'), { recursive: true });

  const workIds = [
    'f7bea6ac-7e3a-5d5b-aa10-d523167cac96', // 败北女角太多了！
    'a393787e-e834-4a00-890c-2e0da4b1c155'  // 公女殿下的家庭教师
  ];

  // Capture quota before starting LLM extraction
  const agyExecutable = resolveAgyExecutable();
  const quotaBeforeFile = join(reportsRoot, 'quota-before-split.json');
  try {
    await captureAntigravityUsage({ executable: agyExecutable, filename: quotaBeforeFile, cwd: mvpRoot });
  } catch (e) {
    console.warn('Quota before capture warning:', e.message);
  }

  const store = new ReferenceStoreV2(dbPath);
  const runUsage = { calls: 0, inputTokens: 0, outputTokens: 0, cachedReadTokens: 0, thoughtTokens: 0, totalTokens: 0 };
  const corpusUsage = { calls: 0, inputTokens: 0, outputTokens: 0, cachedReadTokens: 0, thoughtTokens: 0, totalTokens: 0 };
  const startedAt = Date.now();
  const summaryReport = {
    startedAt: new Date().toISOString(),
    mode: splitAll ? 'full-series' : `mvp-first-${maxMainVolumes}`,
    concurrency,
    books: []
  };

  try {
    for (const workId of workIds) {
      const sampleDir = join(samplesRoot, workId);
      const sampleFile = join(sampleDir, 'result.json');
      const resultJson = JSON.parse(readFileSync(sampleFile, 'utf8'));
      const workTitle = resultJson.work.title;

      const sortedVols = [...resultJson.volumes].sort((a, b) => {
        const oa = volumeOrderNumber(a.title);
        const ob = volumeOrderNumber(b.title);
        return oa - ob || a.title.localeCompare(b.title, 'zh-CN');
      });
      const targetVols = splitAll
        ? sortedVols
        : sortedVols.filter(v => volumeOrderNumber(v.title) >= 1).slice(0, maxMainVolumes);
      const passageVolumeIds = splitAll ? null : new Set(targetVols.map(v => v.volume_id));
      const assetReader = relPath => {
        const p = join(sampleDir, relPath);
        return existsSync(p) ? readFileSync(p) : null;
      };

      console.log(`\n[Book] ${workTitle}: ingesting ${resultJson.volumes.length} canonical volumes, building passage chunks & splitting ${targetVols.length} volumes (concurrency=${concurrency})...`);
      const ingestStats = store.ingestExportedBook(resultJson, assetReader, { passageVolumeIds });
      console.log(`  Canonical ingested: volumes=${ingestStats.totalVolumes}, totalPassageChunks=${ingestStats.chunksBuilt}`);

      const workExtractDir = join(extractionsRoot, workId);
      mkdirSync(workExtractDir, { recursive: true });

      const { results: volumeExtractions, usageMerged } = await runPool(targetVols, concurrency, async (vol, _idx, laneClient) => {
        const minScenes = minScenesForBlocks(vol.normalized_payload.blocks.length);
        const cachePath = join(workExtractDir, `${vol.volume_id}.json`);
        if (existsSync(cachePath)) {
          const cached = JSON.parse(readFileSync(cachePath, 'utf8'));
          if (Array.isArray(cached.scenes) && cached.scenes.length >= minScenes) {
            const existingScenes = store.db.prepare('SELECT count(*) AS c FROM scenes WHERE work_id=? AND volume_id=?').get(workId, vol.volume_id).c;
            console.log(`  [Cached] ${vol.title}: ${cached.scenes.length} scenes, ${cached.observations?.length ?? 0} obs`);
            if (existingScenes !== cached.scenes.length) {
              store.replaceVolumeScenes(workId, vol.volume_id, vol.revision_id, cached.scenes);
            }
            return { volume_id: vol.volume_id, title: vol.title, ...cached };
          }
        }

        const t0 = Date.now();
        const formatted = formatVolumeForPrompt(vol, resultJson.structures);
        const prompt = buildVolumeExtractionPrompt(workTitle, vol, formatted);

        let lastErr = null;
        for (let attempt = 1; attempt <= 4; attempt++) {
          try {
            const { text, usage } = await laneClient.promptText(prompt, { timeoutMs: 360_000 });
            const parsed = parseLooseJson(text);
            if (!Array.isArray(parsed.scenes) || parsed.scenes.length < minScenes) {
              throw new Error(`Too few scenes returned (${parsed?.scenes?.length ?? 0} < ${minScenes})`);
            }
            const payload = {
              volume_id: vol.volume_id,
              revision_id: vol.revision_id,
              title: vol.title,
              extractedAt: new Date().toISOString(),
              elapsedMs: Date.now() - t0,
              usage,
              scenes: parsed.scenes,
              observations: Array.isArray(parsed.observations) ? parsed.observations : []
            };
            writeFileSync(cachePath, JSON.stringify(payload, null, 2));
            const written = store.replaceVolumeScenes(workId, vol.volume_id, vol.revision_id, payload.scenes);
            console.log(`  [Split OK] ${vol.title}: ${written} scenes, ${payload.observations.length} obs in ${Math.round((Date.now() - t0) / 1000)}s (in=${usage.inputTokens}, out=${usage.outputTokens}, thought=${usage.thoughtTokens})`);
            return payload;
          } catch (err) {
            lastErr = err;
            console.warn(`  [Retry ${attempt}] ${vol.title} failed: ${err.message}`);
            if (attempt < 4) await new Promise(r => setTimeout(r, 2500 * attempt));
          }
        }
        throw lastErr;
      });
      mergeUsage(runUsage, usageMerged);
      for (const ve of volumeExtractions) {
        if (ve.usage) {
          corpusUsage.calls += 1;
          mergeUsage(corpusUsage, ve.usage);
        }
      }

      // Synthesize cross-volume Character & World Rule Facet Dossiers
      const dossierCachePath = join(workExtractDir, 'dossiers-synthesized.json');
      let dossiersData = null;
      let resynthesized = false;
      if (existsSync(dossierCachePath) && !forceResynthesize) {
        const cachedDossiers = JSON.parse(readFileSync(dossierCachePath, 'utf8'));
        if (cachedDossiers.volumeCount === volumeExtractions.length && Array.isArray(cachedDossiers.dossiers) && cachedDossiers.dossiers.length > 0) {
          dossiersData = cachedDossiers;
          console.log(`  [Cached Dossiers] ${workTitle}: ${dossiersData.dossiers.length} dossiers (volumes=${dossiersData.volumeCount})`);
        }
      }

      if (!dossiersData) {
        resynthesized = true;
        const tSynth = Date.now();
        const synthCharClient = new AgyFlashClient();
        const synthRuleClient = new AgyFlashClient();
        try {
          if (volumeExtractions.length > 6) {
            const charCompact = volumeExtractions
              .map(ve => ({
                volume_id: ve.volume_id,
                volume_title: ve.title,
                observations: (ve.observations ?? []).filter(o => o.entity_type !== 'world_rule')
              }))
              .filter(v => v.observations.length > 0);
            const ruleCompact = volumeExtractions
              .map(ve => ({
                volume_id: ve.volume_id,
                volume_title: ve.title,
                observations: (ve.observations ?? []).filter(o => o.entity_type === 'world_rule')
              }))
              .filter(v => v.observations.length > 0);

            console.log(`  [Synthesizing Full-Series Dossiers] ${workTitle} across ${volumeExtractions.length} volumes (2x parallel)...`);
            const [charPart, rulePart] = await Promise.all([
              synthesizePart(synthCharClient, workTitle, charCompact, 'character'),
              ruleCompact.length > 0
                ? new Promise(r => setTimeout(r, 2500)).then(() => synthesizePart(synthRuleClient, workTitle, ruleCompact, 'world_rule'))
                : Promise.resolve({ dossiers: [], usage: null })
            ]);
            mergeUsage(runUsage, synthCharClient.usageTotals);
            mergeUsage(runUsage, synthRuleClient.usageTotals);
            const combinedUsage = { calls: 0, inputTokens: 0, outputTokens: 0, cachedReadTokens: 0, thoughtTokens: 0, totalTokens: 0 };
            if (charPart.usage) { combinedUsage.calls += 1; mergeUsage(combinedUsage, charPart.usage); }
            if (rulePart.usage) { combinedUsage.calls += 1; mergeUsage(combinedUsage, rulePart.usage); }
            const mergedDossiers = [
              ...charPart.dossiers.map(d => ({ ...d, entity_type: 'character' })),
              ...rulePart.dossiers.map(d => ({ ...d, entity_type: 'world_rule' }))
            ];
            dossiersData = {
              work_id: workId,
              work_title: workTitle,
              volumeCount: volumeExtractions.length,
              synthesizedAt: new Date().toISOString(),
              elapsedMs: Date.now() - tSynth,
              usage: combinedUsage,
              dossiers: mergedDossiers
            };
          } else {
            const compactObs = volumeExtractions.map(ve => ({
              volume_id: ve.volume_id,
              volume_title: ve.title,
              observations: ve.observations
            }));
            const part = await synthesizePart(synthCharClient, workTitle, compactObs, 'all');
            mergeUsage(runUsage, synthCharClient.usageTotals);
            dossiersData = {
              work_id: workId,
              work_title: workTitle,
              volumeCount: volumeExtractions.length,
              synthesizedAt: new Date().toISOString(),
              elapsedMs: Date.now() - tSynth,
              usage: { calls: 1, ...part.usage },
              dossiers: part.dossiers
            };
          }
        } finally {
          synthCharClient.close();
          synthRuleClient.close();
        }
        writeFileSync(dossierCachePath, JSON.stringify(dossiersData, null, 2));
        console.log(`  [Synthesized] ${workTitle}: ${dossiersData.dossiers.length} dossiers in ${Math.round((Date.now() - tSynth) / 1000)}s (in=${dossiersData.usage.inputTokens}, out=${dossiersData.usage.outputTokens})`);
      }

      if (dossiersData.usage) {
        corpusUsage.calls += dossiersData.usage.calls ?? 1;
        for (const k of ['inputTokens', 'outputTokens', 'cachedReadTokens', 'thoughtTokens', 'totalTokens']) {
          corpusUsage[k] += dossiersData.usage[k] ?? 0;
        }
      }

      const existingDossiers = store.db.prepare('SELECT count(*) AS c FROM dossiers WHERE work_id=?').get(workId).c;
      const dossierStats = (!resynthesized && existingDossiers === dossiersData.dossiers.length)
        ? { dossierCount: existingDossiers, facetCount: store.db.prepare('SELECT count(*) AS c FROM dossier_facets WHERE work_id=?').get(workId).c }
        : store.replaceWorkDossiers(workId, dossiersData.dossiers);

      summaryReport.books.push({
        work_id: workId,
        title: workTitle,
        splitVolumesCount: targetVols.length,
        splitVolumes: targetVols.map(v => v.title),
        passageChunks: ingestStats.chunksBuilt,
        scenes: volumeExtractions.reduce((n, v) => n + v.scenes.length, 0),
        dossiers: dossierStats.dossierCount,
        facets: dossierStats.facetCount
      });
    }

    summaryReport.llmUsageThisRun = runUsage;
    summaryReport.llmUsageFullCorpus = corpusUsage;
  } finally {
    // Capture quota immediately after LLM extraction
    const quotaAfterFile = join(reportsRoot, 'quota-after-split.json');
    try {
      await captureAntigravityUsage({ executable: agyExecutable, filename: quotaAfterFile, cwd: mvpRoot });
    } catch (e) {
      console.warn('Quota after capture warning:', e.message);
    }
  }

  // Build local Qwen3-Embedding 1024d vectors across all 3 layers (facets + scenes + passage_chunks) with Vulkan GPU acceleration!
  if (!skipVectors) {
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
      startupTimeoutMs: 45_000,
      extraArgs: useVulkan
        ? ['-ngl', '99', '--device', 'Vulkan0', '--ctx-size', '24576', '--batch-size', '4096', '--ubatch-size', '2048']
        : ['--ctx-size', '16384', '--batch-size', '4096', '--ubatch-size', '2048', '--threads', '8', '--threads-batch', '8']
    });
    const searchEngine = new SearchEngineV2(store, emb);

    try {
      console.log(`\n[Embedding] Building local Qwen3-1024d vectors (${useVulkan ? 'Vulkan0 GPU preferred' : 'CPU'})...`);
      const tVec = Date.now();
      // 1. Index facets & scenes first
      const fsRes = await searchEngine.prepare({ includePassages: false, batchSize: 16 });
      console.log(`  [Facets & Scenes Vectors] ${fsRes.indexed} newly indexed in ${((Date.now() - tVec) / 1000).toFixed(1)}s (backend=${emb.activeBackendMode})`);

      // 2. Index remaining passage chunks
      const missingPassages = store.db.prepare(`
        SELECT p.id, p.text, p.chapter_title, w.title AS work_title, vol.title AS volume_title
        FROM passage_chunks p
        JOIN works w USING(work_id)
        JOIN volumes vol USING(volume_id)
        LEFT JOIN vectors v ON v.unit_type='passage' AND v.unit_row=p.id AND v.model_id=?
        WHERE v.unit_row IS NULL ORDER BY p.id
      `).all(modelId);

      let passageIndexed = 0;
      const writeStmt = store.db.prepare(`
        INSERT INTO vectors(unit_type, unit_row, model_id, dimension, data)
        VALUES('passage', ?, ?, ?, ?)
        ON CONFLICT(unit_type, unit_row, model_id) DO UPDATE SET dimension=excluded.dimension, data=excluded.data
      `);
      const batchSize = useVulkan ? 32 : 24;
      for (let i = 0; i < missingPassages.length; i += batchSize) {
        const batch = missingPassages.slice(i, i + batchSize);
        const texts = batch.map(r => `作品：${r.work_title} · ${r.volume_title}${r.chapter_title ? ' · ' + r.chapter_title : ''}\n正文片段：${r.text}`.slice(0, 1800));
        const vecs = await searchEngine.encode(texts, undefined, false);
        store.transaction(() => {
          batch.forEach((row, idx) => {
            const vec = vecs[idx];
            writeStmt.run(row.id, modelId, vec.length, Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength));
          });
        });
        passageIndexed += batch.length;
        if (passageIndexed % 640 === 0 || passageIndexed === missingPassages.length) {
          const elapsedSec = (Date.now() - tVec) / 1000;
          console.log(`  [Passage Vectors] ${passageIndexed}/${missingPassages.length} newly indexed (${elapsedSec.toFixed(1)}s, backend=${emb.activeBackendMode})`);
        }
      }

      const totalIndexed = fsRes.indexed + passageIndexed;
      const vecElapsedMs = Date.now() - tVec;
      console.log(`[Embedding Done] Indexed ${totalIndexed} new vectors in ${(vecElapsedMs / 1000).toFixed(1)}s (backend=${emb.activeBackendMode})`);
      summaryReport.vectorBuild = {
        indexed: totalIndexed,
        backendMode: emb.activeBackendMode,
        model: modelId,
        elapsedMs: vecElapsedMs
      };
    } finally {
      await emb.close();
    }
  }

  summaryReport.dbStats = store.stats();
  summaryReport.totalElapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
  store.close();

  const reportFile = join(reportsRoot, 'split-and-index-summary.json');
  writeFileSync(reportFile, JSON.stringify(summaryReport, null, 2));
  console.log('\n=== KB v2 Full Split & Index Summary ===');
  console.log(JSON.stringify(summaryReport, null, 2));
}

main().catch(err => {
  console.error('Fatal error in split-book-v2:', err);
  process.exitCode = 1;
});
