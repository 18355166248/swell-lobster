/**
 * 阶段 15a-4：受保护字段加密迁移
 *
 * 6 步过程化（与计划文档 R5 对齐）：
 *   1. 启动顺序：tokenStore → masterKey → migrateExistingSecrets；主密钥未就位时 noop
 *   2. createBackup() 走现有 db/backup.ts，备份目录路径写入事件供回滚识别
 *   3. 单事务内：扫描 SECRET_FIELDS 清单中所有未加密字段
 *      a. 逐条 encrypt，立即 decrypt 与原值比对 —— 不一致则 throw → 事务回滚
 *      b. 成功条数累加，写 secret.migrated 事件（不打印原值）
 *   4. 提交事务后随机抽 N 条解密复核（防漏改）
 *   5. 任一阶段失败 → 抛错；调用方决定是否走备份恢复（启动期建议直接 fail-fast，
 *      让 Settings/Security 提示用户修复后重启）
 *   6. 主密钥丢失（masterKey 已记 enc 但 key 丢）→ migrate 不参与；解密旁路返回 null
 *      并写 secret.decryptFailed —— 见 secretFields.ts
 */

import type Database from 'better-sqlite3';

import { decrypt, encrypt, isEncrypted, loadMasterKey } from '../auth/crypto.js';
import { getDb } from '../db/index.js';
import { recordEvent } from '../observability/traceStore.js';
import { SECRET_FIELDS, type SecretField } from './secretFields.js';

export interface MigrateResult {
  /** 主密钥未就位时 status='skipped'（启动 noop） */
  status: 'skipped' | 'ok' | 'failed';
  /** 实际加密的字段值数（一行多字段计多次） */
  encryptedCount: number;
  /** 抽样校验数 */
  sampledCount: number;
  /** 失败原因（status='failed' 时） */
  reason?: string;
}

interface ColumnPlan {
  /** 表名 */
  table: string;
  /** 主键列名（默认 'id'） */
  idColumn: string;
  /** 该表的字段路径 */
  fields: SecretField[];
}

const TABLE_PLANS: ColumnPlan[] = [
  { table: 'im_channels', idColumn: 'id', fields: SECRET_FIELDS.im_channels ?? [] },
  { table: 'scheduler_tasks', idColumn: 'id', fields: SECRET_FIELDS.scheduler_tasks ?? [] },
  { table: 'key_value_store', idColumn: 'key', fields: SECRET_FIELDS.key_value_store ?? [] },
];

function getByPath(obj: Record<string, unknown>, path: string): unknown {
  const segments = path.split('.');
  let cur: unknown = obj;
  for (const seg of segments) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

function setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split('.');
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    const next = cur[seg];
    if (next === null || typeof next !== 'object') return;
    cur = next as Record<string, unknown>;
  }
  cur[segments[segments.length - 1]] = value;
}

function tableExists(db: Database.Database, table: string): boolean {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`)
    .get(table) as { name?: string } | undefined;
  return Boolean(row?.name);
}

function columnsForTable(db: Database.Database, table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return new Set(rows.map((r) => r.name));
}

interface FieldUpdate {
  table: string;
  id: string | number;
  /** 该行需要写回的 column → 新值 */
  columnUpdates: Record<string, string>;
  /** 新增的"已加密字段计数"（用于事件统计） */
  delta: number;
}

/**
 * 主入口：扫描 → 加密 → 校验 → 提交。返回结果（status='skipped' 当主密钥不存在）。
 *
 * 不会抛错；失败时返回 `{ status: 'failed', reason }` 让调用方决定动作。
 * 备份由调用方负责，避免与启动序列耦合。
 */
export function migrateExistingSecrets(): MigrateResult {
  const masterKey = loadMasterKey();
  if (!masterKey) {
    return { status: 'skipped', encryptedCount: 0, sampledCount: 0 };
  }

  const db = getDb();
  const updates: FieldUpdate[] = [];
  let encryptedCount = 0;

  try {
    for (const plan of TABLE_PLANS) {
      if (plan.fields.length === 0) continue;
      if (!tableExists(db, plan.table)) continue;

      const existingColumns = columnsForTable(db, plan.table);
      const relevantColumns = new Set<string>();
      for (const f of plan.fields) relevantColumns.add(f.column);
      // 只 SELECT 与字段相关的列，最小化事务暴露面
      const selectCols = [plan.idColumn, ...Array.from(relevantColumns)].filter((c) =>
        existingColumns.has(c)
      );
      if (selectCols.length <= 1) continue; // 表存在但相关列还没就位，跳过

      const rows = db
        .prepare(`SELECT ${selectCols.map((c) => `"${c}"`).join(', ')} FROM "${plan.table}"`)
        .all() as Array<Record<string, unknown>>;

      for (const row of rows) {
        const id = row[plan.idColumn] as string | number;
        if (id === undefined || id === null) continue;

        const columnUpdates: Record<string, string> = {};
        let rowDelta = 0;

        // 收集每列的 JSON 对象（同列多 path 共享一个对象）
        const jsonColumns = new Map<string, Record<string, unknown>>();

        for (const f of plan.fields) {
          if (!existingColumns.has(f.column)) continue;
          if (f.kind === 'column') {
            const v = row[f.column];
            if (typeof v !== 'string' || v.length === 0) continue;
            if (isEncrypted(v)) continue; // 已加密
            const ct = encrypt(v);
            // 自校验：解密回比对
            if (decrypt(ct) !== v) {
              throw new Error(`encrypt/decrypt round-trip mismatch at ${plan.table}.${f.column}`);
            }
            columnUpdates[f.column] = ct;
            rowDelta += 1;
            continue;
          }
          if (f.keyMatch && row['key'] !== f.keyMatch) continue;
          // jsonPath
          let obj = jsonColumns.get(f.column);
          if (!obj) {
            const raw = row[f.column];
            if (typeof raw !== 'string') continue;
            try {
              const parsed = JSON.parse(raw);
              if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
              obj = parsed as Record<string, unknown>;
              jsonColumns.set(f.column, obj);
            } catch {
              continue;
            }
          }
          const cur = getByPath(obj, f.path);
          if (typeof cur !== 'string' || cur.length === 0) continue;
          if (isEncrypted(cur)) continue;
          const ct = encrypt(cur);
          if (decrypt(ct) !== cur) {
            throw new Error(
              `encrypt/decrypt round-trip mismatch at ${plan.table}.${f.column}.${f.path}`
            );
          }
          setByPath(obj, f.path, ct);
          rowDelta += 1;
        }

        for (const [col, obj] of jsonColumns) {
          if (rowDelta > 0) {
            columnUpdates[col] = JSON.stringify(obj);
          }
        }

        if (rowDelta > 0) {
          updates.push({ table: plan.table, id, columnUpdates, delta: rowDelta });
          encryptedCount += rowDelta;
        }
      }
    }

    if (updates.length === 0) {
      // 没有未加密字段，nothing to do
      return { status: 'ok', encryptedCount: 0, sampledCount: 0 };
    }

    // 在事务内逐条写回；任意失败则整体回滚
    const txn = db.transaction((batch: FieldUpdate[]) => {
      for (const u of batch) {
        const cols = Object.keys(u.columnUpdates);
        if (cols.length === 0) continue;
        const setClause = cols.map((c) => `"${c}" = ?`).join(', ');
        const values = cols.map((c) => u.columnUpdates[c]);
        db.prepare(`UPDATE "${u.table}" SET ${setClause} WHERE id = ?`).run(...values, u.id);
      }
    });
    txn(updates);

    // 提交后抽样校验：随机选 min(updates.length, 5) 条解密复核
    const sampleSize = Math.min(updates.length, 5);
    const sampleIdx = pickSampleIndices(updates.length, sampleSize);
    let sampledCount = 0;
    for (const idx of sampleIdx) {
      const u = updates[idx];
      const cols = Object.keys(u.columnUpdates)
        .map((c) => `"${c}"`)
        .join(', ');
      const fresh = db.prepare(`SELECT ${cols} FROM "${u.table}" WHERE id = ?`).get(u.id) as
        | Record<string, unknown>
        | undefined;
      if (!fresh) throw new Error(`sample row not found: ${u.table}#${u.id}`);
      for (const col of Object.keys(u.columnUpdates)) {
        const stored = fresh[col];
        if (typeof stored !== 'string')
          throw new Error(`sample column not string: ${u.table}.${col}`);
        // 整列加密时直接解密
        if (isEncrypted(stored)) {
          decrypt(stored); // 仅校验能解（值正确性已经在事务前对比过）
        } else {
          // JSON 列：parse 后查 path 子字段
          const parsed = JSON.parse(stored) as Record<string, unknown>;
          for (const f of (SECRET_FIELDS[u.table] ?? []).filter(
            (x): x is SecretField & { kind: 'jsonPath'; path: string } =>
              x.kind === 'jsonPath' &&
              x.column === col &&
              (!x.keyMatch || fresh['key'] === x.keyMatch)
          )) {
            const v = getByPath(parsed, f.path);
            if (typeof v === 'string' && isEncrypted(v)) decrypt(v);
          }
        }
      }
      sampledCount += 1;
    }

    recordEvent({
      category: 'secret.migrated',
      status: 'ok',
      meta: { rows: updates.length, fields: encryptedCount, sampled: sampledCount },
    });

    return { status: 'ok', encryptedCount, sampledCount };
  } catch (e) {
    const reason = (e as Error).message;
    recordEvent({
      category: 'secret.migrated',
      status: 'error',
      meta: { rows: updates.length, fields: encryptedCount, reason },
    });
    return { status: 'failed', encryptedCount, sampledCount: 0, reason };
  }
}

/** 取 [0..total) 内 size 个不重复的索引（小集合用洗牌） */
function pickSampleIndices(total: number, size: number): number[] {
  const arr = Array.from({ length: total }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, size);
}
