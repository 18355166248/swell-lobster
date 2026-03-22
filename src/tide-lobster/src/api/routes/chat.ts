import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';

import { settings } from '../../config.js';
import { ChatService } from '../../chat/service.js';

export const chatRouter = new Hono();
const service = new ChatService(settings.projectRoot);

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
    try {
      const result = await service.chatStream(
        {
          conversation_id: body.conversation_id,
          message: body.message ?? '',
          endpoint_name: body.endpoint_name,
        },
        async (delta) => {
          await stream.writeSSE({ data: JSON.stringify({ delta }) });
        }
      );
      await stream.writeSSE({
        data: JSON.stringify({
          done: true,
          conversation_id: result.session.id,
          session: result.session,
        }),
      });
    } catch (e) {
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

chatRouter.post('/api/sessions', async (c) => {
  try {
    const body = await c.req.json<{ endpoint_name?: string }>();
    const session = service.createSession(body?.endpoint_name);
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
    const body = await c.req.json<{ endpoint_name?: string; title?: string }>();
    const session = service.updateSession(c.req.param('id'), {
      endpoint_name: body.endpoint_name,
      title: body.title,
    });
    if (!session) return c.json({ detail: 'session not found' }, 404);
    return c.json({ session });
  } catch (e) {
    return c.json({ detail: String((e as Error)?.message || e || 'update session failed') }, 400);
  }
});
