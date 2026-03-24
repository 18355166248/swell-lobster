import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { settings } from '../config.js';

const dbPath = join(settings.projectRoot, 'data', 'tide-lobster.db');
mkdirSync(join(settings.projectRoot, 'data'), { recursive: true });

const db = new Database(dbPath);

const migrations: Array<{ version: number; up: (db: Database.Database) => void }> = [
  {
    version: 1,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS chat_sessions (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          endpoint_name TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS chat_messages (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
          content TEXT NOT NULL,
          created_at TEXT NOT NULL,
          sequence INTEGER NOT NULL,
          FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS llm_endpoints (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          model TEXT NOT NULL,
          api_type TEXT NOT NULL,
          base_url TEXT,
          api_key_env TEXT,
          timeout INTEGER,
          max_tokens INTEGER,
          enabled BOOLEAN NOT NULL DEFAULT TRUE,
          priority INTEGER NOT NULL DEFAULT 999
        );

        CREATE TABLE IF NOT EXISTS key_value_store (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);
        CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);
        CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated_at ON chat_sessions(updated_at);
      `);
    },
  },
  {
    version: 2,
    up: (db) => {
      db.exec(`ALTER TABLE chat_sessions ADD COLUMN persona_path TEXT`);
      db.exec(`ALTER TABLE chat_messages ADD COLUMN token_count INTEGER`);
    },
  },
  {
    version: 3,
    up: (db) => {
      db.exec(`ALTER TABLE llm_endpoints ADD COLUMN provider TEXT`);
      db.exec(`ALTER TABLE llm_endpoints ADD COLUMN capabilities TEXT`);
      db.exec(`ALTER TABLE llm_endpoints ADD COLUMN context_window INTEGER`);
      db.exec(`ALTER TABLE llm_endpoints ADD COLUMN rpm_limit INTEGER`);
    },
  },
];

function runMigrations(db: Database.Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)`);
  const row = db.prepare(`SELECT MAX(version) as v FROM schema_version`).get() as {
    v: number | null;
  };
  const currentVersion = row?.v ?? 0;
  for (const m of migrations) {
    if (m.version > currentVersion) {
      m.up(db);
      db.prepare(`INSERT INTO schema_version (version) VALUES (?)`).run(m.version);
    }
  }
}

runMigrations(db);

export function getDb(): Database.Database {
  return db;
}
