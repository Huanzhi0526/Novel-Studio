import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, createReadStream, createWriteStream, existsSync, renameSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { DatabaseSync } from 'node:sqlite';
import yauzl from 'yauzl';
import yazl from 'yazl';
import { databaseVersion, fail } from './store.mjs';

const databaseEntry = 'library.sqlite';
const manifestEntry = 'manifest.json';
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

function verifyDatabase(filename, expectedSignature) {
  const db = new DatabaseSync(filename, { readOnly: true });
  try {
    db.exec('PRAGMA trusted_schema=OFF; PRAGMA query_only=ON;');
    if (db.prepare('PRAGMA user_version').get().user_version !== databaseVersion || signature(db) !== expectedSignature) {
      fail('BACKUP_SCHEMA', '备份资料库版本或表结构与当前应用不兼容');
    }
    if (db.prepare('PRAGMA quick_check').get().quick_check !== 'ok' || db.prepare('PRAGMA foreign_key_check').get()) {
      fail('BACKUP_INTEGRITY', '备份资料库完整性校验未通过');
    }
  } finally {
    db.close();
  }
}

async function readBackup(filename, staged) {
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
          if (![databaseEntry, manifestEntry].includes(name) || members.has(name) ||
              entry.uncompressedSize > cap || (mode && mode !== 0x8000)) fail('BACKUP_ZIP', '备份 ZIP 包含异常文件或大小超限');
          members.add(name);
          const stream = await new Promise((ready, failed) => zip.openReadStream(entry, (error, file) => error ? failed(error) : ready(file)));
          if (name === databaseEntry) {
            await pipeline(stream, createWriteStream(staged, { flags: 'wx' }));
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
  if (manifest?.format !== backupFormat || manifest.database_version !== databaseVersion || !members.has(databaseEntry)) {
    fail('BACKUP_FORMAT', '缺少必要文件或备份版本不受支持');
  }
  if (manifest.sha256 !== await digest(staged)) fail('BACKUP_HASH', '备份资料库的 SHA-256 校验失败');
}

export class BackupService {
  constructor(store) {
    this.store = store;
  }

  async export(filename) {
    const tempDb = join(dirname(this.store.filename), `snapshot-${randomUUID()}.sqlite`);
    const tempZip = join(dirname(filename), `.backup-${randomUUID()}.tmp`);
    try {
      this.store.db.prepare('VACUUM INTO ?').run(tempDb);
      verifyDatabase(tempDb, signature(this.store.db));
      const zip = new yazl.ZipFile();
      const manifest = {
        format: backupFormat, database_version: databaseVersion,
        created: new Date().toISOString(), sha256: await digest(tempDb)
      };
      zip.addBuffer(Buffer.from(JSON.stringify(manifest)), manifestEntry);
      zip.addFile(tempDb, databaseEntry);
      zip.end();
      await pipeline(zip.outputStream, createWriteStream(tempZip, { flags: 'wx' }));
      renameSync(tempZip, filename);
      return { filename, sha256: manifest.sha256 };
    } finally {
      remove(tempDb);
      remove(tempZip);
    }
  }

  async restore(filename) {
    const { store } = this;
    const directory = dirname(store.filename);
    const staged = join(directory, `incoming-${randomUUID()}.sqlite`);
    const previous = join(directory, `before-restore-${randomUUID()}.sqlite`);
    try {
      await readBackup(filename, staged);
      verifyDatabase(staged, signature(store.db));
      store.db.prepare('VACUUM INTO ?').run(previous);
      verifyDatabase(previous, signature(store.db));
      store.close();
      try {
        if (existsSync(store.filename + '-wal') || existsSync(store.filename + '-shm')) {
          fail('BACKUP_BUSY', '仍有进程打开资料库，恢复已停止');
        }
        renameSync(staged, store.filename);
      } catch (error) {
        store.open();
        throw error;
      }
      try {
        store.open();
      } catch (error) {
        copyFileSync(previous, staged);
        renameSync(staged, store.filename);
        store.open();
        throw error;
      }
      return { previous };
    } finally {
      remove(staged);
    }
  }
}
