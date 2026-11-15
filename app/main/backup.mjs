import { sqliteTasks } from './sqlite-tasks.mjs';
import { copyFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, renameSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';
import yazl from 'yazl';
import { databaseVersion, fail } from './store.mjs';

const databaseEntry = 'library.sqlite';
const manifestEntry = 'manifest.json';
const referenceEntry = 'reference-v2.sqlite';
const backupFormat = 'novel-studio-backup-1';
const maxDatabase = 8 * 1024 * 1024 * 1024;

function remove(filename) {
  try {
    unlinkSync(filename);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function digest(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

function signature(db) {
  return JSON.stringify(db.prepare('SELECT type,name,sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY type,name').all());
}

function verifyDatabase(filename, expectedSignature, expectedVersion = databaseVersion) {
  return sqliteTasks.run({method:'verify',filename,signature:expectedSignature,version:expectedVersion});
}
function snapshot(store,target){return sqliteTasks.run({method:'snapshot',filename:store.filename,target});}

async function readBackup(filename, staged, stagedReference) {
  const zip = await new Promise((resolve, reject) => {
    yauzl.open(filename, { lazyEntries: true, strictFileNames: true }, (error, file) => error ? reject(error) : resolve(file));
  });
  let manifest;
  const members = new Set();
  try {
    await new Promise((resolve, reject) => {
      zip.on('entry', async entry => {
        try {
          const name = entry.fileName;
          const cap = name === manifestEntry ? 8192 : maxDatabase;
          const mode = (entry.externalFileAttributes >>> 16) & 0xf000;
          if (![databaseEntry, referenceEntry, manifestEntry].includes(name) || members.has(name) ||
              entry.uncompressedSize > cap || (mode && mode !== 0x8000)) fail('BACKUP_ZIP', '备份 ZIP 包含异常文件或大小超限');
          members.add(name);
          const stream = await new Promise((ready, failed) => zip.openReadStream(entry, (error, file) => error ? failed(error) : ready(file)));
          if (name === databaseEntry || name === referenceEntry) {
            await pipeline(stream, createWriteStream(name === databaseEntry ? staged : stagedReference, { flags: 'wx' }));
          } else {
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
          }
          zip.readEntry();
        } catch (error) {
          reject(error);
        }
      });
      zip.on('error', reject);
      zip.on('end', resolve);
      zip.readEntry();
    });
  } finally {
    zip.close();
  }
  if (![backupFormat, 'novel-studio-backup-2'].includes(manifest?.format) || manifest.database_version !== databaseVersion || !members.has(databaseEntry)) {
    fail('BACKUP_FORMAT', '缺少必要文件或备份版本不受支持');
  }
  if (manifest.sha256 !== await digest(staged)) fail('BACKUP_HASH', '备份资料库的 SHA-256 校验失败');
  const hasReference = members.has(referenceEntry);
  if (hasReference !== Boolean(manifest.reference) || (manifest.format === 'novel-studio-backup-2') !== hasReference) fail('BACKUP_FORMAT', '参考库备份声明与内容不符');
  if (hasReference && manifest.reference.sha256 !== await digest(stagedReference)) fail('BACKUP_HASH', '参考库备份 SHA-256 校验失败');
  return manifest;
}

export class BackupService {
  constructor(store, referenceStore = null, {replace=renameSync,copy=copyFile}={}) {
    this.store = store;this.replace=replace;this.copy=copy;
    this.referenceStore = referenceStore;
  }

  async export(filename) {
    const tempDb = join(dirname(this.store.filename), `snapshot-${randomUUID()}.sqlite`);
    const tempZip = join(dirname(filename), `.backup-${randomUUID()}.tmp`);
    const tempReference = join(dirname(this.store.filename), `reference-snapshot-${randomUUID()}.sqlite`);
    try {
      await snapshot(this.store,tempDb);
      await verifyDatabase(tempDb, signature(this.store.db));
      if (this.referenceStore) {
        await snapshot(this.referenceStore,tempReference);
        await verifyDatabase(tempReference, signature(this.referenceStore.db), this.referenceStore.db.prepare('PRAGMA user_version').get().user_version);
      }
      const zip = new yazl.ZipFile();
      const manifest = {
        format: backupFormat, database_version: databaseVersion,
        created: new Date().toISOString(), sha256: await digest(tempDb)
      };
      if (this.referenceStore) {
        manifest.format = 'novel-studio-backup-2';
        manifest.reference = { version: this.referenceStore.db.prepare('PRAGMA user_version').get().user_version, sha256: await digest(tempReference) };
        zip.addFile(tempReference, referenceEntry);
      }
      zip.addBuffer(Buffer.from(JSON.stringify(manifest)), manifestEntry);
      zip.addFile(tempDb, databaseEntry);
      zip.end();
      await pipeline(zip.outputStream, createWriteStream(tempZip, { flags: 'wx' }));
      renameSync(tempZip, filename);
      return { filename, sha256: manifest.sha256 };
    } finally {
      remove(tempDb);
      remove(tempReference);
      remove(tempZip);
    }
  }

  async restore(filename) {
    const directory = dirname(this.store.filename);
    const staged = join(directory, `incoming-${randomUUID()}.sqlite`);
    const stagedReference = join(directory, `incoming-reference-${randomUUID()}.sqlite`);
    const previous = join(directory, `before-restore-${randomUUID()}.sqlite`);
    const previousReference = join(directory, `before-reference-restore-${randomUUID()}.sqlite`);
    try {
      const manifest = await readBackup(filename, staged, stagedReference);
      await verifyDatabase(staged, signature(this.store.db));
      if (manifest.reference && !this.referenceStore) fail('BACKUP_REFERENCE', '此备份包含新版参考库，请先启用新版参考库再恢复');
      if (manifest.reference) {
        const expectedVersion = this.referenceStore.db.prepare('PRAGMA user_version').get().user_version;
        if (manifest.reference.version !== expectedVersion) fail('BACKUP_SCHEMA', '参考库版本不兼容');
        await verifyDatabase(stagedReference, signature(this.referenceStore.db), expectedVersion);
      }
      const targets = [{ store: this.store, staged, previous }];
      if (manifest.reference) targets.push({ store: this.referenceStore, staged: stagedReference, previous: previousReference });
      for (const target of targets) {
        await snapshot(target.store,target.previous);
        await verifyDatabase(target.previous, signature(target.store.db), target.store.db.prepare('PRAGMA user_version').get().user_version);
      }
      for (const target of targets) target.store.close();
      let replacementStarted = false;
      try {
        for (const target of targets) {
          if (existsSync(target.store.filename + '-wal') || existsSync(target.store.filename + '-shm')) fail('BACKUP_BUSY', '仍有进程打开资料库，恢复已停止');
        }
        replacementStarted = true;
        for (const target of targets) this.replace(target.staged, target.store.filename);
        for (const target of targets) target.store.open();
      } catch (error) {
        for (const target of targets) target.store.close();
        const recoveryErrors=[];
        if (replacementStarted) {
          for (const target of targets) {
            try {
              try {
                await this.copy(target.previous, target.staged);
                this.replace(target.staged, target.store.filename);
              } catch {
                // A full disk must not prevent rollback. The verified snapshot is
                // on this same volume; rename it back without allocating a copy.
                this.replace(target.previous, target.store.filename);
              }
            } catch (failure) { recoveryErrors.push(failure); }
          }
        }
        for (const target of targets) {
          try { target.store.open(); } catch (failure) { recoveryErrors.push(failure); }
        }
        if(recoveryErrors.length)throw Object.assign(new Error('恢复未完成，部分文件仍被占用；已保留可用的恢复前快照，请停止写作并检查资料目录。'),{code:'BACKUP_ROLLBACK',details:{snapshots:targets.map(t=>t.previous).filter(existsSync)}});
        throw error;
      }
      return { previous, previousReference: manifest.reference ? previousReference : null, referenceRestored: Boolean(manifest.reference) };
    } finally {
      remove(staged);
      remove(stagedReference);
    }
  }
}
