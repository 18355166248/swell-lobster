import { getDb } from '../db/index.js';
import { randomUUID } from 'node:crypto';

export class EndpointStore {
  private db = getDb();

  listEndpoints(): any[] {
    const stmt = this.db.prepare('SELECT * FROM llm_endpoints ORDER BY priority ASC');
    return stmt.all().map((row: any) => ({
      ...row,
      enabled: Boolean(row.enabled),
      capabilities: this.parseCapabilities(row.capabilities),
    }));
  }

  updateEndpoints(endpoints: any[]): void {
    const deleteStmt = this.db.prepare('DELETE FROM llm_endpoints');
    const insertStmt = this.db.prepare(`
      INSERT INTO llm_endpoints (
        id,
        name,
        model,
        api_type,
        base_url,
        api_key_env,
        timeout,
        max_tokens,
        enabled,
        priority,
        provider,
        capabilities,
        context_window,
        rpm_limit,
        fallback_endpoint_id,
        cost_per_1m_input,
        cost_per_1m_output
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction(() => {
      deleteStmt.run();
      for (const ep of endpoints) {
        insertStmt.run(
          ep.id ?? randomUUID(),
          ep.name,
          ep.model,
          ep.api_type,
          ep.base_url,
          ep.api_key_env,
          ep.timeout,
          ep.max_tokens,
          ep.enabled === false ? 0 : 1,
          ep.priority ?? 999,
          ep.provider ?? null,
          JSON.stringify(this.normalizeCapabilities(ep.capabilities)),
          ep.context_window ?? null,
          ep.rpm_limit ?? null,
          ep.fallback_endpoint_id ?? null,
          ep.cost_per_1m_input ?? null,
          ep.cost_per_1m_output ?? null
        );
      }
    });
    transaction();
  }

  private parseCapabilities(raw: unknown): string[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.filter((item): item is string => typeof item === 'string');
    if (typeof raw !== 'string') return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string')
        : [];
    } catch {
      return [];
    }
  }

  private normalizeCapabilities(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter((item): item is string => typeof item === 'string');
  }
}
