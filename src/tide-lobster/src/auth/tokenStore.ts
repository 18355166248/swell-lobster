/**
 * 阶段 15a-1：访问令牌存储
 *
 * 两类 token：
 * 1. 本机 token：单文件 `data/auth/local-token`（权限 0600），桌面端 sidecar 注入到请求头
 * 2. 远程 token：`auth_tokens` 表，仅存 sha256(token)，明文仅在创建接口一次性返回
 *
 * 中间件挂载与限流由 15a-2 落地，本模块只负责存储与校验。
 */

import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type Database from 'better-sqlite3';

import { settings } from '../config.js';
import { getDb } from '../db/index.js';

export type TokenScope = 'full';
export const TOKEN_SCOPES: readonly TokenScope[] = ['full'] as const;
export const DEFAULT_TOKEN_SCOPE: TokenScope = 'full';

/** 远程 token 行（脱敏：永不返回 token_hash） */
export interface RemoteTokenRow {
  id: number;
  label: string;
  scope: TokenScope;
  createdAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
}

/** 创建远程 token 的返回值，包含**仅显示一次**的明文 token */
export interface CreatedRemoteToken extends RemoteTokenRow {
  /** 32 字节随机 token 的 base64url 表示，**仅在创建时返回一次** */
  token: string;
}

/** verifyToken 命中结果 */
export type TokenVerification =
  | { kind: 'local'; scope: TokenScope }
  | { kind: 'remote'; tokenId: number; scope: TokenScope; label: string };

const LOCAL_TOKEN_BYTES = 32;
const REMOTE_TOKEN_BYTES = 32;
const FILE_MODE_0600 = 0o600;
const DIR_MODE_0700 = 0o700;

function localTokenPath(): string {
  return join(settings.dataDir, 'auth', 'local-token');
}

function ensureDir(path: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: DIR_MODE_0700 });
  }
}

function generateRandomToken(bytes: number): string {
  return randomBytes(bytes).toString('base64url');
}

function hashToken(plain: string): string {
  return createHash('sha256').update(plain).digest('hex');
}

function isValidScope(value: unknown): value is TokenScope {
  return typeof value === 'string' && (TOKEN_SCOPES as readonly string[]).includes(value);
}

/**
 * 读取本机 token；不存在则生成并落盘（0600）。
 * 由 Node 侧调用，作为 Tauri Rust `ensure_local_token` 不可用时的兜底；
 * 一旦 Rust 侧已写入文件，Node 侧直接读取即可，不重复生成。
 */
export function ensureLocalToken(): string {
  const path = localTokenPath();
  if (existsSync(path)) {
    const cached = readFileSync(path, 'utf8').trim();
    if (cached) return cached;
  }
  ensureDir(path);
  const token = generateRandomToken(LOCAL_TOKEN_BYTES);
  writeFileSync(path, token, { mode: FILE_MODE_0600 });
  try {
    chmodSync(path, FILE_MODE_0600);
  } catch {
    // Windows 等无 POSIX 权限的平台忽略
  }
  return token;
}

/** 仅读不创建；常用于校验链路与 ensureLocalToken 解耦的场景 */
export function readLocalTokenIfPresent(): string | null {
  const path = localTokenPath();
  if (!existsSync(path)) return null;
  const value = readFileSync(path, 'utf8').trim();
  return value || null;
}

/** 重置本机 token —— 删旧文件并立即生成新的；Settings/Security 的"重置本机 token"按钮使用 */
export function resetLocalToken(): string {
  const path = localTokenPath();
  ensureDir(path);
  const token = generateRandomToken(LOCAL_TOKEN_BYTES);
  writeFileSync(path, token, { mode: FILE_MODE_0600 });
  try {
    chmodSync(path, FILE_MODE_0600);
  } catch {
    // ignore
  }
  return token;
}

interface RawAuthRow {
  id: number;
  token_hash: string;
  label: string;
  scope: string;
  created_at: number;
  last_used_at: number | null;
  revoked_at: number | null;
}

function rowToPublic(row: RawAuthRow): RemoteTokenRow {
  return {
    id: row.id,
    label: row.label,
    scope: isValidScope(row.scope) ? row.scope : DEFAULT_TOKEN_SCOPE,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  };
}

interface CreateRemoteTokenInput {
  label: string;
  scope?: TokenScope;
}

/**
 * 生成新的远程 token，落 sha256 哈希。
 * 返回值含 **明文 token**——调用方仅可一次性透出给用户。
 */
export function createRemoteToken(input: CreateRemoteTokenInput): CreatedRemoteToken {
  const label = input.label?.trim();
  if (!label) {
    throw new Error('label is required');
  }
  if (label.length > 80) {
    throw new Error('label too long (max 80 chars)');
  }
  const scope: TokenScope = input.scope ?? DEFAULT_TOKEN_SCOPE;
  if (!isValidScope(scope)) {
    throw new Error(`invalid scope: ${String(scope)}`);
  }

  const plain = generateRandomToken(REMOTE_TOKEN_BYTES);
  const tokenHash = hashToken(plain);
  const createdAt = Date.now();

  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO auth_tokens (token_hash, label, scope, created_at) VALUES (?, ?, ?, ?)`
  );
  const info = stmt.run(tokenHash, label, scope, createdAt);
  const id = Number(info.lastInsertRowid);

  return {
    id,
    label,
    scope,
    createdAt,
    lastUsedAt: null,
    revokedAt: null,
    token: plain,
  };
}

interface ListOptions {
  /** 是否包含已撤销的 token；默认 false */
  includeRevoked?: boolean;
}

export function listRemoteTokens(options: ListOptions = {}): RemoteTokenRow[] {
  const db = getDb();
  const sql = options.includeRevoked
    ? `SELECT * FROM auth_tokens ORDER BY created_at DESC`
    : `SELECT * FROM auth_tokens WHERE revoked_at IS NULL ORDER BY created_at DESC`;
  const rows = db.prepare(sql).all() as RawAuthRow[];
  return rows.map(rowToPublic);
}

/** 撤销远程 token —— 幂等，返回是否实际改了行 */
export function revokeRemoteToken(id: number): boolean {
  const db = getDb();
  const info = db
    .prepare(`UPDATE auth_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL`)
    .run(Date.now(), id);
  return info.changes > 0;
}

/** 节流上限：同一 token 在 N 毫秒内只更新一次 last_used_at（避免高频写库） */
const TOUCH_THROTTLE_MS = 1000;

/** 中间件命中后调用；节流由本模块处理，调用方无需自己计时 */
export function touchRemoteToken(id: number, now: number = Date.now()): void {
  const db = getDb();
  const row = db.prepare(`SELECT last_used_at FROM auth_tokens WHERE id = ?`).get(id) as
    | { last_used_at: number | null }
    | undefined;
  if (!row) return;
  if (row.last_used_at && now - row.last_used_at < TOUCH_THROTTLE_MS) return;
  db.prepare(`UPDATE auth_tokens SET last_used_at = ? WHERE id = ?`).run(now, id);
}

/**
 * 校验外部传入的明文 token：
 * 1. 先比对本机 token 文件（O(1) 文件读 + 常量时间字符串比较）
 * 2. 否则 sha256 后查 auth_tokens；命中且未撤销返回 remote
 * 3. 都不命中返回 null
 */
export function verifyToken(plain: string): TokenVerification | null {
  if (!plain) return null;

  const local = readLocalTokenIfPresent();
  if (local && safeEqual(local, plain)) {
    return { kind: 'local', scope: DEFAULT_TOKEN_SCOPE };
  }

  const tokenHash = hashToken(plain);
  const db = getDb();
  const row = db
    .prepare(`SELECT id, label, scope, revoked_at FROM auth_tokens WHERE token_hash = ?`)
    .get(tokenHash) as
    | { id: number; label: string; scope: string; revoked_at: number | null }
    | undefined;

  if (!row) return null;
  if (row.revoked_at !== null) return null;
  return {
    kind: 'remote',
    tokenId: row.id,
    scope: isValidScope(row.scope) ? row.scope : DEFAULT_TOKEN_SCOPE,
    label: row.label,
  };
}

/** 常量时间字符串比较，长度不等也不短路（避免侧信道） */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // 长度不等：仍跑一次循环以保持时间近似恒定
    let mismatch = 1;
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
      mismatch |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    }
    return mismatch === 0;
  }
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/** 仅供测试使用：清空 auth_tokens 表 */
export function _clearAllRemoteTokensForTest(db?: Database.Database): void {
  (db ?? getDb()).prepare(`DELETE FROM auth_tokens`).run();
}
