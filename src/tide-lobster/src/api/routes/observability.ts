import { Hono } from 'hono';
import { queryEvents, queryRecentFailures, querySlowCalls } from '../../observability/traceStore.js';
import { getMetrics } from '../../observability/metrics.js';
import type { EventCategory, EventStatus } from '../../observability/eventTypes.js';

export const observabilityRouter = new Hono();

/**
 * GET /api/observability/events
 * 查询观测事件列表
 * ?category=chat.request&status=error&limit=50&offset=0&since=ISO8601
 */
observabilityRouter.get('/api/observability/events', (c) => {
  try {
    const category = c.req.query('category') as EventCategory | undefined;
    const status = c.req.query('status') as EventStatus | undefined;
    const sessionId = c.req.query('sessionId');
    const since = c.req.query('since');
    const limit = Math.min(200, Math.max(1, Number(c.req.query('limit') ?? '50')));
    const offset = Math.max(0, Number(c.req.query('offset') ?? '0'));

    const result = queryEvents({ category, status, sessionId, since, limit, offset });
    return c.json(result);
  } catch (e) {
    return c.json({ detail: String((e as Error)?.message ?? e) }, 500);
  }
});

/**
 * GET /api/observability/metrics
 * 聚合指标：成功率、耗时、日趋势等
 * ?days=7
 */
observabilityRouter.get('/api/observability/metrics', (c) => {
  try {
    const days = Math.min(30, Math.max(1, Number(c.req.query('days') ?? '7')));
    const metrics = getMetrics(days);
    return c.json(metrics);
  } catch (e) {
    return c.json({ detail: String((e as Error)?.message ?? e) }, 500);
  }
});

/**
 * GET /api/observability/failures
 * 最近失败事件（快捷接口）
 */
observabilityRouter.get('/api/observability/failures', (c) => {
  try {
    const limit = Math.min(50, Math.max(1, Number(c.req.query('limit') ?? '20')));
    const events = queryRecentFailures(limit);
    return c.json({ events });
  } catch (e) {
    return c.json({ detail: String((e as Error)?.message ?? e) }, 500);
  }
});

/**
 * GET /api/observability/slow
 * 最近慢调用（durationMs > 5000ms）
 */
observabilityRouter.get('/api/observability/slow', (c) => {
  try {
    const limit = Math.min(50, Math.max(1, Number(c.req.query('limit') ?? '20')));
    const events = querySlowCalls(limit);
    return c.json({ events });
  } catch (e) {
    return c.json({ detail: String((e as Error)?.message ?? e) }, 500);
  }
});
