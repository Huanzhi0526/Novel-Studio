import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { paragraphNumber } from '../../app/main/protocol.mjs';
import { parseLooseJson } from '../../app/kb-v2/retrieval-v2.mjs';
import { volumeOrderNumber } from '../../app/kb-v2/store-v2.mjs';

const AFTERWORD_TITLE_RE = /(?:后记|後記|插画后记|插畫後記|奥付|制作信息|版权页|版權頁|译注汇总|特典说明)/i;

const mvpRoot = resolve('.local/kb-v2-mvp');
const samplesRoot = join(mvpRoot, 'samples');
const extractionsRoot = join(mvpRoot, 'data/extractions');
const reportsRoot = join(mvpRoot, 'reports');
const subWorkDir = join(mvpRoot, 'subagent-work');
mkdirSync(subWorkDir, { recursive: true });

function collectVolumeTextItems(volume, structures) {
  const sections = (structures ?? [])
    .filter(s => s.volume_id === volume.volume_id && s.revision_id === volume.revision_id && s.type !== 'volume' && s.type !== 'frontmatter')
    .map(s => ({
      start: paragraphNumber(s.start),
      end: paragraphNumber(s.end),
      title: (s.title || s.type || '').trim()
    }))
    .filter(s => s.start && s.end)
    .sort((a, b) => a.start - b.start || (a.end - a.start) - (b.end - b.start));

  const chapterStarts = new Map();
  for (const sec of sections) {
    if (!chapterStarts.has(sec.start)) chapterStarts.set(sec.start, sec.title);
  }

  const chapterForOrd = ord => {
    let best = null;
    for (const sec of sections) {
      if (ord >= sec.start && ord <= sec.end) {
        if (!best || (sec.end - sec.start) <= (best.end - best.start)) best = sec;
      }
    }
    return best?.title ?? '';
  };

  const items = [];
  const blocks = volume.normalized_payload.blocks;
  for (let i = 0; i < blocks.length; i++) {
    const ord = i + 1;
    const b = blocks[i];
    if (b.kind === 'text' && b.text?.trim()) {
      const chapHeader = chapterStarts.get(ord) ?? null;
      const chapterTitle = chapHeader || chapterForOrd(ord);
      const prefix = chapHeader ? `=== 章节：${chapHeader} ===\n` : '';
      const line = `${prefix}[${ord}] ${b.text.trim()}`;
      items.push({
        ord,
        chapterTitle,
        isAfterword: AFTERWORD_TITLE_RE.test(chapterTitle),
        line,
        bytes: Buffer.byteLength(line + '\n', 'utf8')
      });
    }
  }
  const storyItems = items.filter(it => !it.isAfterword);
  return {
    totalBlocks: blocks.length,
    items,
    storyItems: storyItems.length > 0 ? storyItems : items
  };
}

function isTailFullyCovered(storyItems, coveredUpTo) {
  if (storyItems.length === 0) return true;
  if (coveredUpTo <= 0) return false;
  const remStory = storyItems.filter(it => it.ord > coveredUpTo);
  if (remStory.length <= 45) return true;
  const remBytes = remStory.reduce((n, it) => n + it.bytes, 0);
  return remBytes <= 6500;
}

function buildObsFileForWork(workId) {
  const samp = JSON.parse(readFileSync(join(samplesRoot, workId, 'result.json'), 'utf8'));
  const sortedVols = [...samp.volumes].sort((a, b) => {
    const oa = volumeOrderNumber(a.title);
    const ob = volumeOrderNumber(b.title);
    return oa - ob || a.title.localeCompare(b.title, 'zh-CN');
  });
  const wdir = join(extractionsRoot, workId);
  const volumeObservations = [];
  for (const v of sortedVols) {
    const cp = join(wdir, `${v.volume_id}.json`);
    if (!existsSync(cp)) continue;
    const d = JSON.parse(readFileSync(cp, 'utf8'));
    if (Array.isArray(d.observations) && d.observations.length > 0) {
      volumeObservations.push({
        volume_id: v.volume_id,
        volume_title: v.title,
        observations: d.observations.map(o => ({
          entity_type: o.entity_type,
          name: o.name,
          aliases: o.aliases,
          aspect: o.aspect,
          detail: o.detail,
          start_p: o.start_p,
          end_p: o.end_p
        }))
      });
    }
  }
  const outPath = join(subWorkDir, `obs-${workId}.jsonl`);
  const linesArr = [
    JSON.stringify({ meta: true, work_id: workId, work_title: samp.work.title, volumeCount: sortedVols.length }),
    ...volumeObservations.flatMap(vo =>
      vo.observations.map(o => JSON.stringify({ volume_id: vo.volume_id, volume_title: vo.volume_title, ...o }))
    )
  ];
  const content = linesArr.join('\n') + '\n';
  writeFileSync(outPath, content);
  return { outPath, lines: linesArr.length, volCount: sortedVols.length };
}

const cmd = process.argv[2] || 'prep';

if (cmd === 'prep') {
  const manifest = JSON.parse(readFileSync(join(reportsRoot, 'export-all-manifest.json'), 'utf8'));
  const summary = [];

  for (const w of manifest.works) {
    const samp = JSON.parse(readFileSync(join(samplesRoot, w.work_id, 'result.json'), 'utf8'));
    const sortedVols = [...samp.volumes].sort((a, b) => {
      const oa = volumeOrderNumber(a.title);
      const ob = volumeOrderNumber(b.title);
      return oa - ob || a.title.localeCompare(b.title, 'zh-CN');
    });
    const wdir = join(extractionsRoot, w.work_id);
    mkdirSync(wdir, { recursive: true });

    const todoVols = [];
    for (const v of sortedVols) {
      const { totalBlocks, items, storyItems } = collectVolumeTextItems(v, samp.structures);
      if (items.length === 0) continue;
      const cp = join(wdir, `${v.volume_id}.json`);
      let existingScenes = [];
      let coveredUpTo = 0;
      let done = false;
      if (existsSync(cp)) {
        try {
          const cached = JSON.parse(readFileSync(cp, 'utf8'));
          existingScenes = Array.isArray(cached.scenes) ? cached.scenes : [];
          coveredUpTo = existingScenes.length > 0 ? Math.max(...existingScenes.map(s => Number(s.end_p) || 0)) : 0;
          if (cached.skippedEmpty || (existingScenes.length > 0 && (cached.fullCoverage === true || isTailFullyCovered(storyItems, coveredUpTo)))) {
            if (!cached.fullCoverage) {
              cached.fullCoverage = true;
              writeFileSync(cp, JSON.stringify(cached, null, 2));
            }
            done = true;
          }
        } catch {}
      }
      if (!done) {
        const remItems = items.filter(it => it.ord > coveredUpTo);
        const startOrd = remItems[0].ord;
        const endOrd = remItems.at(-1).ord;
        const lastStoryOrd = storyItems.at(-1)?.ord ?? endOrd;
        const prevLast = existingScenes.at(-1) ?? null;
        const header = [
          `# 书名：${samp.work.title} | 分卷：${v.title} (volume_id: ${v.volume_id})`,
          `# 待拆段号范围：[${startOrd} .. ${endOrd}]（全卷共 ${totalBlocks} 段，正篇末段约 [${lastStoryOrd}]）`,
          prevLast ? `# 前文已拆末场：「${prevLast.title}」[${prevLast.start_p}-${prevLast.end_p}]（请紧接 [${startOrd}] 往后连续切分直至 [${lastStoryOrd}]！）` : `# 全新分卷（请从 [${startOrd}] 连续切分直至 [${lastStoryOrd}]！）`,
          ''
        ];
        const txtContent = [...header, ...remItems.map(it => it.line)].join('\n');
        const txtPath = join(subWorkDir, `vol-${v.volume_id}.txt`);
        writeFileSync(txtPath, txtContent);
        todoVols.push({
          volume_id: v.volume_id,
          title: v.title,
          coveredUpTo,
          startOrd,
          endOrd,
          lastStoryOrd,
          totalBlocks,
          txtPath,
          lines: txtContent.split('\n').length
        });
      }
    }

    const dp = join(wdir, 'dossiers-synthesized.json');
    let synthDone = false;
    if (todoVols.length === 0 && existsSync(dp)) {
      try {
        const dd = JSON.parse(readFileSync(dp, 'utf8'));
        if (dd.fullCoverage === true && Array.isArray(dd.dossiers) && dd.dossiers.length > 0) synthDone = true;
      } catch {}
    }

    if (todoVols.length > 0 || !synthDone) {
      let obsInfo = null;
      if (todoVols.length === 0) {
        obsInfo = buildObsFileForWork(w.work_id);
      }
      summary.push({
        work_id: w.work_id,
        title: samp.work.title,
        totalVolumes: sortedVols.length,
        todoVols,
        synthTodo: !synthDone,
        obsFile: obsInfo?.outPath ?? null,
        obsLines: obsInfo?.lines ?? null
      });
    }
  }

  writeFileSync(join(subWorkDir, 'manifest.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({
    todoBookCount: summary.length,
    todoVolCount: summary.reduce((n, b) => n + b.todoVols.length, 0),
    books: summary.map(b => ({
      work_id: b.work_id,
      title: b.title,
      todoVols: b.todoVols.map(v => `${v.title} ([${v.startOrd}..${v.lastStoryOrd}], ${v.lines}L)`),
      obsLines: b.obsLines
    }))
  }, null, 2));
} else if (cmd === 'apply-vol') {
  const [, , , workId, volumeId, jsonPath] = process.argv;
  const samp = JSON.parse(readFileSync(join(samplesRoot, workId, 'result.json'), 'utf8'));
  const vol = samp.volumes.find(v => v.volume_id === volumeId);
  if (!vol) throw new Error(`Volume not found: ${volumeId}`);
  const { totalBlocks, storyItems } = collectVolumeTextItems(vol, samp.structures);
  const parsed = parseLooseJson(readFileSync(resolve(jsonPath), 'utf8'));
  if (!Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
    throw new Error('JSON must contain non-empty scenes array');
  }

  const cp = join(extractionsRoot, workId, `${volumeId}.json`);
  let existingScenes = [];
  let existingObs = [];
  let continuedSegments = 0;
  if (existsSync(cp)) {
    try {
      const cached = JSON.parse(readFileSync(cp, 'utf8'));
      if (Array.isArray(cached.scenes)) existingScenes = cached.scenes;
      if (Array.isArray(cached.observations)) existingObs = cached.observations;
      continuedSegments = cached.continuedSegments ?? 0;
    } catch {}
  }

  const prevMax = existingScenes.length > 0 ? Math.max(...existingScenes.map(s => Number(s.end_p) || 0)) : 0;
  const mergedScenes = [...existingScenes];
  for (const raw of parsed.scenes) {
    if (!raw || typeof raw !== 'object' || !raw.title || !raw.objective_summary) continue;
    let sp = Math.max(1, Math.min(totalBlocks, Number(raw.start_p) || 1));
    let ep = Math.max(sp, Math.min(totalBlocks, Number(raw.end_p) || sp));
    if (ep <= prevMax) continue;
    mergedScenes.push({
      title: String(raw.title),
      chapter_title: String(raw.chapter_title ?? ''),
      setting_context: String(raw.setting_context ?? ''),
      characters: Array.isArray(raw.characters) ? raw.characters.map(String) : [],
      objective_summary: String(raw.objective_summary),
      interaction_dynamics: String(raw.interaction_dynamics ?? ''),
      narrative_highlights: String(raw.narrative_highlights ?? ''),
      start_p: sp,
      end_p: ep
    });
  }
  mergedScenes.sort((a, b) => (a.start_p - b.start_p) || (a.end_p - b.end_p));

  const mergedObs = [...existingObs];
  for (const o of parsed.observations ?? []) {
    if (!o || typeof o !== 'object' || !o.name || !o.detail) continue;
    let sp = Math.max(1, Math.min(totalBlocks, Number(o.start_p) || 1));
    let ep = Math.max(sp, Math.min(totalBlocks, Number(o.end_p) || sp));
    mergedObs.push({
      entity_type: o.entity_type === 'world_rule' ? 'world_rule' : 'character',
      name: String(o.name),
      aliases: Array.isArray(o.aliases) ? o.aliases.map(String) : [],
      aspect: String(o.aspect || 'persona_style'),
      detail: String(o.detail),
      start_p: sp,
      end_p: ep
    });
  }

  const newMax = Math.max(0, ...mergedScenes.map(s => s.end_p));
  const full = isTailFullyCovered(storyItems, newMax);
  const lastStoryOrd = storyItems.at(-1)?.ord ?? totalBlocks;

  writeFileSync(cp, JSON.stringify({
    volume_id: volumeId,
    revision_id: vol.revision_id,
    title: vol.title,
    fullCoverage: full,
    coveredUpTo: newMax,
    totalBlocks,
    continuedSegments: continuedSegments + 1,
    extractedAt: new Date().toISOString(),
    scenes: mergedScenes,
    observations: mergedObs
  }, null, 2));

  if (!full) {
    console.error(`INCOMPLETE_TAIL: scenes only reached p${newMax}, but story ends around p${lastStoryOrd}. Please continue extracting [${newMax + 1}..${lastStoryOrd}] and call apply-vol again!`);
    process.exit(2);
  }
  console.log(`OK_VOL_COMPLETE: ${vol.title} totalScenes=${mergedScenes.length} totalObs=${mergedObs.length} coveredUpTo=${newMax}/${totalBlocks}`);
} else if (cmd === 'build-obs') {
  const workId = process.argv[3];
  const info = buildObsFileForWork(workId);
  console.log(JSON.stringify(info));
} else if (cmd === 'apply-synth') {
  const [, , , workId, jsonPath] = process.argv;
  const samp = JSON.parse(readFileSync(join(samplesRoot, workId, 'result.json'), 'utf8'));
  const parsed = parseLooseJson(readFileSync(resolve(jsonPath), 'utf8'));
  if (!Array.isArray(parsed.dossiers) || parsed.dossiers.length < 5) {
    throw new Error(`Expected at least 5 dossiers, got ${parsed?.dossiers?.length ?? 0}`);
  }
  const dp = join(extractionsRoot, workId, 'dossiers-synthesized.json');
  writeFileSync(dp, JSON.stringify({
    work_id: workId,
    work_title: samp.work.title,
    volumeCount: samp.volumes.length,
    fullCoverage: true,
    synthesizedAt: new Date().toISOString(),
    dossiers: parsed.dossiers
  }, null, 2));
  const facetCount = parsed.dossiers.reduce((n, d) => n + (Array.isArray(d.facets) ? d.facets.length : 0), 0);
  console.log(`OK_SYNTH_COMPLETE: ${samp.work.title} dossiers=${parsed.dossiers.length} facets=${facetCount}`);
}
