import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const defaultLibrary = join(process.env.LOCALAPPDATA || '', 'Novel Studio', 'library.sqlite');
const libraryPath = resolve(process.argv[2] || defaultLibrary);
const exportScript = resolve('scripts/export-reference-input.mjs');
const samplesRoot = resolve('.local/kb-v2-mvp/samples');
const reportsRoot = resolve('.local/kb-v2-mvp/reports');

mkdirSync(samplesRoot, { recursive: true });
mkdirSync(reportsRoot, { recursive: true });

if (!existsSync(libraryPath)) {
  throw new Error(`找不到源参考数据库: ${libraryPath}`);
}

function runExportCli(args) {
  const out = execFileSync(
    process.execPath,
    ['--disable-warning=ExperimentalWarning', exportScript, ...args],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true }
  );
  return JSON.parse(out);
}

const works = runExportCli(['list', libraryPath]).filter(w => !w.archived);
console.log(`[Export All] Found ${works.length} active reference works in read-only source DB.`);

const manifest = {
  exportedAt: new Date().toISOString(),
  sourceLibrary: libraryPath,
  totalWorks: works.length,
  totalVolumes: 0,
  totalBlocks: 0,
  works: []
};

for (let i = 0; i < works.length; i++) {
  const w = works[i];
  const outDir = join(samplesRoot, w.work_id);
  const resultFile = join(outDir, 'result.json');

  if (existsSync(resultFile)) {
    const existing = JSON.parse(readFileSync(resultFile, 'utf8'));
    const blocks = existing.volumes.reduce((n, v) => n + v.normalized_payload.blocks.length, 0);
    manifest.totalVolumes += existing.volumes.length;
    manifest.totalBlocks += blocks;
    manifest.works.push({
      index: i + 1,
      work_id: w.work_id,
      title: w.title,
      volumes: existing.volumes.length,
      blocks,
      resources: existing.resources?.length ?? 0,
      status: 'cached'
    });
    console.log(`  [${i + 1}/${works.length}] [Cached] ${w.title} (${existing.volumes.length} vols, ${blocks} blocks)`);
    continue;
  }

  const listing = runExportCli(['list', libraryPath, w.work_id]);
  // Revisions are ordered by imported DESC per volume; pick latest revision per volume_id
  const seenVolumes = new Set();
  const selection = [];
  for (const rev of listing.revisions) {
    if (seenVolumes.has(rev.volume_id)) continue;
    seenVolumes.add(rev.volume_id);
    selection.push(`${rev.volume_id}@${rev.revision_id}`);
  }
  if (!selection.length) {
    throw new Error(`作品无可用分卷修订: ${w.title} (${w.work_id})`);
  }

  const exported = runExportCli(['export', libraryPath, w.work_id, outDir, ...selection]);
  manifest.totalVolumes += exported.volumes;
  manifest.totalBlocks += exported.blocks;
  manifest.works.push({
    index: i + 1,
    work_id: w.work_id,
    title: w.title,
    volumes: exported.volumes,
    blocks: exported.blocks,
    resources: exported.resources,
    status: 'exported'
  });
  console.log(`  [${i + 1}/${works.length}] [Exported] ${w.title} (${exported.volumes} vols, ${exported.blocks} blocks, ${exported.resources} assets)`);
}

const manifestPath = join(reportsRoot, 'export-all-manifest.json');
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`\n[Export All Done] Works=${manifest.totalWorks}, Volumes=${manifest.totalVolumes}, Blocks=${manifest.totalBlocks}`);
