/**
 * MCP 服务端管理 API：CRUD、启停、工具列表、全量 reload、市场目录。
 */

import { Hono } from 'hono';
import {
  assertMarketplaceInstall,
  findMarketplaceEntry,
  getMarketplace,
} from '../../mcp/marketplace.js';
import { mcpManager } from '../../mcp/manager.js';
import { mcpStore } from '../../mcp/store.js';
import type { MCPServerTransportType } from '../../mcp/types.js';

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

/** Headers：JSON 对象，或每行 `Name: value` / `NAME=value` */
function parseHeadersText(text?: string): Record<string, string> {
  if (!text?.trim()) return {};
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) {
    try {
      const o = JSON.parse(trimmed) as Record<string, unknown>;
      return Object.fromEntries(
        Object.entries(o).filter((e): e is [string, string] => typeof e[1] === 'string')
      );
    } catch {
      return {};
    }
  }
  return Object.fromEntries(
    text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const colon = line.indexOf(':');
        if (colon !== -1) {
          return [line.slice(0, colon).trim(), line.slice(colon + 1).trim()];
        }
        const eq = line.indexOf('=');
        if (eq !== -1) {
          return [line.slice(0, eq).trim(), line.slice(eq + 1).trim()];
        }
        return [line, ''];
      })
      .filter(([key]) => key)
  );
}

function normalizeTransport(t: unknown): MCPServerTransportType {
  if (t === 'sse' || t === 'http' || t === 'stdio') return t;
  return 'stdio';
}

mcpRouter.get('/api/mcp/marketplace', async (c) => {
  try {
    const catalog = await getMarketplace();
    return c.json(catalog);
  } catch (error) {
    return c.json(
      { detail: error instanceof Error ? error.message : String(error) },
      500
    );
  }
});

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
    type?: string;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    envText?: string;
    headers?: Record<string, string>;
    headersText?: string;
    url?: string;
    registry_id?: string;
    enabled?: boolean;
  }>();

  const name = body.name?.trim();
  if (!name) return c.json({ detail: 'name is required' }, 400);

  const env = body.env ?? parseEnvLines(body.envText);
  const headers = body.headers ?? parseHeadersText(body.headersText);

  try {
    if (body.registry_id?.trim()) {
      const catalog = await getMarketplace();
      const entry = findMarketplaceEntry(catalog, body.registry_id.trim());
      if (!entry) return c.json({ detail: 'unknown registry_id' }, 400);
      const command = body.command?.trim() ?? '';
      const args = Array.isArray(body.args) ? body.args : [];
      assertMarketplaceInstall(entry, command, args, env);
      const server = mcpStore.create({
        name,
        type: 'stdio',
        command,
        args,
        env,
        enabled: body.enabled !== false,
        registry_id: entry.id,
        url: null,
        headers: {},
      });
      if (server.enabled) {
        await mcpManager.startServer(server);
      }
      return c.json({ server: mcpStore.get(server.id) }, 201);
    }

    const type = normalizeTransport(body.type);
    const command = (body.command ?? '').trim();
    const url = body.url?.trim() ?? '';

    if (type === 'stdio') {
      if (!command) return c.json({ detail: 'command is required for stdio transport' }, 400);
    } else {
      if (!url) return c.json({ detail: 'url is required for sse/http transport' }, 400);
    }

    const server = mcpStore.create({
      name,
      type,
      command: type === 'stdio' ? command : '',
      args: Array.isArray(body.args) ? body.args : [],
      env,
      enabled: body.enabled !== false,
      registry_id: undefined,
      url: type === 'stdio' ? null : url,
      headers: type === 'stdio' ? {} : headers,
    });
    if (server.enabled) {
      await mcpManager.startServer(server);
    }
    return c.json({ server: mcpStore.get(server.id) }, 201);
  } catch (error) {
    return c.json({ detail: error instanceof Error ? error.message : String(error) }, 400);
  }
});

mcpRouter.patch('/api/mcp/servers/:id', async (c) => {
  const id = c.req.param('id');
  const server = mcpStore.get(id);
  if (!server) return c.json({ detail: 'server not found' }, 404);

  const body = await c.req.json<{
    name?: string;
    type?: string;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    envText?: string;
    headers?: Record<string, string>;
    headersText?: string;
    url?: string;
    enabled?: boolean;
  }>();

  const env =
    body.env !== undefined
      ? body.env
      : body.envText !== undefined
        ? parseEnvLines(body.envText)
        : undefined;
  const headers =
    body.headers !== undefined
      ? body.headers
      : body.headersText !== undefined
        ? parseHeadersText(body.headersText)
        : undefined;

  try {
    const nextType = body.type !== undefined ? normalizeTransport(body.type) : server.type;
    let nextCommand = body.command !== undefined ? body.command.trim() : server.command;
    const nextArgs = body.args !== undefined ? body.args : server.args;
    const nextEnv = env !== undefined ? env : server.env;
    let nextUrl = body.url !== undefined ? body.url.trim() : (server.url ?? '');
    const nextHeaders = headers !== undefined ? headers : server.headers;
    const nextName = body.name !== undefined ? body.name.trim() : server.name;
    const nextEnabled = body.enabled !== undefined ? body.enabled : server.enabled;

    if (nextType === 'sse' || nextType === 'http') {
      nextCommand = '';
      if (!nextUrl) {
        return c.json({ detail: 'url is required for sse/http transport' }, 400);
      }
    } else if (!nextCommand) {
      return c.json({ detail: 'command is required for stdio transport' }, 400);
    }

    await mcpManager.stopServer(id);
    mcpStore.update(id, {
      name: nextName,
      type: nextType,
      command: nextCommand,
      args: nextArgs,
      env: nextEnv,
      url: nextType === 'stdio' ? null : nextUrl,
      headers: nextType === 'stdio' ? {} : nextHeaders,
      enabled: nextEnabled,
    });
    const final = mcpStore.get(id)!;
    if (final.enabled) {
      await mcpManager.startServer(final);
    }
    return c.json({ server: mcpStore.get(id) });
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
