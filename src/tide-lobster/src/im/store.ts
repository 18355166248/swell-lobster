import { randomUUID } from 'node:crypto';
import { getDb } from '../db/index.js';
import type { ChannelStatus, ChannelType, IMChannelConfig, IMChannelRow } from './types.js';

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
  list(): IMChannelConfig[] {
    const rows = getDb()
      .prepare(`SELECT * FROM im_channels ORDER BY created_at ASC`)
      .all() as IMChannelRow[];
    return rows.map(rowToConfig);
  },

  get(id: string): IMChannelConfig | undefined {
    const row = getDb()
      .prepare(`SELECT * FROM im_channels WHERE id = ?`)
      .get(id) as IMChannelRow | undefined;
    return row ? rowToConfig(row) : undefined;
  },

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
      .run(id, data.channel_type, data.name, JSON.stringify(data.config), data.enabled ? 1 : 0, now);
    return this.get(id)!;
  },

  update(
    id: string,
    patch: Partial<{ name: string; config: Record<string, unknown>; enabled: boolean }>
  ): IMChannelConfig | undefined {
    const updates: string[] = [];
    const values: unknown[] = [];
    if (patch.name !== undefined) { updates.push('name = ?'); values.push(patch.name); }
    if (patch.config !== undefined) { updates.push('config = ?'); values.push(JSON.stringify(patch.config)); }
    if (patch.enabled !== undefined) { updates.push('enabled = ?'); values.push(patch.enabled ? 1 : 0); }
    if (updates.length === 0) return this.get(id);
    values.push(id);
    getDb().prepare(`UPDATE im_channels SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    return this.get(id);
  },

  delete(id: string): void {
    getDb().prepare(`DELETE FROM im_channels WHERE id = ?`).run(id);
  },

  setStatus(id: string, status: ChannelStatus, errorMessage?: string): void {
    getDb()
      .prepare(`UPDATE im_channels SET status = ?, error_message = ? WHERE id = ?`)
      .run(status, errorMessage ?? null, id);
  },
};
