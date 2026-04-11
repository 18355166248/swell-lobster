import { Hono } from 'hono';
import { getDb } from '../../db/index.js';

export const logsRouter = new Hono();

export type LogLevel = 'error' | 'warn' | 'info';
export type LogSource = 'backend' | 'frontend';

interface AppLogRow {
  id: number;
  level: string;
  source: string;
  message: string;
  context: string | null;
  created_at: number;
}

function parseLog(row: AppLogRow) {
  return {
    ...row,
    context: row.context
      ? (() => {
          try {
            return JSON.parse(row.context);
          } catch {
            return row.context;
          }
        })()
      : null,
  };
}

/**
 * GET /api/logs?source=&level=&date=YYYY-MM-DD&page=&limit=
 * source: 'backend' | 'frontend'（可选，不传返回全部）
 * level:  'error' | 'warn' | 'info'（可选）
 * date:   只返回该日的日志
 * page:   1-based，默认 1
 * limit:  默认 50，最大 200
 */
logsRouter.get('/api/logs', (c) => {
  const source = c.req.query('source');
  const level = c.req.query('level');
  const date = c.req.query('date'); // 'YYYY-MM-DD'
  const page = Math.max(1, Number(c.req.query('page') ?? '1'));
  const limit = Math.min(200, Math.max(1, Number(c.req.query('limit') ?? '50')));
  const offset = (page - 1) * limit;

  const db = getDb();

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (source) {
    conditions.push('source = ?');
    params.push(source);
  }
  if (level) {
    conditions.push('level = ?');
    params.push(level);
  }
  if (date) {
    // date 是 YYYY-MM-DD，created_at 是毫秒时间戳
    const dayStart = new Date(date + 'T00:00:00').getTime();
    const dayEnd = new Date(date + 'T23:59:59.999').getTime();
    conditions.push('created_at >= ? AND created_at <= ?');
    params.push(dayStart, dayEnd);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const total = (
    db.prepare(`SELECT COUNT(*) as cnt FROM app_logs ${where}`).get(...params) as {
      cnt: number;
    }
  ).cnt;

  const rows = db
    .prepare(
      `SELECT * FROM app_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as AppLogRow[];

  return c.json({
    logs: rows.map(parseLog),
    total,
    page,
    limit,
  });
});

/**
 * POST /api/logs — 前端上报日志
 * body: { level, source, message, context? }
 */
logsRouter.post('/api/logs', async (c) => {
  try {
    const body = await c.req.json<{
      level?: string;
      source?: string;
      message?: string;
      context?: unknown;
    }>();

    if (!body.message) return c.json({ detail: 'message is required' }, 400);

    const db = getDb();
    db.prepare(
      `INSERT INTO app_logs (level, source, message, context, created_at) VALUES (?, ?, ?, ?, ?)`
    ).run(
      body.level ?? 'info',
      body.source ?? 'frontend',
      String(body.message),
      body.context !== undefined ? JSON.stringify(body.context) : null,
      Date.now()
    );

    return c.json({ ok: true });
  } catch (error) {
    return c.json({ detail: String((error as Error)?.message ?? error) }, 400);
  }
});

/** 供后端内部调用：写入一条日志（异步、不阻塞） */
export function writeAppLog(
  level: LogLevel,
  source: LogSource,
  message: string,
  context?: unknown
): void {
  setImmediate(() => {
    try {
      const db = getDb();
      db.prepare(
        `INSERT INTO app_logs (level, source, message, context, created_at) VALUES (?, ?, ?, ?, ?)`
      ).run(
        level,
        source,
        message,
        context !== undefined ? JSON.stringify(context) : null,
        Date.now()
      );
    } catch {
      // 日志写失败不能影响主流程
    }
  });
}
