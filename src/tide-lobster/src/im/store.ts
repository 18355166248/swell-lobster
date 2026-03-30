/**
 * IM 通道配置的持久化层。
 *
 * 读写 `im_channels` 表；`status` / `error_message` 由 `IMManager` 在启停失败时更新。
 * 与 `imManager` 配合：列表 API 返回的「是否真在跑」需用管理器中的适配器状态覆盖 DB。
 */
import { randomUUID } from 'node:crypto';
import { getDb } from '../db/index.js';
import type { ChannelStatus, ChannelType, IMChannelConfig, IMChannelRow } from './types.js';

/** 将 SQLite 行转为业务层使用的布尔与解析后的 config */
function rowToConfig(row: IMChannelRow): IMChannelConfig {
  return {
    id: row.id,
    channel_type: row.channel_type,
    name: row.name,
    config: JSON.parse(row.config) as Record<string, unknown>,
    enabled: Boolean(row.enabled),
    status: row.status,
    error_message: row.error_message,
    created_at: row.created_at,
  };
}

export const imStore = {
  /** 全部通道，按创建时间升序 */
  list(): IMChannelConfig[] {
    const rows = getDb()
      .prepare(`SELECT * FROM im_channels ORDER BY created_at ASC`)
      .all() as IMChannelRow[];
    return rows.map(rowToConfig);
  },

  /** 按主键查询单条配置 */
  get(id: string): IMChannelConfig | undefined {
    const row = getDb().prepare(`SELECT * FROM im_channels WHERE id = ?`).get(id) as
      | IMChannelRow
      | undefined;
    return row ? rowToConfig(row) : undefined;
  },

  /** 新建通道；初始 `status` 为 `stopped`，需经 `start` API 或 `loadAll` 拉起 */
  create(data: {
    channel_type: ChannelType;
    name: string;
    config: Record<string, unknown>;
    enabled?: boolean;
  }): IMChannelConfig {
    const id = randomUUID();
    const now = new Date().toISOString();
    getDb()
      .prepare(
        `INSERT INTO im_channels (id, channel_type, name, config, enabled, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'stopped', ?)`
      )
      .run(
        id,
        data.channel_type,
        data.name,
        JSON.stringify(data.config),
        data.enabled ? 1 : 0,
        now
      );
    return this.get(id)!;
  },

  /**
   * 部分更新；仅对传入字段生成 SET，避免覆盖未修改列。
   * 注意：将 `enabled` 设为 false 不会自动停止进程内适配器，应由路由先调 `imManager.stopChannel`。
   */
  update(
    id: string,
    patch: Partial<{ name: string; config: Record<string, unknown>; enabled: boolean }>
  ): IMChannelConfig | undefined {
    const updates: string[] = [];
    const values: unknown[] = [];
    if (patch.name !== undefined) {
      updates.push('name = ?');
      values.push(patch.name);
    }
    if (patch.config !== undefined) {
      updates.push('config = ?');
      values.push(JSON.stringify(patch.config));
    }
    if (patch.enabled !== undefined) {
      updates.push('enabled = ?');
      values.push(patch.enabled ? 1 : 0);
    }
    if (updates.length === 0) return this.get(id);
    values.push(id);
    getDb()
      .prepare(`UPDATE im_channels SET ${updates.join(', ')} WHERE id = ?`)
      .run(...values);
    return this.get(id);
  },

  /** 物理删除行；调用方应先停止运行中的适配器 */
  delete(id: string): void {
    getDb().prepare(`DELETE FROM im_channels WHERE id = ?`).run(id);
  },

  /** 同步运行态与可选错误信息到 DB，供列表与排障展示 */
  setStatus(id: string, status: ChannelStatus, errorMessage?: string): void {
    getDb()
      .prepare(`UPDATE im_channels SET status = ?, error_message = ? WHERE id = ?`)
      .run(status, errorMessage ?? null, id);
  },
};
