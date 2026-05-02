import { randomUUID } from 'node:crypto';
import { getDb } from '../db/index.js';
import type { ChannelType } from './types.js';

type RateLimitConfig = {
  rpm_limit?: unknown;
  rpd_limit?: unknown;
  limit_message?: unknown;
};

export type RateLimitDecision = {
  allowed: boolean;
  message?: string;
  reason?: 'rpm' | 'rpd';
};

function toPositiveInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  }
  return null;
}

function resolveConfig(raw: RateLimitConfig) {
  return {
    rpmLimit: toPositiveInteger(raw.rpm_limit),
    rpdLimit: toPositiveInteger(raw.rpd_limit),
    limitMessage:
      typeof raw.limit_message === 'string' && raw.limit_message.trim()
        ? raw.limit_message.trim()
        : '请求过于频繁，请稍后再试。',
  };
}

function getCurrentBuckets(now: Date) {
  const iso = now.toISOString();
  return {
    day: iso.slice(0, 10),
    minuteBucket: iso.slice(0, 16),
    updatedAt: iso,
  };
}

function getCurrentMinuteCount(channelId: string, userId: string, day: string, minuteBucket: string) {
  const row = getDb()
    .prepare(
      `SELECT request_count
       FROM im_rate_stats
       WHERE channel_id = ? AND user_id = ? AND day = ? AND minute_bucket = ?`
    )
    .get(channelId, userId, day, minuteBucket) as { request_count: number } | undefined;
  return row?.request_count ?? 0;
}

function getCurrentDayCount(channelId: string, userId: string, day: string) {
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(request_count), 0) as total
       FROM im_rate_stats
       WHERE channel_id = ? AND user_id = ? AND day = ?`
    )
    .get(channelId, userId, day) as { total: number } | undefined;
  return row?.total ?? 0;
}

function upsertBucket(params: {
  channelId: string;
  channelType: ChannelType;
  userId: string;
  day: string;
  minuteBucket: string;
  updatedAt: string;
  blocked: boolean;
}) {
  const db = getDb();
  const existing = db
    .prepare(
      `SELECT id, request_count, blocked_count
       FROM im_rate_stats
       WHERE channel_id = ? AND user_id = ? AND day = ? AND minute_bucket = ?`
    )
    .get(params.channelId, params.userId, params.day, params.minuteBucket) as
    | { id: string; request_count: number; blocked_count: number }
    | undefined;

  if (existing) {
    db.prepare(
      `UPDATE im_rate_stats
       SET request_count = ?, blocked_count = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      existing.request_count + (params.blocked ? 0 : 1),
      existing.blocked_count + (params.blocked ? 1 : 0),
      params.updatedAt,
      existing.id
    );
    return;
  }

  db.prepare(
    `INSERT INTO im_rate_stats (
      id, channel_id, channel_type, user_id, day, minute_bucket, request_count, blocked_count, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    randomUUID(),
    params.channelId,
    params.channelType,
    params.userId,
    params.day,
    params.minuteBucket,
    params.blocked ? 0 : 1,
    params.blocked ? 1 : 0,
    params.updatedAt
  );
}

export function checkRateLimit(input: {
  channelId: string;
  channelType: ChannelType;
  userId: string;
  config: RateLimitConfig;
  now?: Date;
}): RateLimitDecision {
  const { rpmLimit, rpdLimit, limitMessage } = resolveConfig(input.config);
  if (!rpmLimit && !rpdLimit) return { allowed: true };

  const buckets = getCurrentBuckets(input.now ?? new Date());
  const minuteCount = getCurrentMinuteCount(
    input.channelId,
    input.userId,
    buckets.day,
    buckets.minuteBucket
  );
  const dayCount = getCurrentDayCount(input.channelId, input.userId, buckets.day);

  if (rpmLimit && minuteCount >= rpmLimit) {
    upsertBucket({
      channelId: input.channelId,
      channelType: input.channelType,
      userId: input.userId,
      blocked: true,
      ...buckets,
    });
    return { allowed: false, message: limitMessage, reason: 'rpm' };
  }

  if (rpdLimit && dayCount >= rpdLimit) {
    upsertBucket({
      channelId: input.channelId,
      channelType: input.channelType,
      userId: input.userId,
      blocked: true,
      ...buckets,
    });
    return { allowed: false, message: limitMessage, reason: 'rpd' };
  }

  upsertBucket({
    channelId: input.channelId,
    channelType: input.channelType,
    userId: input.userId,
    blocked: false,
    ...buckets,
  });
  return { allowed: true };
}
