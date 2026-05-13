/**
 * 阶段 15a-4：受保护字段清单与读写工具
 *
 * 设计：
 * - 每张表登记一组 *字段路径*：
 *   - `column` 形式：整列即敏感字符串（如 `scheduler_tasks.webhook_secret`）
 *   - `jsonPath` 形式：列存 JSON，对其中指定 dot-path 子字段加密（如 `im_channels.config.app_secret`）
 * - 提供 `encryptRowFields(table, row)` / `decryptRowFields(table, row)` 路径式工具，幂等：
 *   - 加密：明文加密；已加密的原样
 *   - 解密：密文解密；明文兼容期原样
 * - 主密钥未就位时：解密走旁路返回 `null` 并写 `secret.decryptFailed` 事件，**不抛错**——
 *   保证启动不崩，UI 可走"主密钥缺失"提示。
 *
 * 不在本 PR：
 *   - `mcp_servers.env` 通配符匹配（按 `*_KEY` / `*_TOKEN` key pattern 加密）—— 留 15.x
 *   - `key_value_store.email.smtp.config.password` —— 15c 用，登记位预留
 */

import {
  decrypt,
  decryptOrPassthrough,
  encryptOrPassthrough,
  isEncrypted,
  loadMasterKey,
} from '../auth/crypto.js';
import { recordEvent } from '../observability/traceStore.js';

export interface JsonPathField {
  kind: 'jsonPath';
  /** 含 JSON 字符串的列名 */
  column: string;
  /** dot-path，例如 `app_secret`、`oauth.refresh_token` */
  path: string;
  /** 仅当行内 key 列匹配时生效（用于 key_value_store 等共享表） */
  keyMatch?: string;
}

export interface ColumnField {
  kind: 'column';
  /** 整列即敏感字符串 */
  column: string;
}

export type SecretField = JsonPathField | ColumnField;

/**
 * 受保护字段清单（按表名）。
 *
 * im_channels.config 是已知会落明文的 JSON 列（特别是飞书扫码安装把 app_id / app_secret 写入）。
 * Telegram 走 *_env 引用进程环境变量，不入库，所以不在此清单。
 */
export const SECRET_FIELDS: Record<string, SecretField[]> = {
  im_channels: [
    { kind: 'jsonPath', column: 'config', path: 'app_secret' },
    { kind: 'jsonPath', column: 'config', path: 'webhook_secret' },
    { kind: 'jsonPath', column: 'config', path: 'token' },
  ],
  scheduler_tasks: [{ kind: 'column', column: 'webhook_secret' }],
  key_value_store: [{ kind: 'jsonPath', column: 'value', path: 'password', keyMatch: 'email.smtp.config' }],
};

/** 仅供测试：替换 SECRET_FIELDS 一个分片 */
export function _patchSecretFieldsForTest(table: string, fields: SecretField[]): () => void {
  const before = SECRET_FIELDS[table];
  SECRET_FIELDS[table] = fields;
  return () => {
    if (before === undefined) delete SECRET_FIELDS[table];
    else SECRET_FIELDS[table] = before;
  };
}

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
    if (next === null || typeof next !== 'object') return; // 父级缺失：写入跳过
    cur = next as Record<string, unknown>;
  }
  cur[segments[segments.length - 1]] = value;
}

/** Row 对象的浅拷贝；JSON 列拷贝时仅 stringify→parse 来与原对象解耦 */
function shallowCloneRow(row: Record<string, unknown>): Record<string, unknown> {
  return { ...row };
}

function parseJsonColumn(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return { ...(value as Record<string, unknown>) };
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function getColumnIsString(value: unknown): value is string {
  return typeof value === 'string';
}

function matchesKeyConstraint(
  field: SecretField,
  rowOrContext: Record<string, unknown> | { key?: string } | undefined
): boolean {
  if (field.kind !== 'jsonPath' || !field.keyMatch) return true;
  const keyValue =
    rowOrContext && 'key' in rowOrContext ? rowOrContext.key : undefined;
  return typeof keyValue === 'string' && keyValue === field.keyMatch;
}

/**
 * 加密一行：返回新 row，敏感字段就地替换为密文（明文 → enc:v1，已加密原样）。
 *
 * - 不存在的字段静默跳过
 * - JSON 列不可解析则跳过该列（不影响其他字段）
 * - 主密钥未就位时抛 'master-key-missing' —— 调用方应先确保 ensureMasterKey
 */
export function encryptRowFields<T extends Record<string, unknown>>(table: string, row: T): T {
  const fields = SECRET_FIELDS[table];
  if (!fields || fields.length === 0) return row;
  const out = shallowCloneRow(row) as Record<string, unknown>;
  // 收集每列的最新 JSON 对象（同一列可能多 path）
  const jsonColumns = new Map<string, Record<string, unknown>>();

  for (const f of fields) {
    if (f.kind === 'column') {
      const v = out[f.column];
      if (getColumnIsString(v) && v.length > 0) {
        out[f.column] = encryptOrPassthrough(v);
      }
      continue;
    }
    if (!matchesKeyConstraint(f, out)) continue;
    // jsonPath
    let obj = jsonColumns.get(f.column);
    if (!obj) {
      const parsed = parseJsonColumn(out[f.column]);
      if (!parsed) continue;
      obj = parsed;
      jsonColumns.set(f.column, obj);
    }
    const cur = getByPath(obj, f.path);
    if (typeof cur === 'string' && cur.length > 0) {
      setByPath(obj, f.path, encryptOrPassthrough(cur));
    }
  }

  for (const [col, obj] of jsonColumns) {
    out[col] = JSON.stringify(obj);
  }
  return out as T;
}

/**
 * 解密一行：返回新 row，敏感字段还原为明文（密文 → 明文，明文原样）。
 *
 * 失败处理：
 *   - master-key-missing：受保护字段被替换为 null，并写 `secret.decryptFailed` 事件；其余字段不变
 *   - 其它解密错（auth-tag 不通过 / 格式异常）：当前字段替换为 null + 写事件，其余继续
 */
export function decryptRowFields<T extends Record<string, unknown>>(table: string, row: T): T {
  const fields = SECRET_FIELDS[table];
  if (!fields || fields.length === 0) return row;

  const masterPresent = loadMasterKey() !== null;
  const out = shallowCloneRow(row) as Record<string, unknown>;
  // 注意：JSON 列在加密后已是 string；为了解密回 JSON 子字段，需先 parse
  const jsonColumns = new Map<string, Record<string, unknown>>();

  for (const f of fields) {
    if (f.kind === 'column') {
      const v = out[f.column];
      if (!getColumnIsString(v)) continue;
      if (!isEncrypted(v)) continue; // 兼容期明文：直读
      if (!masterPresent) {
        out[f.column] = null;
        recordEvent({
          category: 'secret.decryptFailed',
          status: 'error',
          meta: { table, field: f.column, reason: 'master-key-missing' },
        });
        continue;
      }
      try {
        out[f.column] = decrypt(v);
      } catch (e) {
        out[f.column] = null;
        recordEvent({
          category: 'secret.decryptFailed',
          status: 'error',
          meta: { table, field: f.column, reason: (e as Error).message.split(':')[0] },
        });
      }
      continue;
    }
    if (!matchesKeyConstraint(f, out)) continue;
    // jsonPath
    let obj = jsonColumns.get(f.column);
    if (!obj) {
      const parsed = parseJsonColumn(out[f.column]);
      if (!parsed) continue;
      obj = parsed;
      jsonColumns.set(f.column, obj);
    }
    const cur = getByPath(obj, f.path);
    if (typeof cur !== 'string') continue;
    if (!isEncrypted(cur)) continue;
    if (!masterPresent) {
      setByPath(obj, f.path, null);
      recordEvent({
        category: 'secret.decryptFailed',
        status: 'error',
        meta: { table, field: `${f.column}.${f.path}`, reason: 'master-key-missing' },
      });
      continue;
    }
    try {
      setByPath(obj, f.path, decrypt(cur));
    } catch (e) {
      setByPath(obj, f.path, null);
      recordEvent({
        category: 'secret.decryptFailed',
        status: 'error',
        meta: { table, field: `${f.column}.${f.path}`, reason: (e as Error).message.split(':')[0] },
      });
    }
  }

  for (const [col, obj] of jsonColumns) {
    out[col] = JSON.stringify(obj);
  }
  // 调用方往往希望 JSON 列以对象形式返回；本工具只保证写入 row 的列与读时一致，
  // 由具体 store 决定是否再 parse —— im/store.ts 的 rowToConfig 仍会 JSON.parse。
  return out as T;
}

/**
 * 直接对一个已经 parse 过的 JSON 对象做加解密（针对 path 子字段）。
 * 在 list/get 路径上比 row → JSON.stringify → row 一来一回更高效。
 */
export function encryptJsonObject(
  table: string,
  column: string,
  obj: Record<string, unknown>,
  options?: { key?: string }
): Record<string, unknown> {
  const fields = (SECRET_FIELDS[table] ?? []).filter(
    (f): f is JsonPathField =>
      f.kind === 'jsonPath' &&
      f.column === column &&
      matchesKeyConstraint(f, options)
  );
  if (fields.length === 0) return obj;
  const out = { ...obj };
  for (const f of fields) {
    const cur = getByPath(out, f.path);
    if (typeof cur === 'string' && cur.length > 0) {
      setByPath(out, f.path, encryptOrPassthrough(cur));
    }
  }
  return out;
}

export function decryptJsonObject(
  table: string,
  column: string,
  obj: Record<string, unknown>,
  options?: { key?: string }
): Record<string, unknown> {
  const fields = (SECRET_FIELDS[table] ?? []).filter(
    (f): f is JsonPathField =>
      f.kind === 'jsonPath' &&
      f.column === column &&
      matchesKeyConstraint(f, options)
  );
  if (fields.length === 0) return obj;
  const masterPresent = loadMasterKey() !== null;
  const out = { ...obj };
  for (const f of fields) {
    const cur = getByPath(out, f.path);
    if (typeof cur !== 'string') continue;
    if (!isEncrypted(cur)) continue;
    if (!masterPresent) {
      setByPath(out, f.path, null);
      recordEvent({
        category: 'secret.decryptFailed',
        status: 'error',
        meta: { table, field: `${column}.${f.path}`, reason: 'master-key-missing' },
      });
      continue;
    }
    try {
      setByPath(out, f.path, decrypt(cur));
    } catch (e) {
      setByPath(out, f.path, null);
      recordEvent({
        category: 'secret.decryptFailed',
        status: 'error',
        meta: { table, field: `${column}.${f.path}`, reason: (e as Error).message.split(':')[0] },
      });
    }
  }
  return out;
}
