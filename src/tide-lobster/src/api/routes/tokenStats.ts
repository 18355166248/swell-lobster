/**
 * Token 用量只读 API。数据来源：ChatService.recordUsage 在每次助手回复落库后按 (date, endpoint) upsert。
 * 周期口径见各路由内注释；daily 默认最近 30 个日历日（可 query days=，上限 90）。
 */
import { Hono } from 'hono';

import { getDb } from '../../db/index.js';

type AggregateRow = {
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  request_count: number | null;
  cost_usd: number | null;
};

function normalizeAggregate(row: AggregateRow | undefined) {
  return {
    prompt_tokens: Number(row?.prompt_tokens ?? 0),
    completion_tokens: Number(row?.completion_tokens ?? 0),
    total_tokens: Number(row?.total_tokens ?? 0),
    request_count: Number(row?.request_count ?? 0),
    cost_usd: Number(row?.cost_usd ?? 0),
  };
}

export const tokenStatsRouter = new Hono();
const db = getDb();

tokenStatsRouter.get('/api/stats/tokens', (c) => {
  const pricingRow = db
    .prepare(
      `
      SELECT EXISTS(
        SELECT 1 FROM llm_endpoints
        WHERE cost_per_1m_input IS NOT NULL AND cost_per_1m_input > 0
      ) as pricing_configured
    `
    )
    .get() as { pricing_configured: number };
  const pricing_configured = Boolean(pricingRow?.pricing_configured);

  // 今日：按本地时区的自然日聚合。
  const today = normalizeAggregate(
    db
      .prepare(
        `
        SELECT
          SUM(prompt_tokens) as prompt_tokens,
          SUM(completion_tokens) as completion_tokens,
          SUM(total_tokens) as total_tokens,
          SUM(request_count) as request_count,
          SUM(cost_usd) as cost_usd
        FROM token_stats
        WHERE date = date('now', 'localtime')
      `
      )
      .get() as AggregateRow
  );

  // 本周：按自然周统计，周一起算，不是“最近 7 天”的滚动窗口。
  const thisWeek = normalizeAggregate(
    db
      .prepare(
        `
        SELECT
          SUM(prompt_tokens) as prompt_tokens,
          SUM(completion_tokens) as completion_tokens,
          SUM(total_tokens) as total_tokens,
          SUM(request_count) as request_count,
          SUM(cost_usd) as cost_usd
        FROM token_stats
        WHERE date >= date(
          'now',
          'localtime',
          '-' || ((CAST(strftime('%w', 'now', 'localtime') AS INTEGER) + 6) % 7) || ' days'
        )
      `
      )
      .get() as AggregateRow
  );

  // 本月：从当月 1 号到今天。
  const thisMonth = normalizeAggregate(
    db
      .prepare(
        `
        SELECT
          SUM(prompt_tokens) as prompt_tokens,
          SUM(completion_tokens) as completion_tokens,
          SUM(total_tokens) as total_tokens,
          SUM(request_count) as request_count,
          SUM(cost_usd) as cost_usd
        FROM token_stats
        WHERE date >= date('now', 'start of month', 'localtime')
      `
      )
      .get() as AggregateRow
  );

  // 累计：全量历史数据。
  const total = normalizeAggregate(
    db
      .prepare(
        `
        SELECT
          SUM(prompt_tokens) as prompt_tokens,
          SUM(completion_tokens) as completion_tokens,
          SUM(total_tokens) as total_tokens,
          SUM(request_count) as request_count,
          SUM(cost_usd) as cost_usd
        FROM token_stats
      `
      )
      .get() as AggregateRow
  );

  return c.json({
    pricing_configured,
    today,
    thisWeek,
    thisMonth,
    total,
  });
});

tokenStatsRouter.get('/api/stats/tokens/daily', (c) => {
  // 含首尾共 days 天：从「本地今天往前 days-1 天」起至今天。
  const days = Math.min(Math.max(Number(c.req.query('days') ?? 30), 1), 90);
  const rows = db
    .prepare(
      `
      SELECT
        date,
        SUM(prompt_tokens) as prompt_tokens,
        SUM(completion_tokens) as completion_tokens,
        SUM(total_tokens) as total_tokens,
        SUM(request_count) as request_count
      FROM token_stats
      WHERE date >= date('now', ?, 'localtime')
      GROUP BY date
      ORDER BY date DESC
    `
    )
    .all(`-${days - 1} days`) as Array<{
    date: string;
    prompt_tokens: number | null;
    completion_tokens: number | null;
    total_tokens: number | null;
    request_count: number | null;
  }>;

  return c.json(
    rows.map((row) => ({
      date: row.date,
      prompt_tokens: Number(row.prompt_tokens ?? 0),
      completion_tokens: Number(row.completion_tokens ?? 0),
      total_tokens: Number(row.total_tokens ?? 0),
      request_count: Number(row.request_count ?? 0),
    }))
  );
});

tokenStatsRouter.get('/api/stats/tokens/by-endpoint', (c) => {
  const rows = db
    .prepare(
      `
      SELECT
        COALESCE(endpoint_name, 'unknown') as endpoint_name,
        SUM(prompt_tokens) as prompt_tokens,
        SUM(completion_tokens) as completion_tokens,
        SUM(total_tokens) as total_tokens,
        SUM(cache_read_tokens) as cache_read_tokens,
        SUM(cache_write_tokens) as cache_write_tokens,
        SUM(cost_usd) as cost_usd,
        SUM(request_count) as request_count,
        MAX(updated_at) as updated_at
      FROM token_stats
      GROUP BY endpoint_name
      ORDER BY total_tokens DESC, endpoint_name ASC
    `
    )
    .all() as Array<{
    endpoint_name: string;
    prompt_tokens: number | null;
    completion_tokens: number | null;
    total_tokens: number | null;
    cache_read_tokens: number | null;
    cache_write_tokens: number | null;
    cost_usd: number | null;
    request_count: number | null;
    updated_at: string | null;
  }>;

  return c.json(
    rows.map((row) => ({
      endpoint_name: row.endpoint_name,
      prompt_tokens: Number(row.prompt_tokens ?? 0),
      completion_tokens: Number(row.completion_tokens ?? 0),
      total_tokens: Number(row.total_tokens ?? 0),
      cache_read_tokens: Number(row.cache_read_tokens ?? 0),
      cache_write_tokens: Number(row.cache_write_tokens ?? 0),
      cost_usd: Number(row.cost_usd ?? 0),
      request_count: Number(row.request_count ?? 0),
      updated_at: row.updated_at,
    }))
  );
});
