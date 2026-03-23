import { getDb } from '../db/index.js';

export class KeyValueStore {
  private db = getDb();

  getValue(key: string): string | undefined {
    const stmt = this.db.prepare('SELECT value FROM key_value_store WHERE key = ?');
    const row = stmt.get(key) as any;
    return row?.value;
  }

  setValue(key: string, value: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO key_value_store (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    stmt.run(key, value);
  }
}
