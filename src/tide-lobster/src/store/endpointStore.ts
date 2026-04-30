import { getDb } from '../db/index.js';
import { randomUUID } from 'node:crypto';
import type { EndpointConfig } from '../chat/models.js';

type StoredEndpoint = EndpointConfig & {
  enabled: boolean;
  priority?: number | null;
  provider?: string | null;
  capabilities: string[];
  context_window?: number | null;
  rpm_limit?: number | null;
  cost_per_1m_input?: number | null;
  cost_per_1m_output?: number | null;
};

export class EndpointStore {
  private db = getDb();
  private readonly insertStmt = this.db.prepare(`
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

  listEndpoints(): StoredEndpoint[] {
    const stmt = this.db.prepare('SELECT * FROM llm_endpoints ORDER BY priority ASC');
    return stmt.all().map((row: any) => ({
      ...row,
      enabled: Boolean(row.enabled),
      capabilities: this.parseCapabilities(row.capabilities),
    }));
  }

  getDefaultEndpoint(): StoredEndpoint | null {
    return this.listEndpoints().find((endpoint) => endpoint.enabled) ?? null;
  }

  getEndpointById(id: string): StoredEndpoint | null {
    const row = this.db.prepare('SELECT * FROM llm_endpoints WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    if (!row) return null;
    return {
      ...(row as StoredEndpoint),
      enabled: Boolean(row.enabled),
      capabilities: this.parseCapabilities(row.capabilities),
    };
  }

  updateEndpoints(endpoints: any[]): void {
    const deleteStmt = this.db.prepare('DELETE FROM llm_endpoints');

    const transaction = this.db.transaction(() => {
      deleteStmt.run();
      for (const ep of endpoints) {
        this.insertEndpoint(ep);
      }
    });
    transaction();
  }

  createEndpoint(endpoint: any): StoredEndpoint {
    const id = endpoint.id ?? randomUUID();
    this.insertEndpoint({ ...endpoint, id });
    return this.getEndpointById(id)!;
  }

  updateEndpoint(id: string, endpoint: any): StoredEndpoint | null {
    const existing = this.getEndpointById(id);
    if (!existing) return null;
    this.db.prepare('DELETE FROM llm_endpoints WHERE id = ?').run(id);
    this.insertEndpoint({ ...endpoint, id });
    return this.getEndpointById(id);
  }

  deleteEndpoint(id: string): boolean {
    const result = this.db.prepare('DELETE FROM llm_endpoints WHERE id = ?').run(id);
    return result.changes > 0;
  }

  private insertEndpoint(ep: any): void {
    this.insertStmt.run(
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
