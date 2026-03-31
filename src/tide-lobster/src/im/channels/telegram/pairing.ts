/**
 * Telegram 配对码安全模块。
 *
 * 支持两种 DM 访问策略：
 * - `pairing`（默认）：未知用户收到配对码，管理员通过 API 审批后方可使用。
 * - `allowlist`：仅 `allowed_user_ids` 中的用户可交互，无配对码流程。
 *
 * 持久化均写入 `key_value_store`，无需额外数据库迁移：
 * - `tg_pairing_pending:<channelId>` → PendingRequest[]（待审列表）
 * - `tg_pairing_approved:<channelId>` → number[]（已批准 user id）
 */
import { randomBytes } from 'node:crypto';
import { getDb } from '../../../db/index.js';

export interface PendingRequest {
  user_id: number;
  code: string;
  created_at: string;
  first_name?: string;
  username?: string;
}

/** 生成 6 位大写字母 + 数字配对码 */
export function generatePairingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去除易混淆字符
  return Array.from(randomBytes(6))
    .map((b) => chars[b % chars.length])
    .join('');
}

// ──────────────────────────────────────────────
// 待审列表
// ──────────────────────────────────────────────

function pendingKey(channelId: string) {
  return `tg_pairing_pending:${channelId}`;
}

function approvedKey(channelId: string) {
  return `tg_pairing_approved:${channelId}`;
}

function kvGet<T>(key: string): T | null {
  const row = getDb().prepare('SELECT value FROM key_value_store WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row ? (JSON.parse(row.value) as T) : null;
}

function kvSet(key: string, value: unknown): void {
  getDb()
    .prepare(
      `INSERT INTO key_value_store (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(key, JSON.stringify(value));
}

/** 获取指定通道的待审请求列表 */
export function getPendingRequests(channelId: string): PendingRequest[] {
  return kvGet<PendingRequest[]>(pendingKey(channelId)) ?? [];
}

/**
 * 为用户插入或更新配对请求（重复发消息时刷新 code）。
 * 返回该次生成的配对码。
 */
export function upsertPendingRequest(
  channelId: string,
  userId: number,
  info: { first_name?: string; username?: string }
): string {
  const list = getPendingRequests(channelId).filter((r) => r.user_id !== userId);
  const code = generatePairingCode();
  list.push({
    user_id: userId,
    code,
    created_at: new Date().toISOString(),
    first_name: info.first_name,
    username: info.username,
  });
  kvSet(pendingKey(channelId), list);
  return code;
}

/** 移除待审请求（审批/拒绝后调用） */
export function removePendingRequest(channelId: string, userId: number): void {
  const list = getPendingRequests(channelId).filter((r) => r.user_id !== userId);
  kvSet(pendingKey(channelId), list);
}

// ──────────────────────────────────────────────
// 已批准列表
// ──────────────────────────────────────────────

/** 获取已批准的 user id 列表 */
export function getApprovedUsers(channelId: string): number[] {
  return kvGet<number[]>(approvedKey(channelId)) ?? [];
}

/** 检查用户是否已批准 */
export function isApprovedUser(channelId: string, userId: number): boolean {
  return getApprovedUsers(channelId).includes(userId);
}

/**
 * 通过 userId 或配对码批准用户。
 * 返回被批准的 userId（成功）或 null（未找到待审请求）。
 */
export function approveUser(
  channelId: string,
  by: { userId?: number; code?: string }
): number | null {
  const pending = getPendingRequests(channelId);
  let target: PendingRequest | undefined;

  if (by.userId !== undefined) {
    target = pending.find((r) => r.user_id === by.userId);
  } else if (by.code) {
    target = pending.find((r) => r.code === by.code.toUpperCase());
  }

  if (!target) return null;

  // 加入已批准
  const approved = getApprovedUsers(channelId);
  if (!approved.includes(target.user_id)) {
    approved.push(target.user_id);
    kvSet(approvedKey(channelId), approved);
  }

  // 清理待审
  removePendingRequest(channelId, target.user_id);
  return target.user_id;
}

/** 移除已批准用户（撤权） */
export function revokeUser(channelId: string, userId: number): void {
  const approved = getApprovedUsers(channelId).filter((id) => id !== userId);
  kvSet(approvedKey(channelId), approved);
}
