/**
 * MCP 生命周期：按配置启动 stdio / SSE / Streamable HTTP 客户端、拉取工具并注册到全局 ToolRegistry。
 * 关闭时断开连接并卸载对应 `mcp_<serverId>_*` 工具。
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { mcpStore } from './store.js';
import { mcpToolBridge } from './toolBridge.js';
import type { MCPServerConfig, MCPToolInfo } from './types.js';

/** 已连接的 MCP 客户端与其传输（便于 close 时一并释放） */
type ManagedClient = {
  client: Client;
  transport: Transport;
};

/** 合并进程环境与子进程专属 env，并去掉非 string 项（SDK 要求） */
function mergeEnv(extra: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries({ ...process.env, ...extra }).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string'
    )
  );
}

function buildRemoteRequestInit(headers: Record<string, string>): RequestInit | undefined {
  if (!headers || Object.keys(headers).length === 0) return undefined;
  return { headers: { ...headers } };
}

function createTransport(config: MCPServerConfig): Transport {
  const t = config.type ?? 'stdio';
  if (t === 'stdio') {
    return new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: mergeEnv(config.env),
    });
  }
  const rawUrl = config.url?.trim();
  if (!rawUrl) {
    throw new Error('url is required for sse/http MCP transport');
  }
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch (e) {
    throw new Error(`invalid MCP url: ${rawUrl}`);
  }
  const requestInit = buildRemoteRequestInit(config.headers ?? {});
  const opts = requestInit ? { requestInit } : undefined;
  if (t === 'sse') {
    return new SSEClientTransport(parsedUrl, opts);
  }
  return new StreamableHTTPClientTransport(parsedUrl, opts);
}

export class MCPManager {
  private readonly clients = new Map<string, ManagedClient>();

  /** 启动并连接；先停旧实例，再注册工具并更新 store 状态 */
  async startServer(config: MCPServerConfig): Promise<void> {
    await this.stopServer(config.id);
    try {
      const transport = createTransport(config);
      const client = new Client({
        name: 'swell-lobster',
        version: '1.0.0',
      });

      await client.connect(transport);
      const result = await client.listTools();
      const tools = Array.isArray(result.tools) ? (result.tools as MCPToolInfo[]) : [];
      for (const tool of tools) {
        mcpToolBridge.registerMCPTool(config.id, tool, client);
      }

      this.clients.set(config.id, { client, transport });
      mcpStore.setStatus(config.id, 'running');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      mcpStore.setStatus(config.id, 'error', message);
      throw error;
    }
  }

  /** 关闭客户端、从 ToolRegistry 移除该 server 的工具，状态置为 stopped */
  async stopServer(serverId: string): Promise<void> {
    const managed = this.clients.get(serverId);
    if (managed) {
      try {
        await managed.client.close();
      } catch {
        // ignore close errors on shutdown
      }
      this.clients.delete(serverId);
    }
    mcpToolBridge.unregisterMCPTools(serverId);
    const config = mcpStore.get(serverId);
    if (config) mcpStore.setStatus(serverId, 'stopped');
  }

  /** 列出当前连接上该 server 的工具（未连接则空数组） */
  async getTools(serverId: string): Promise<MCPToolInfo[]> {
    const managed = this.clients.get(serverId);
    if (!managed) return [];
    const result = await managed.client.listTools();
    return Array.isArray(result.tools) ? (result.tools as MCPToolInfo[]) : [];
  }

  /** 按最新配置重启；若已禁用则仅停止 */
  async reloadServer(serverId: string): Promise<void> {
    const config = mcpStore.get(serverId);
    if (!config) throw new Error(`MCP server not found: ${serverId}`);
    if (!config.enabled) {
      await this.stopServer(serverId);
      return;
    }
    await this.startServer(config);
  }

  /** 进程启动时加载：为 store 中所有 enabled 项尝试 start（失败仅打日志） */
  async loadAll(): Promise<void> {
    const configs = mcpStore.list().filter((item) => item.enabled);
    for (const config of configs) {
      try {
        await this.startServer(config);
      } catch (error) {
        console.error(`[mcp] failed to start ${config.name}:`, error);
      }
    }
  }

  /** 优雅退出：停止全部 MCP 连接 */
  async cleanup(): Promise<void> {
    const ids = [...this.clients.keys()];
    await Promise.all(ids.map((id) => this.stopServer(id)));
  }
}

export const mcpManager = new MCPManager();
