import { getDb } from '../db/index.js';
import type { EventCategory, EventStatus, ObservabilityEvent, RecordEventInput } from './eventTypes.js';

const SLOW_THRESHOLD_MS = 5000;

export function recordEvent(input: RecordEventInput): void {
  const write = () => {
    try {
      const db = getDb();
      db.prepare(
        `INSERT INTO observability_events (timestamp, category, status, session_id, duration_ms, meta)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        input.timestamp ?? new Date().toISOString(),
        input.category,
        input.status,
        input.sessionId ?? null,
        input.durationMs ?? null,
        input.meta ? JSON.stringify(input.meta) : null
      );
    } catch {
      // 观测写失败不影响主流程
    }
  };

  if (process.env['VITEST']) {
    write();
    return;
  }

  const handle = setImmediate(write);
  handle.unref?.();
}

export interface QueryEventsOptions {
  category?: EventCategory;
  status?: EventStatus;
  sessionId?: string;
  limit?: number;
  offset?: number;
  since?: string;
}

export function queryEvents(opts: QueryEventsOptions = {}): {
  events: ObservabilityEvent[];
  total: number;
} {
  const db = getDb();
  const conditions: string[] = [];
  const params: (string | number | null)[] = [];

  if (opts.category) {
    conditions.push('category = ?');
    params.push(opts.category);
  }
  if (opts.status) {
    conditions.push('status = ?');
    params.push(opts.status);
  }
  if (opts.sessionId) {
    conditions.push('session_id = ?');
    params.push(opts.sessionId);
  }
  if (opts.since) {
    conditions.push('timestamp >= ?');
    params.push(opts.since);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
  const offset = opts.offset ?? 0;

  const total = (
    db.prepare(`SELECT COUNT(*) as cnt FROM observability_events ${where}`).get(...params) as {
      cnt: number;
    }
  ).cnt;

  const rows = db
    .prepare(
      `SELECT * FROM observability_events ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as Array<{
    id: number;
    timestamp: string;
    category: string;
    status: string;
    session_id: string | null;
    duration_ms: number | null;
    meta: string | null;
    created_at: string;
  }>;

  return {
    events: rows.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      category: r.category as EventCategory,
      status: r.status as EventStatus,
      sessionId: r.session_id ?? undefined,
      durationMs: r.duration_ms ?? undefined,
      meta: r.meta ? (() => { try { return JSON.parse(r.meta!); } catch { return undefined; } })() : undefined,
      createdAt: r.created_at,
    })),
    total,
  };
}

export function queryRecentFailures(limit = 20): ObservabilityEvent[] {
  return queryEvents({ status: 'error', limit }).events;
}

export function querySlowCalls(limit = 20): ObservabilityEvent[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM observability_events
       WHERE duration_ms > ? ORDER BY duration_ms DESC LIMIT ?`
    )
    .all(SLOW_THRESHOLD_MS, limit) as Array<{
    id: number;
    timestamp: string;
    category: string;
    status: string;
    session_id: string | null;
    duration_ms: number | null;
    meta: string | null;
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    timestamp: r.timestamp,
    category: r.category as EventCategory,
    status: r.status as EventStatus,
    sessionId: r.session_id ?? undefined,
    durationMs: r.duration_ms ?? undefined,
    meta: r.meta ? (() => { try { return JSON.parse(r.meta!); } catch { return undefined; } })() : undefined,
    createdAt: r.created_at,
  }));
}

export function cleanupOldEvents(): void {
  const cleanup = () => {
    try {
      const db = getDb();
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      db.prepare(`DELETE FROM observability_events WHERE timestamp < ?`).run(cutoff);
    } catch {
      // 清理失败不影响主流程
    }
  };

  if (process.env['VITEST']) {
    cleanup();
    return;
  }

  const handle = setImmediate(cleanup);
  handle.unref?.();
}
