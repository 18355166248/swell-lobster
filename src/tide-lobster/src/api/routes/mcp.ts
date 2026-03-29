/**
 * MCP 服务端管理 API：CRUD、启停、工具列表、全量 reload。
 */

import { Hono } from 'hono';
import { mcpManager } from '../../mcp/manager.js';
import { mcpStore } from '../../mcp/store.js';

export const mcpRouter = new Hono();

/** 将 `KEY=value` 多行文本解析为 env 对象（前端 envText 字段） */
function parseEnvLines(text?: string): Record<string, string> {
  if (!text) return {};
  return Object.fromEntries(
    text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const index = line.indexOf('=');
        if (index === -1) return [line, ''];
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      })
      .filter(([key]) => key)
  );
}

mcpRouter.get('/api/mcp/servers', async (c) => {
  const servers = await Promise.all(
    mcpStore.list().map(async (server) => {
      const tools = server.status === 'running' ? await mcpManager.getTools(server.id) : [];
      return {
        ...server,
        tool_count: tools.length,
      };
    })
  );
  return c.json({ servers });
});

mcpRouter.post('/api/mcp/servers', async (c) => {
  const body = await c.req.json<{
    name?: string;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    envText?: string;
    enabled?: boolean;
  }>();
  const name = body.name?.trim();
  const command = body.command?.trim();
  if (!name) return c.json({ detail: 'name is required' }, 400);
  if (!command) return c.json({ detail: 'command is required' }, 400);

  try {
    const server = mcpStore.create({
      name,
      command,
      args: Array.isArray(body.args) ? body.args : [],
      env: body.env ?? parseEnvLines(body.envText),
      enabled: body.enabled !== false,
    });
    if (server.enabled) {
      await mcpManager.startServer(server);
    }
    return c.json({ server: mcpStore.get(server.id) }, 201);
  } catch (error) {
    return c.json({ detail: error instanceof Error ? error.message : String(error) }, 400);
  }
});

mcpRouter.delete('/api/mcp/servers/:id', async (c) => {
  const id = c.req.param('id');
  const server = mcpStore.get(id);
  if (!server) return c.json({ detail: 'server not found' }, 404);

  await mcpManager.stopServer(id);
  mcpStore.delete(id);
  return c.json({ status: 'ok', id });
});

mcpRouter.patch('/api/mcp/servers/:id/enable', async (c) => {
  const id = c.req.param('id');
  const server = mcpStore.get(id);
  if (!server) return c.json({ detail: 'server not found' }, 404);

  try {
    const updated = mcpStore.update(id, { enabled: true });
    await mcpManager.startServer(updated);
    return c.json({ server: mcpStore.get(id) });
  } catch (error) {
    return c.json({ detail: error instanceof Error ? error.message : String(error) }, 400);
  }
});

mcpRouter.patch('/api/mcp/servers/:id/disable', async (c) => {
  const id = c.req.param('id');
  const server = mcpStore.get(id);
  if (!server) return c.json({ detail: 'server not found' }, 404);

  await mcpManager.stopServer(id);
  mcpStore.update(id, { enabled: false });
  return c.json({ server: mcpStore.get(id) });
});

mcpRouter.get('/api/mcp/servers/:id/tools', async (c) => {
  const id = c.req.param('id');
  const server = mcpStore.get(id);
  if (!server) return c.json({ detail: 'server not found' }, 404);

  const tools = await mcpManager.getTools(id);
  return c.json({ tools });
});

mcpRouter.post('/api/mcp/reload', async (c) => {
  await mcpManager.cleanup();
  await mcpManager.loadAll();
  return c.json({ status: 'ok', servers: mcpStore.list() });
});
