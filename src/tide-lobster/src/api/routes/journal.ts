import { Hono } from 'hono';
import { getDb } from '../../db/index.js';
import { extractorService } from '../../memory/extractorService.js';
import { memoryStore } from '../../memory/store.js';
import { EndpointStore } from '../../store/endpointStore.js';

export const journalRouter = new Hono();

const endpointStore = new EndpointStore();

interface JournalRow {
  id: number;
  title: string;
  content: string;
  category: string;
  tags: string;
  entry_date: string;
  mood: string | null;
  weather: string | null;
  location: string | null;
  memory_extracted: number;
  created_at: number;
  updated_at: number;
}

function parseEntry(row: JournalRow) {
  return {
    ...row,
    tags: (() => {
      try {
        return JSON.parse(row.tags);
      } catch {
        return [];
      }
    })(),
    memory_extracted: Boolean(row.memory_extracted),
  };
}

/** GET /api/journal?year=&month=  — 返回当月条目列表 + 有条目的日期集合 */
journalRouter.get('/api/journal', (c) => {
  const year = Number(c.req.query('year') ?? new Date().getFullYear());
  const month = Number(c.req.query('month') ?? new Date().getMonth() + 1);
  const db = getDb();

  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const rows = db
    .prepare(
      `SELECT * FROM journal_entries WHERE entry_date LIKE ? ORDER BY entry_date DESC, id DESC`
    )
    .all(`${prefix}%`) as JournalRow[];

  const entries = rows.map(parseEntry);
  const datesWithEntries = [...new Set(entries.map((e) => e.entry_date))];

  return c.json({ entries, datesWithEntries });
});

/** GET /api/journal/:id */
journalRouter.get('/api/journal/:id', (c) => {
  const id = Number(c.req.param('id'));
  const db = getDb();
  const row = db.prepare(`SELECT * FROM journal_entries WHERE id = ?`).get(id) as
    | JournalRow
    | undefined;
  if (!row) return c.json({ detail: 'not found' }, 404);
  return c.json({ entry: parseEntry(row) });
});

/** POST /api/journal — 新建条目 */
journalRouter.post('/api/journal', async (c) => {
  try {
    const body = await c.req.json<{
      title?: string;
      content?: string;
      category?: string;
      tags?: string[];
      entry_date?: string;
      mood?: string;
      weather?: string;
      location?: string;
    }>();

    const now = Date.now();
    const entryDate = body.entry_date ?? new Date().toISOString().slice(0, 10);

    const db = getDb();
    const result = db
      .prepare(
        `INSERT INTO journal_entries (title, content, category, tags, entry_date, mood, weather, location, memory_extracted, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
      )
      .run(
        body.title ?? '',
        body.content ?? '',
        body.category ?? '',
        JSON.stringify(body.tags ?? []),
        entryDate,
        body.mood ?? null,
        body.weather ?? null,
        body.location ?? null,
        now,
        now
      );

    const row = db
      .prepare(`SELECT * FROM journal_entries WHERE id = ?`)
      .get(result.lastInsertRowid) as JournalRow;

    // 自动提取记忆（fire-and-forget）
    if (body.content && body.content.length > 50) {
      const endpoints = endpointStore.listEndpoints();
      const endpoint = endpoints.find((ep) => ep.enabled && ep.priority === 0) ?? endpoints.find((ep) => ep.enabled);
      if (endpoint && endpoint.api_key_env) {
        const apiKey = process.env[endpoint.api_key_env] ?? '';
        extractorService
          .extractFromJournal(
            Number(result.lastInsertRowid),
            body.content,
            body.title ?? '',
            entryDate,
            endpoint,
            apiKey
          )
          .then(() => {
            // 标记已提取
            db.prepare('UPDATE journal_entries SET memory_extracted = 1 WHERE id = ?').run(
              result.lastInsertRowid
            );
          })
          .catch((err) => console.error('[journal] auto extract memory failed:', err));
      }
    }

    return c.json({ entry: parseEntry(row) }, 201);
  } catch (error) {
    return c.json({ detail: String((error as Error)?.message ?? error) }, 400);
  }
});

/** PUT /api/journal/:id — 更新条目 */
journalRouter.put('/api/journal/:id', async (c) => {
  try {
    const id = Number(c.req.param('id'));
    const body = await c.req.json<{
      title?: string;
      content?: string;
      category?: string;
      tags?: string[];
      entry_date?: string;
      mood?: string;
      weather?: string;
      location?: string;
    }>();

    const db = getDb();
    const existing = db
      .prepare(`SELECT * FROM journal_entries WHERE id = ?`)
      .get(id) as JournalRow | undefined;
    if (!existing) return c.json({ detail: 'not found' }, 404);

    const now = Date.now();
    const contentChanged = body.content !== undefined && body.content !== existing.content;

    db.prepare(
      `UPDATE journal_entries
       SET title = ?, content = ?, category = ?, tags = ?, entry_date = ?, mood = ?, weather = ?, location = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      body.title ?? existing.title,
      body.content ?? existing.content,
      body.category ?? existing.category,
      body.tags !== undefined ? JSON.stringify(body.tags) : existing.tags,
      body.entry_date ?? existing.entry_date,
      body.mood !== undefined ? body.mood : existing.mood,
      body.weather !== undefined ? body.weather : existing.weather,
      body.location !== undefined ? body.location : existing.location,
      now,
      id
    );

    // 如果内容有变化，重新提取记忆
    if (contentChanged && body.content && body.content.length > 50) {
      const endpoints = endpointStore.listEndpoints();
      const endpoint = endpoints.find((ep) => ep.enabled && ep.priority === 0) ?? endpoints.find((ep) => ep.enabled);
      if (endpoint && endpoint.api_key_env) {
        const apiKey = process.env[endpoint.api_key_env] ?? '';

        // 删除旧记忆
        memoryStore.deleteBySource('journal', String(id));

        // 重新提取
        extractorService
          .extractFromJournal(
            id,
            body.content,
            body.title ?? existing.title,
            body.entry_date ?? existing.entry_date,
            endpoint,
            apiKey
          )
          .then(() => {
            db.prepare('UPDATE journal_entries SET memory_extracted = 1 WHERE id = ?').run(id);
          })
          .catch((err) => console.error('[journal] re-extract memory failed:', err));
      }
    }

    const row = db
      .prepare(`SELECT * FROM journal_entries WHERE id = ?`)
      .get(id) as JournalRow;
    return c.json({ entry: parseEntry(row) });
  } catch (error) {
    return c.json({ detail: String((error as Error)?.message ?? error) }, 400);
  }
});

/** DELETE /api/journal/:id */
journalRouter.delete('/api/journal/:id', (c) => {
  const id = Number(c.req.param('id'));
  const db = getDb();
  const existing = db
    .prepare(`SELECT id FROM journal_entries WHERE id = ?`)
    .get(id);
  if (!existing) return c.json({ detail: 'not found' }, 404);
  db.prepare(`DELETE FROM journal_entries WHERE id = ?`).run(id);
  return c.json({ ok: true });
});

/** POST /api/journal/:id/extract-memory — 手动触发记忆提取 */
journalRouter.post('/api/journal/:id/extract-memory', async (c) => {
  const id = Number(c.req.param('id'));
  const db = getDb();
  const entry = db
    .prepare(`SELECT * FROM journal_entries WHERE id = ?`)
    .get(id) as JournalRow | undefined;

  if (!entry) return c.json({ detail: 'not found' }, 404);

  const endpoint = endpointStore.getDefaultEndpoint();
  if (!endpoint || !endpoint.api_key_env) {
    return c.json({ detail: 'no default endpoint configured' }, 400);
  }

  const apiKey = process.env[endpoint.api_key_env] ?? '';

  try {
    await extractorService.extractFromJournal(
      id,
      entry.content,
      entry.title,
      entry.entry_date,
      endpoint,
      apiKey
    );

    // 标记已提取
    db.prepare('UPDATE journal_entries SET memory_extracted = 1 WHERE id = ?').run(id);

    return c.json({ ok: true });
  } catch (error) {
    return c.json({ detail: String((error as Error)?.message ?? error) }, 500);
  }
});

/** GET /api/journal/:id/memories — 获取日记关联的记忆 */
journalRouter.get('/api/journal/:id/memories', (c) => {
  const id = Number(c.req.param('id'));
  const memories = memoryStore.findBySource('journal', String(id));
  return c.json({ memories });
});

/** GET /api/journal/timeline — 时间线视图数据 */
journalRouter.get('/api/journal/timeline', (c) => {
  const year = Number(c.req.query('year') ?? new Date().getFullYear());
  const db = getDb();

  const stats = db.prepare(`
    SELECT
      strftime('%Y-%m', entry_date) as month,
      COUNT(*) as count,
      GROUP_CONCAT(DISTINCT category) as categories
    FROM journal_entries
    WHERE strftime('%Y', entry_date) = ?
    GROUP BY month
    ORDER BY month DESC
  `).all(String(year)) as Array<{ month: string; count: number; categories: string }>;

  return c.json({ stats });
});
