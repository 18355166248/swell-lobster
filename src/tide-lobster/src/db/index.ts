import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { settings } from '../config.js';

const dbPath = join(settings.projectRoot, 'data', 'tide-lobster.db');
mkdirSync(join(settings.projectRoot, 'data'), { recursive: true });

const db = new Database(dbPath);

// Run migrations
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

export function getDb(): Database.Database {
  return db;
}
