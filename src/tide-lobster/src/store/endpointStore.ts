import { getDb } from '../db/index.js';
import { randomUUID } from 'node:crypto';

export class EndpointStore {
  private db = getDb();

  listEndpoints(): any[] {
    const stmt = this.db.prepare('SELECT * FROM llm_endpoints ORDER BY priority ASC');
    return stmt.all();
  }

  updateEndpoints(endpoints: any[]): void {
    const deleteStmt = this.db.prepare('DELETE FROM llm_endpoints');
    const insertStmt = this.db.prepare(`
      INSERT INTO llm_endpoints (id, name, model, api_type, base_url, api_key_env, timeout, max_tokens, enabled, priority)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          ep.priority ?? 999
        );
      }
    });
    transaction();
  }
}
