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
  {
    version: 4,
    up: (db) => {
      // v4 同时引入 token 统计与长期记忆表，便于阶段 3 直接在同一迁移版本落地。
      db.exec(`
        CREATE TABLE IF NOT EXISTS token_stats (
          id TEXT PRIMARY KEY,
          date TEXT NOT NULL,
          endpoint_name TEXT,
          prompt_tokens INTEGER NOT NULL DEFAULT 0,
          completion_tokens INTEGER NOT NULL DEFAULT 0,
          total_tokens INTEGER NOT NULL DEFAULT 0,
          request_count INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_token_stats_date_endpoint
          ON token_stats(date, endpoint_name);
        CREATE INDEX IF NOT EXISTS idx_token_stats_date ON token_stats(date);

        CREATE TABLE IF NOT EXISTS memories (
          id TEXT PRIMARY KEY,
          content TEXT NOT NULL,
          memory_type TEXT NOT NULL CHECK(memory_type IN ('fact', 'preference', 'event', 'rule')),
          source_session_id TEXT,
          tags TEXT DEFAULT '[]',
          importance INTEGER DEFAULT 5 CHECK(importance BETWEEN 1 AND 10),
          access_count INTEGER DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          expires_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(memory_type);
        CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC);
        CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at DESC);
      `);
    },
  },
  {
    version: 5,
    up: (db) => {
      // 补建 memories 表：版本 4 的迁移可能在 memories 表加入前就已执行
      db.exec(`
        CREATE TABLE IF NOT EXISTS memories (
          id TEXT PRIMARY KEY,
          content TEXT NOT NULL,
          memory_type TEXT NOT NULL CHECK(memory_type IN ('fact', 'preference', 'event', 'rule')),
          source_session_id TEXT,
          tags TEXT DEFAULT '[]',
          importance INTEGER DEFAULT 5 CHECK(importance BETWEEN 1 AND 10),
          access_count INTEGER DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          expires_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(memory_type);
        CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC);
        CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at DESC);
      `);
    },
  },
  {
    version: 6,
    up: (db) => {
      db.exec(`ALTER TABLE chat_messages ADD COLUMN tool_invocations TEXT`);
    },
  },
  {
    version: 7,
    up: (db) => {
      // memories 表：增加提取来源标记、置信度、指纹去重字段
      db.exec(`ALTER TABLE memories ADD COLUMN is_explicit INTEGER NOT NULL DEFAULT 0`);
      db.exec(`ALTER TABLE memories ADD COLUMN confidence REAL NOT NULL DEFAULT 0.8`);
      db.exec(`ALTER TABLE memories ADD COLUMN fingerprint TEXT`);
      db.exec(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_fingerprint ON memories(fingerprint)`
      );
      // token_stats 表：增加 Prompt Caching 字段和成本字段
      db.exec(
        `ALTER TABLE token_stats ADD COLUMN cache_read_tokens INTEGER NOT NULL DEFAULT 0`
      );
      db.exec(
        `ALTER TABLE token_stats ADD COLUMN cache_write_tokens INTEGER NOT NULL DEFAULT 0`
      );
      db.exec(`ALTER TABLE token_stats ADD COLUMN cost_usd REAL NOT NULL DEFAULT 0`);
    },
  },
  {
    version: 8,
    up: (db) => {
      // 端点单价（美元/百万 tokens），用于 token_stats.cost_usd 估算
      db.exec(`ALTER TABLE llm_endpoints ADD COLUMN cost_per_1m_input REAL`);
      db.exec(`ALTER TABLE llm_endpoints ADD COLUMN cost_per_1m_output REAL`);

      // 会话消息全文检索（FTS5 unicode61，便于中文/CJK 检索）
      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
          content,
          content='chat_messages',
          content_rowid='rowid',
          tokenize='unicode61'
        );
      `);
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS messages_fts_insert AFTER INSERT ON chat_messages BEGIN
          INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
        END;
      `);
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS messages_fts_delete AFTER DELETE ON chat_messages BEGIN
          INSERT INTO messages_fts(messages_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
        END;
      `);
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS messages_fts_update AFTER UPDATE ON chat_messages BEGIN
          INSERT INTO messages_fts(messages_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
          INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
        END;
      `);
      // 已有历史消息一次性灌入 FTS
      db.exec(`
        INSERT INTO messages_fts(rowid, content) SELECT rowid, content FROM chat_messages;
      `);
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
