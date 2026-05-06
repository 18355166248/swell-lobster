import { getDb } from '../db/index.js';

export interface CategoryMetrics {
  category: string;
  total: number;
  ok: number;
  error: number;
  successRate: number;
  avgDurationMs: number | null;
  p95DurationMs: number | null;
}

export interface DailyMetrics {
  date: string;
  total: number;
  ok: number;
  error: number;
}

export interface AggregatedMetrics {
  byCategory: CategoryMetrics[];
  dailyTrend: DailyMetrics[];
  topSlowCalls: Array<{ category: string; avgDurationMs: number; count: number }>;
  summary: {
    totalLast24h: number;
    errorRateLast24h: number;
    totalLast7d: number;
  };
}

export function getMetrics(days = 7): AggregatedMetrics {
  const db = getDb();
  const since7d = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const byCategoryRows = db
    .prepare(
      `SELECT
        category,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) as ok,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error,
        AVG(CASE WHEN duration_ms IS NOT NULL THEN duration_ms END) as avg_duration_ms
       FROM observability_events
       WHERE timestamp >= ?
       GROUP BY category
       ORDER BY total DESC`
    )
    .all(since7d) as Array<{
    category: string;
    total: number;
    ok: number;
    error: number;
    avg_duration_ms: number | null;
  }>;

  const byCategory: CategoryMetrics[] = byCategoryRows.map((r) => {
    const p95Row = db
      .prepare(
        `SELECT duration_ms FROM observability_events
         WHERE category = ? AND duration_ms IS NOT NULL AND timestamp >= ?
         ORDER BY duration_ms ASC
         LIMIT 1 OFFSET MAX(0, CAST(? * 0.95 AS INTEGER))`
      )
      .get(r.category, since7d, r.total) as { duration_ms: number } | undefined;

    return {
      category: r.category,
      total: r.total,
      ok: r.ok,
      error: r.error,
      successRate: r.total > 0 ? Math.round((r.ok / r.total) * 1000) / 10 : 0,
      avgDurationMs: r.avg_duration_ms != null ? Math.round(r.avg_duration_ms) : null,
      p95DurationMs: p95Row?.duration_ms ?? null,
    };
  });

  const dailyRows = db
    .prepare(
      `SELECT
        DATE(timestamp) as date,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) as ok,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error
       FROM observability_events
       WHERE timestamp >= ?
       GROUP BY DATE(timestamp)
       ORDER BY date ASC`
    )
    .all(since7d) as DailyMetrics[];

  const topSlowRows = db
    .prepare(
      `SELECT category, AVG(duration_ms) as avg_duration_ms, COUNT(*) as count
       FROM observability_events
       WHERE duration_ms IS NOT NULL AND timestamp >= ?
       GROUP BY category
       HAVING avg_duration_ms > 1000
       ORDER BY avg_duration_ms DESC
       LIMIT 10`
    )
    .all(since7d) as Array<{ category: string; avg_duration_ms: number; count: number }>;

  const summary24h = db
    .prepare(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errors
       FROM observability_events WHERE timestamp >= ?`
    )
    .get(since24h) as { total: number; errors: number };

  const total7d = (
    db
      .prepare(`SELECT COUNT(*) as total FROM observability_events WHERE timestamp >= ?`)
      .get(since7d) as { total: number }
  ).total;

  return {
    byCategory,
    dailyTrend: dailyRows,
    topSlowCalls: topSlowRows.map((r) => ({
      category: r.category,
      avgDurationMs: Math.round(r.avg_duration_ms),
      count: r.count,
    })),
    summary: {
      totalLast24h: summary24h.total,
      errorRateLast24h:
        summary24h.total > 0
          ? Math.round((summary24h.errors / summary24h.total) * 1000) / 10
          : 0,
      totalLast7d: total7d,
    },
  };
}
