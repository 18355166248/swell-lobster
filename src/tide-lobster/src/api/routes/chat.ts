import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';

import { settings } from '../../config.js';
import { ChatService } from '../../chat/service.js';
import { getDb } from '../../db/index.js';

export const chatRouter = new Hono();
const service = new ChatService(settings.projectRoot);
// 与 ChatService / ChatStore 共用连接；本文件内仅用于轻量只读查询（如会话消息搜索）。
const db = getDb();

/**
 * FTS5 MATCH 查询串：与「子串 LIKE」不同，MATCH 是词元检索。
 * 策略：按空白拆成多个词，词内用短语（双引号）保持子串感；词之间用 AND，贴近「同时包含」。
 * 无法安全拆分时回退空串，由调用方改用 LIKE。
 */
function fts5TokenAndQuery(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  // 连续空白拆词；英文/数字多词用 AND；中文无空格时整段作为一个短语（与 unicode61 分词配合）
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';

  const phrase = (segment: string) => `"${segment.replace(/"/g, '""')}"`;

  if (parts.length === 1) {
    return phrase(parts[0]);
  }
  return parts.map(phrase).join(' AND ');
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

chatRouter.post('/api/chat', async (c) => {
  try {
    const body = await c.req.json<{
      conversation_id?: string;
      message?: string;
      endpoint_name?: string;
      attachments?: {
        kind: 'image' | 'file';
        mimeType: string;
        filename?: string;
        base64?: string;
      }[];
    }>();

    const result = await service.chat({
      conversation_id: body.conversation_id,
      message: body.message ?? '',
      endpoint_name: body.endpoint_name,
      attachments: body.attachments,
    });

    return c.json({
      message: result.message,
      conversation_id: result.session.id,
      endpoint_name: result.session.endpoint_name,
      session: result.session,
    });
  } catch (e) {
    const msg = String((e as Error)?.message || e || 'chat failed');
    const isBadRequest =
      msg.includes('not found') ||
      msg.includes('empty') ||
      msg.includes('未找到') ||
      msg.includes('未配置 API Key');
    return c.json({ detail: msg }, isBadRequest ? 400 : 502);
  }
});

chatRouter.post('/api/chat/stream', async (c) => {
  const body = await c.req.json<{
    conversation_id?: string;
    message?: string;
    endpoint_name?: string;
    attachments?: {
      kind: 'image' | 'file';
      mimeType: string;
      filename?: string;
      base64?: string;
    }[];
  }>();

  return streamSSE(c, async (stream) => {
    const signal = c.req.raw.signal;

    try {
      const result = await service.chatStream(
        {
          conversation_id: body.conversation_id,
          message: body.message ?? '',
          endpoint_name: body.endpoint_name,
          attachments: body.attachments,
        },
        async (event) => {
          await stream.writeSSE({ data: JSON.stringify(event) });
        },
        signal
      );

      if (signal.aborted) {
        console.log('🚀 ~ signal.aborted:', signal.aborted);
        return;
      }

      await stream.writeSSE({
        data: JSON.stringify({
          done: true,
          conversation_id: result.session.id,
          session: result.session,
        }),
      });
    } catch (e) {
      if (isAbortError(e) || signal.aborted) {
        return;
      }

      const msg = String((e as Error)?.message || e || 'chat failed');
      await stream.writeSSE({ data: JSON.stringify({ error: msg }) });
    }
  });
});

chatRouter.get('/api/sessions', (c) => {
  return c.json({
    sessions: service.listSessions(),
    endpoints: service.listEndpoints(),
  });
});

// 会话侧栏「搜索历史」：默认 LIKE 子串匹配（与历史行为一致，最直观）。
// 可选 ?engine=fts 走 FTS5（词元 + AND），适合英文多关键词；中文无空格时与 LIKE 仍有差异。
// FTS 无结果、异常或 engine 非 fts 时均用 LIKE。limit 钳制 1–50。
chatRouter.get('/api/sessions/search', (c) => {
  const q = (c.req.query('q') ?? '').trim();
  const parsedLimit = Number.parseInt(c.req.query('limit') ?? '20', 10);
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 50) : 20;
  const wantFts = (c.req.query('engine') ?? '').toLowerCase() === 'fts';

  if (!q) return c.json([]);

  const likeSearch = () =>
    db
      .prepare(
        `
      SELECT
        m.id,
        m.content,
        m.role,
        m.created_at,
        s.id as session_id,
        s.title as session_title
      FROM chat_messages m
      JOIN chat_sessions s ON s.id = m.session_id
      WHERE m.content LIKE '%' || ? || '%'
      ORDER BY m.created_at DESC
      LIMIT ?
    `
      )
      .all(q, limit);

  if (wantFts) {
    const ftsQuery = fts5TokenAndQuery(q);
    if (ftsQuery) {
      try {
        const ftsRows = db
          .prepare(
            `
          SELECT
            m.id,
            m.content,
            m.role,
            m.created_at,
            s.id as session_id,
            s.title as session_title
          FROM messages_fts
          JOIN chat_messages m ON m.rowid = messages_fts.rowid
          JOIN chat_sessions s ON s.id = m.session_id
          WHERE messages_fts MATCH ?
          ORDER BY bm25(messages_fts)
          LIMIT ?
        `
          )
          .all(ftsQuery, limit) as unknown[];
        if (ftsRows.length > 0) {
          return c.json(ftsRows);
        }
      } catch {
        // FTS 未建表或 MATCH 语法错误 → LIKE
      }
    }
  }

  return c.json(likeSearch());
});

chatRouter.post('/api/sessions', async (c) => {
  try {
    const body = await c.req.json<{
      endpoint_name?: string;
      persona_path?: string;
      template_id?: string;
    }>();
    const session = service.createSession(
      body?.endpoint_name,
      body?.persona_path,
      body?.template_id
    );
    return c.json({ session });
  } catch (e) {
    return c.json({ detail: String((e as Error)?.message || e || 'create session failed') }, 400);
  }
});

chatRouter.get('/api/sessions/:id', (c) => {
  const session = service.getSession(c.req.param('id'));
  if (!session) return c.json({ detail: 'session not found' }, 404);
  return c.json({ session });
});

chatRouter.delete('/api/sessions/:id', (c) => {
  const deleted = service.deleteSession(c.req.param('id'));
  if (!deleted) return c.json({ detail: 'session not found' }, 404);
  return c.json({ status: 'ok' });
});

chatRouter.patch('/api/sessions/:id', async (c) => {
  try {
    const body = await c.req.json<{
      endpoint_name?: string;
      title?: string;
      persona_path?: string | null;
    }>();

    const session = service.updateSession(c.req.param('id'), {
      endpoint_name: body.endpoint_name,
      title: body.title,
      persona_path: body.persona_path,
    });
    if (!session) return c.json({ detail: 'session not found' }, 404);
    return c.json({ session });
  } catch (e) {
    return c.json({ detail: String((e as Error)?.message || e || 'update session failed') }, 400);
  }
});
