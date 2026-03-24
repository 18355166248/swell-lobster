import { randomUUID } from 'node:crypto';
import { getDb } from '../db/index.js';
import type { CreateMemoryInput, Memory, MemoryType, UpdateMemoryInput } from './types.js';

function nowIso(): string {
  return new Date().toISOString();
}

function clampImportance(value: number | undefined): number {
  const parsed = Number(value ?? 5);
  if (!Number.isFinite(parsed)) return 5;
  return Math.min(10, Math.max(1, Math.round(parsed)));
}

function normalizeTags(tags?: string[]): string[] {
  return [...new Set((tags ?? []).map((tag) => String(tag).trim()).filter(Boolean))];
}

function mapMemoryRow(row: Record<string, unknown>): Memory {
  return {
    id: String(row.id ?? ''),
    content: String(row.content ?? ''),
    memory_type: row.memory_type as MemoryType,
    source_session_id: row.source_session_id ? String(row.source_session_id) : undefined,
    tags: JSON.parse(String(row.tags ?? '[]')) as string[],
    importance: Number(row.importance ?? 5),
    access_count: Number(row.access_count ?? 0),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
    expires_at: row.expires_at ? String(row.expires_at) : undefined,
  };
}

export class MemoryStore {
  private readonly db = getDb();

  list(options?: { type?: MemoryType; limit?: number; offset?: number }): Memory[] {
    const limit = Number.isFinite(options?.limit) ? Math.max(1, Number(options?.limit)) : 50;
    const offset = Number.isFinite(options?.offset) ? Math.max(0, Number(options?.offset)) : 0;

    if (options?.type) {
      const rows = this.db
        .prepare(
          `
          SELECT *
          FROM memories
          WHERE memory_type = ?
          ORDER BY created_at DESC
          LIMIT ? OFFSET ?
        `
        )
        .all(options.type, limit, offset) as Record<string, unknown>[];
      return rows.map(mapMemoryRow);
    }

    const rows = this.db
      .prepare(
        `
        SELECT *
        FROM memories
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `
      )
      .all(limit, offset) as Record<string, unknown>[];
    return rows.map(mapMemoryRow);
  }

  get(id: string): Memory | undefined {
    const row = this.db.prepare(`SELECT * FROM memories WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? mapMemoryRow(row) : undefined;
  }

  create(input: CreateMemoryInput): Memory {
    const now = nowIso();
    const id = `mem_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const tags = normalizeTags(input.tags);

    this.db
      .prepare(
        `
        INSERT INTO memories (
          id, content, memory_type, source_session_id, tags, importance,
          access_count, created_at, updated_at, expires_at
        )
        VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
      `
      )
      .run(
        id,
        input.content.trim(),
        input.memory_type,
        input.source_session_id ?? null,
        JSON.stringify(tags),
        clampImportance(input.importance),
        now,
        now,
        input.expires_at ?? null
      );

    return this.get(id)!;
  }

  update(id: string, patch: UpdateMemoryInput): Memory {
    const existing = this.get(id);
    if (!existing) throw new Error('memory not found');

    const nextContent = patch.content?.trim() || existing.content;
    const nextImportance =
      patch.importance === undefined ? existing.importance : clampImportance(patch.importance);
    const nextTags = patch.tags === undefined ? existing.tags : normalizeTags(patch.tags);

    this.db
      .prepare(
        `
        UPDATE memories
        SET content = ?, importance = ?, tags = ?, updated_at = ?
        WHERE id = ?
      `
      )
      .run(nextContent, nextImportance, JSON.stringify(nextTags), nowIso(), id);

    return this.get(id)!;
  }

  delete(id: string): void {
    this.db.prepare(`DELETE FROM memories WHERE id = ?`).run(id);
  }

  clearAll(): void {
    this.db.prepare(`DELETE FROM memories`).run();
  }

  search(query: string, limit = 5): Memory[] {
    const keywords = [...new Set(query.split(/\s+/).map((item) => item.trim()).filter(Boolean))];
    if (keywords.length === 0) return [];

    const clauses = keywords.map(() => `(content LIKE '%' || ? || '%' OR tags LIKE '%' || ? || '%')`);
    const params = keywords.flatMap((keyword) => [keyword, keyword]);
    const rows = this.db
      .prepare(
        `
        SELECT *
        FROM memories
        WHERE (${clauses.join(' OR ')})
          AND (expires_at IS NULL OR expires_at > datetime('now'))
        ORDER BY importance DESC, access_count DESC, created_at DESC
        LIMIT ?
      `
      )
      .all(...params, Math.max(1, limit)) as Record<string, unknown>[];

    return rows.map(mapMemoryRow);
  }

  /**
   * 检索相关记忆
   * @param query 查询关键词
   * @param limit 限制返回数量
   * @returns 相关记忆列表
   */
  findRelevant(query: string, limit = 5): Memory[] {
    const keywords = [...new Set(query.split(/\s+/).map((item) => item.trim()).filter(Boolean))];
    if (keywords.length === 0) return [];

    const clauses = keywords.map(() => `(content LIKE '%' || ? || '%' OR tags LIKE '%' || ? || '%')`);
    const params = keywords.flatMap((keyword) => [keyword, keyword]);
    const rows = this.db
      .prepare(
        `
        SELECT *
        FROM memories
        WHERE (${clauses.join(' OR ')})
          AND (expires_at IS NULL OR expires_at > datetime('now'))
        ORDER BY importance DESC, access_count DESC, created_at DESC
        LIMIT ?
      `
      )
      .all(...params, Math.max(1, limit)) as Record<string, unknown>[];

    const memories = rows.map(mapMemoryRow);
    // 检索命中的记忆应计入 access_count，便于后续排序体现真实使用频率。
    const bumpStmt = this.db.prepare(
      `UPDATE memories SET access_count = access_count + 1, updated_at = ? WHERE id = ?`
    );
    const now = nowIso();
    for (const memory of memories) {
      bumpStmt.run(now, memory.id);
      memory.access_count += 1;
      memory.updated_at = now;
    }
    return memories;
  }
}

export const memoryStore = new MemoryStore();
