/**
 * MCP 服务端配置的 SQLite 持久化（表 `mcp_servers`）。
 */

import { randomUUID } from 'node:crypto';
import { getDb } from '../db/index.js';
import type {
  MCPServerConfig,
  MCPServerCreateInput,
  MCPServerStatus,
  MCPServerTransportType,
} from './types.js';

function nowIso(): string {
  return new Date().toISOString();
}

function parseHeaders(raw: unknown): Record<string, string> {
  if (!raw) return {};
  try {
    const o = JSON.parse(String(raw)) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(o).filter((e): e is [string, string] => typeof e[1] === 'string')
    );
  } catch {
    return {};
  }
}

/** 将查询行映射为领域对象（JSON 字段反序列化） */
function mapRow(row: Record<string, unknown>): MCPServerConfig {
  const t = row.type;
  const type: MCPServerTransportType =
    t === 'sse' || t === 'http' || t === 'stdio' ? t : 'stdio';
  return {
    id: String(row.id),
    name: String(row.name),
    type,
    command: String(row.command ?? ''),
    args: JSON.parse(String(row.args ?? '[]')) as string[],
    env: JSON.parse(String(row.env ?? '{}')) as Record<string, string>,
    registry_id: row.registry_id != null ? String(row.registry_id) : undefined,
    url: row.url != null && String(row.url).trim() !== '' ? String(row.url) : undefined,
    headers: parseHeaders(row.headers),
    enabled: Boolean(row.enabled),
    status: (row.status as MCPServerStatus) ?? 'stopped',
    error_message: row.error_message ? String(row.error_message) : undefined,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at ?? row.created_at),
  };
}

export class MCPStore {
  private readonly db = getDb();

  /** 全部服务端，按创建时间升序 */
  list(): MCPServerConfig[] {
    const rows = this.db
      .prepare(`SELECT * FROM mcp_servers ORDER BY created_at ASC`)
      .all() as Record<string, unknown>[];
    return rows.map(mapRow);
  }

  /** 按 id 查询单条配置 */
  get(id: string): MCPServerConfig | undefined {
    const row = this.db.prepare(`SELECT * FROM mcp_servers WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? mapRow(row) : undefined;
  }

  /** 插入新记录，初始 status 为 stopped */
  create(input: MCPServerCreateInput): MCPServerConfig {
    const id = randomUUID();
    const now = nowIso();
    const type: MCPServerTransportType = input.type ?? 'stdio';
    const command = (input.command ?? '').trim();
    const registryId = input.registry_id?.trim() || null;
    const url = input.url?.trim() || null;
    const headersJson = JSON.stringify(input.headers ?? {});

    this.db
      .prepare(
        `INSERT INTO mcp_servers (
          id, name, type, command, args, env, enabled, status, error_message,
          registry_id, url, headers, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'stopped', NULL, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.name.trim(),
        type,
        command,
        JSON.stringify(input.args ?? []),
        JSON.stringify(input.env ?? {}),
        input.enabled === false ? 0 : 1,
        registryId,
        url,
        headersJson,
        now,
        now
      );
    return this.get(id)!;
  }

  /** 部分更新；无变更字段时直接返回原记录 */
  update(
    id: string,
    patch: Partial<
      Pick<
        MCPServerConfig,
        | 'name'
        | 'type'
        | 'command'
        | 'args'
        | 'env'
        | 'enabled'
        | 'registry_id'
        | 'headers'
      >
    > & { url?: string | null }
  ): MCPServerConfig {
    const existing = this.get(id);
    if (!existing) throw new Error(`MCP server not found: ${id}`);

    const updates: string[] = [];
    const params: unknown[] = [];
    if (patch.name !== undefined) {
      updates.push('name = ?');
      params.push(patch.name.trim());
    }
    if (patch.type !== undefined) {
      updates.push('type = ?');
      params.push(patch.type);
    }
    if (patch.command !== undefined) {
      updates.push('command = ?');
      params.push(patch.command.trim());
    }
    if (patch.args !== undefined) {
      updates.push('args = ?');
      params.push(JSON.stringify(patch.args));
    }
    if (patch.env !== undefined) {
      updates.push('env = ?');
      params.push(JSON.stringify(patch.env));
    }
    if (patch.enabled !== undefined) {
      updates.push('enabled = ?');
      params.push(patch.enabled ? 1 : 0);
    }
    if (patch.registry_id !== undefined) {
      updates.push('registry_id = ?');
      params.push(patch.registry_id?.trim() || null);
    }
    if (patch.url !== undefined) {
      updates.push('url = ?');
      const u = patch.url;
      params.push(u === null || u === undefined || String(u).trim() === '' ? null : String(u).trim());
    }
    if (patch.headers !== undefined) {
      updates.push('headers = ?');
      params.push(JSON.stringify(patch.headers));
    }
    if (updates.length === 0) return existing;

    updates.push('updated_at = ?');
    params.push(nowIso(), id);
    this.db.prepare(`UPDATE mcp_servers SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    return this.get(id)!;
  }

  /** 删除配置行（调用方应先 stop MCP 进程） */
  delete(id: string): void {
    this.db.prepare(`DELETE FROM mcp_servers WHERE id = ?`).run(id);
  }

  /** 更新运行状态与可选错误信息（启动失败时写入 message） */
  setStatus(id: string, status: MCPServerStatus, errorMessage?: string): void {
    this.db
      .prepare(
        `UPDATE mcp_servers
         SET status = ?, error_message = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(status, errorMessage ?? null, nowIso(), id);
  }
}

export const mcpStore = new MCPStore();
