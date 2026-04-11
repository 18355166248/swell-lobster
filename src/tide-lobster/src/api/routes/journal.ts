import { Hono } from 'hono';
import { getDb } from '../../db/index.js';

export const journalRouter = new Hono();

interface JournalRow {
  id: number;
  title: string;
  content: string;
  category: string;
  tags: string;
  entry_date: string;
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
    }>();

    const now = Date.now();
    const entryDate = body.entry_date ?? new Date().toISOString().slice(0, 10);

    const db = getDb();
    const result = db
      .prepare(
        `INSERT INTO journal_entries (title, content, category, tags, entry_date, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        body.title ?? '',
        body.content ?? '',
        body.category ?? '',
        JSON.stringify(body.tags ?? []),
        entryDate,
        now,
        now
      );

    const row = db
      .prepare(`SELECT * FROM journal_entries WHERE id = ?`)
      .get(result.lastInsertRowid) as JournalRow;

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
    }>();

    const db = getDb();
    const existing = db
      .prepare(`SELECT * FROM journal_entries WHERE id = ?`)
      .get(id) as JournalRow | undefined;
    if (!existing) return c.json({ detail: 'not found' }, 404);

    const now = Date.now();
    db.prepare(
      `UPDATE journal_entries
       SET title = ?, content = ?, category = ?, tags = ?, entry_date = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      body.title ?? existing.title,
      body.content ?? existing.content,
      body.category ?? existing.category,
      body.tags !== undefined ? JSON.stringify(body.tags) : existing.tags,
      body.entry_date ?? existing.entry_date,
      now,
      id
    );

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
