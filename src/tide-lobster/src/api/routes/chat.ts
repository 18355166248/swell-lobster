import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';

import { settings } from '../../config.js';
import { ChatService } from '../../chat/service.js';
import { getDb } from '../../db/index.js';

export const chatRouter = new Hono();
const service = new ChatService(settings.projectRoot);
// 与 ChatService / ChatStore 共用连接；本文件内仅用于轻量只读查询（如会话消息搜索）。
const db = getDb();

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

chatRouter.post('/api/chat', async (c) => {
  try {
    const body = await c.req.json<{
      conversation_id?: string;
      message?: string;
      endpoint_name?: string;
    }>();

    const result = await service.chat({
      conversation_id: body.conversation_id,
      message: body.message ?? '',
      endpoint_name: body.endpoint_name,
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
  }>();

  return streamSSE(c, async (stream) => {
    const signal = c.req.raw.signal;

    try {
      const result = await service.chatStream(
        {
          conversation_id: body.conversation_id,
          message: body.message ?? '',
          endpoint_name: body.endpoint_name,
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

// 会话侧栏「搜索历史」：LIKE 的模式与关键词均为绑定参数（非字符串拼接），limit 在服务端钳制 1–50。
chatRouter.get('/api/sessions/search', (c) => {
  const q = (c.req.query('q') ?? '').trim();
  const parsedLimit = Number.parseInt(c.req.query('limit') ?? '20', 10);
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 50) : 20;

  if (!q) return c.json([]);

  const rows = db
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

  return c.json(rows);
});

chatRouter.post('/api/sessions', async (c) => {
  try {
    const body = await c.req.json<{ endpoint_name?: string; persona_path?: string }>();
    const session = service.createSession(body?.endpoint_name, body?.persona_path);
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
