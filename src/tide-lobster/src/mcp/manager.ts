/**
 * MCP 生命周期：按配置启动 stdio / SSE / Streamable HTTP 客户端、拉取工具并注册到全局 ToolRegistry。
 * 关闭时断开连接并卸载对应 `mcp_<serverId>_*` 工具。
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { basename } from 'node:path';
import { mcpStore } from './store.js';
import { mcpToolBridge } from './toolBridge.js';
import type { MCPServerConfig, MCPToolInfo } from './types.js';
import { getFetchDispatcherForUrl } from '../net/fetchDispatcher.js';

/** 已连接的 MCP 客户端与其传输（便于 close 时一并释放） */
type ManagedClient = {
  client: Client;
  transport: Transport;
};

/** 合并进程环境与子进程专属 env，并去掉非 string 项（SDK 要求） */
function mergeEnv(
  extra: Record<string, string>,
  config?: MCPServerConfig
): Record<string, string> {
  const merged = { ...process.env, ...extra };
  if (config && usesEphemeralPackageExecutor(config)) {
    const registry = resolveEphemeralRegistryOverride(config);
    if (registry) {
      merged.npm_config_registry = registry;
      merged.NPM_CONFIG_REGISTRY = registry;
    }
  }
  return Object.fromEntries(
    Object.entries(merged).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string'
    )
  );
}

function buildRemoteRequestInit(
  url: string,
  headers: Record<string, string>
): RequestInit & { dispatcher: unknown } {
  return {
    ...(Object.keys(headers).length > 0 ? { headers: { ...headers } } : {}),
    dispatcher: getFetchDispatcherForUrl(url),
  } as RequestInit & { dispatcher: unknown };
}

function createTransport(config: MCPServerConfig): Transport {
  const t = config.type ?? 'stdio';
  if (t === 'stdio') {
    return new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: mergeEnv(config.env, config),
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
  const requestInit = buildRemoteRequestInit(rawUrl, config.headers ?? {});
  const opts = { requestInit };
  if (t === 'sse') {
    return new SSEClientTransport(parsedUrl, opts);
  }
  return new StreamableHTTPClientTransport(parsedUrl, opts);
}

function readTimeoutMs(
  value: string | undefined,
  fallback: number
): number {
  const raw = Number(value);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

function commandBase(command: string): string {
  return basename(command.trim()).toLowerCase();
}

export function resolveEphemeralRegistryOverride(
  config: MCPServerConfig,
  env: NodeJS.ProcessEnv = process.env
): string {
  if (!usesEphemeralPackageExecutor(config)) return '';
  return env.SWELL_MCP_NPX_REGISTRY?.trim() ?? '';
}

export function usesEphemeralPackageExecutor(config: MCPServerConfig): boolean {
  if ((config.type ?? 'stdio') !== 'stdio') return false;
  const base = commandBase(config.command);
  if (base === 'npx' || base === 'bunx') return true;
  if (base === 'pnpm') {
    return (config.args[0] ?? '').trim().toLowerCase() === 'dlx';
  }
  return false;
}

export function resolveConnectTimeoutMs(
  config: MCPServerConfig,
  env: NodeJS.ProcessEnv = process.env
): number {
  const baseTimeoutMs = readTimeoutMs(env.SWELL_MCP_CONNECT_TIMEOUT_MS, 15_000);
  if (!usesEphemeralPackageExecutor(config)) return baseTimeoutMs;
  const ephemeralTimeoutMs = readTimeoutMs(
    env.SWELL_MCP_EPHEMERAL_CONNECT_TIMEOUT_MS,
    60_000
  );
  return Math.max(baseTimeoutMs, ephemeralTimeoutMs);
}

export function buildTimeoutMessage(
  config: MCPServerConfig,
  stage: 'connect' | 'listTools',
  timeoutMs: number
): string {
  const prefix = `MCP[${config.name}] ${stage} timed out after ${timeoutMs}ms`;
  if ((config.type ?? 'stdio') === 'stdio') {
    if (usesEphemeralPackageExecutor(config)) {
      return `${prefix}. This server is started via ${commandBase(config.command)}, which may need extra time on first launch to download packages. Retry after the package is cached, preinstall the package locally, or raise SWELL_MCP_EPHEMERAL_CONNECT_TIMEOUT_MS / SWELL_MCP_CONNECT_TIMEOUT_MS.`;
    }
    return `${prefix}. Verify the command starts an MCP stdio server without interactive prompts and that it can launch from the current environment.`;
  }
  return `${prefix}. Verify the MCP endpoint URL, authentication headers, and network connectivity.`;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

export class MCPManager {
  private readonly clients = new Map<string, ManagedClient>();

  /** 启动并连接；先停旧实例，再注册工具并更新 store 状态 */
  async startServer(config: MCPServerConfig): Promise<void> {
    await this.stopServer(config.id);
    const transport = createTransport(config);
    const client = new Client({
      name: 'swell-lobster',
      version: '1.0.0',
    });
    const connectTimeoutMs = resolveConnectTimeoutMs(config);
    try {
      await withTimeout(
        client.connect(transport),
        connectTimeoutMs,
        `MCP[${config.name}] connect`
      );
      const result = await withTimeout(
        client.listTools(),
        connectTimeoutMs,
        `MCP[${config.name}] listTools`
      );
      const tools = Array.isArray(result.tools) ? (result.tools as MCPToolInfo[]) : [];
      for (const tool of tools) {
        mcpToolBridge.registerMCPTool(config.id, tool, client);
      }

      this.clients.set(config.id, { client, transport });
      mcpStore.setStatus(config.id, 'running');
    } catch (error) {
      // 超时或连接失败时主动释放 transport，避免句柄泄漏
      try {
        await client.close();
      } catch {
        // ignore
      }
      try {
        await transport.close();
      } catch {
        // ignore
      }
      const message =
        error instanceof Error
          ? error.message.replace(
              `MCP[${config.name}] connect timed out after ${connectTimeoutMs}ms`,
              buildTimeoutMessage(config, 'connect', connectTimeoutMs)
            ).replace(
              `MCP[${config.name}] listTools timed out after ${connectTimeoutMs}ms`,
              buildTimeoutMessage(config, 'listTools', connectTimeoutMs)
            )
          : String(error);
      mcpStore.setStatus(config.id, 'error', message);
      throw new Error(message);
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

  /** 进程启动时加载：为 store 中所有 enabled 项并行 start（失败仅打日志，互不阻塞） */
  async loadAll(): Promise<void> {
    const configs = mcpStore.list().filter((item) => item.enabled);
    await Promise.allSettled(
      configs.map(async (config) => {
        try {
          await this.startServer(config);
        } catch (error) {
          console.error(`[mcp] failed to start ${config.name}:`, error);
        }
      })
    );
  }

  /** 优雅退出：停止全部 MCP 连接 */
  async cleanup(): Promise<void> {
    const ids = [...this.clients.keys()];
    await Promise.all(ids.map((id) => this.stopServer(id)));
  }
}

export const mcpManager = new MCPManager();
