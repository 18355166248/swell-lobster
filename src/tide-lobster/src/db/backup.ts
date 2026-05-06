import {
  mkdirSync,
  readdirSync,
  statSync,
  cpSync,
  existsSync,
  renameSync,
  copyFileSync,
} from 'node:fs';
import { join, basename } from 'node:path';
import { getDb } from './index.js';
import { settings } from '../config.js';

const BACKUPS_DIR = join(settings.dataDir, 'backups');
const DB_FILENAME = 'tide-lobster.db';
const DB_PATH = join(settings.dataDir, DB_FILENAME);

function ensureBackupsDir(): void {
  mkdirSync(BACKUPS_DIR, { recursive: true });
}

export interface BackupEntry {
  name: string;
  path: string;
  createdAt: string;
  sizeBytes: number;
}

function dirSizeBytes(dirPath: string): number {
  let total = 0;
  try {
    for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
      const full = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        total += dirSizeBytes(full);
      } else {
        total += statSync(full).size;
      }
    }
  } catch {
    // 忽略无法访问的文件
  }
  return total;
}

export async function createBackup(): Promise<BackupEntry> {
  ensureBackupsDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupName = `backup-${timestamp}`;
  const backupPath = join(BACKUPS_DIR, backupName);
  mkdirSync(backupPath, { recursive: true });

  const db = getDb();
  await (db as unknown as { backup: (dest: string) => Promise<void> }).backup(
    join(backupPath, DB_FILENAME)
  );

  const dataEntries = ['config', 'identity', 'memories'];
  for (const entry of dataEntries) {
    const src = join(settings.dataDir, entry);
    if (existsSync(src)) {
      cpSync(src, join(backupPath, entry), { recursive: true });
    }
  }

  return {
    name: backupName,
    path: backupPath,
    createdAt: new Date().toISOString(),
    sizeBytes: dirSizeBytes(backupPath),
  };
}

export function listBackups(): BackupEntry[] {
  ensureBackupsDir();
  try {
    return readdirSync(BACKUPS_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith('backup-'))
      .map((e) => {
        const dirPath = join(BACKUPS_DIR, e.name);
        const stat = statSync(dirPath);
        return {
          name: e.name,
          path: dirPath,
          createdAt: stat.birthtime.toISOString(),
          sizeBytes: dirSizeBytes(dirPath),
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export async function restoreBackup(name: string): Promise<void> {
  const backupPath = join(BACKUPS_DIR, basename(name));
  if (!existsSync(backupPath)) {
    throw new Error(`backup not found: ${name}`);
  }

  const restoredDb = join(backupPath, DB_FILENAME);
  if (!existsSync(restoredDb)) {
    throw new Error(`invalid backup: ${DB_FILENAME} not found`);
  }

  const dbBak = DB_PATH + '.pre-restore';
  copyFileSync(DB_PATH, dbBak);
  try {
    copyFileSync(restoredDb, DB_PATH);
  } catch (e) {
    copyFileSync(dbBak, DB_PATH);
    throw e;
  }

  const dataEntries = ['config', 'identity', 'memories'];
  for (const entry of dataEntries) {
    const src = join(backupPath, entry);
    const dest = join(settings.dataDir, entry);
    if (existsSync(src)) {
      const bakDest = dest + '.pre-restore';
      if (existsSync(dest)) {
        renameSync(dest, bakDest);
      }
      cpSync(src, dest, { recursive: true });
    }
  }
}
