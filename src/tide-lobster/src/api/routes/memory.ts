import { Hono } from 'hono';
import { memoryStore } from '../../memory/store.js';
import { extractorService } from '../../memory/extractorService.js';
import { ChatService } from '../../chat/service.js';
import { settings } from '../../config.js';

export const memoryRouter = new Hono();
const chatService = new ChatService(settings.projectRoot);

memoryRouter.get('/api/memories', (c) => {
  const type = c.req.query('type');
  const limit = Number.parseInt(c.req.query('limit') ?? '50', 10);
  const offset = Number.parseInt(c.req.query('offset') ?? '0', 10);
  return c.json({
    memories: memoryStore.list({
      type: type ? (type as 'fact' | 'preference' | 'event' | 'rule') : undefined,
      limit,
      offset,
    }),
  });
});

memoryRouter.get('/api/memories/search', (c) => {
  const q = (c.req.query('q') ?? '').trim();
  const limit = Number.parseInt(c.req.query('limit') ?? '10', 10);
  return c.json({
    memories: q ? memoryStore.search(q, limit) : [],
  });
});

memoryRouter.post('/api/memories', async (c) => {
  try {
    const body = await c.req.json<{
      content?: string;
      memory_type?: 'fact' | 'preference' | 'event' | 'rule';
      source_session_id?: string;
      tags?: string[];
      importance?: number;
      expires_at?: string;
    }>();
    if (!body.content?.trim() || !body.memory_type) {
      return c.json({ detail: 'content and memory_type are required' }, 400);
    }
    const memory = memoryStore.create({
      content: body.content,
      memory_type: body.memory_type,
      source_session_id: body.source_session_id,
      tags: body.tags,
      importance: body.importance,
      expires_at: body.expires_at,
    });
    return c.json({ memory });
  } catch (error) {
    return c.json({ detail: String((error as Error)?.message ?? error) }, 400);
  }
});

memoryRouter.patch('/api/memories/:id', async (c) => {
  try {
    const body = await c.req.json<{
      content?: string;
      importance?: number;
      tags?: string[];
    }>();
    const memory = memoryStore.update(c.req.param('id'), body);
    return c.json({ memory });
  } catch (error) {
    const detail = String((error as Error)?.message ?? error);
    return c.json({ detail }, detail.includes('not found') ? 404 : 400);
  }
});

memoryRouter.delete('/api/memories/:id', (c) => {
  memoryStore.delete(c.req.param('id'));
  return c.json({ status: 'ok' });
});

memoryRouter.delete('/api/memories', (c) => {
  if (c.req.query('confirm') !== 'true') {
    return c.json({ detail: 'confirm=true required' }, 400);
  }
  memoryStore.clearAll();
  return c.json({ status: 'ok' });
});

memoryRouter.post('/api/memories/extract/:sessionId', async (c) => {
  try {
    const session = chatService.getSession(c.req.param('sessionId'));
    if (!session) return c.json({ detail: 'session not found' }, 404);

    const endpoint = chatService.getEndpointConfig(session.endpoint_name ?? null);
    if (!endpoint) return c.json({ detail: 'endpoint not found' }, 404);

    let apiKey = chatService.getApiKeyValue(endpoint.api_key_env);
    if (endpoint.api_key_env && !apiKey) {
      return c.json({ detail: `环境变量 ${endpoint.api_key_env} 未配置 API Key` }, 400);
    }
    if (!apiKey) apiKey = 'local';

    await extractorService.extractFromSession(session.id, endpoint, apiKey);
    return c.json({ status: 'ok' });
  } catch (error) {
    return c.json({ detail: String((error as Error)?.message ?? error) }, 400);
  }
});
