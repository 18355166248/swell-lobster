import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { settings } from '../config.js';

const dbPath = join(settings.dataDir, 'tide-lobster.db');
mkdirSync(settings.dataDir, { recursive: true });

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
      db.exec(`ALTER TABLE token_stats ADD COLUMN cache_read_tokens INTEGER NOT NULL DEFAULT 0`);
      db.exec(`ALTER TABLE token_stats ADD COLUMN cache_write_tokens INTEGER NOT NULL DEFAULT 0`);
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
  {
    version: 9,
    up: (db) => {
      // Phase 4：MCP 服务端注册表 + 调度任务表（后续 v10 扩展列与运行历史）
      db.exec(`
        CREATE TABLE IF NOT EXISTS mcp_servers (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'stdio',
          command TEXT NOT NULL,
          args TEXT NOT NULL DEFAULT '[]',
          env TEXT NOT NULL DEFAULT '{}',
          enabled INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS scheduler_tasks (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          task_type TEXT NOT NULL DEFAULT 'reminder',
          trigger_type TEXT NOT NULL DEFAULT 'once',
          trigger_config TEXT NOT NULL DEFAULT '{}',
          prompt TEXT NOT NULL DEFAULT '',
          enabled INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          last_run_at TEXT
        );
      `);
    },
  },
  {
    version: 10,
    up: (db) => {
      const execSafe = (sql: string) => {
        try {
          db.exec(sql);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (!message.includes('duplicate column name')) throw error;
        }
      };

      execSafe(`ALTER TABLE llm_endpoints ADD COLUMN fallback_endpoint_id TEXT;`);
      execSafe(`ALTER TABLE mcp_servers ADD COLUMN status TEXT NOT NULL DEFAULT 'stopped';`);
      execSafe(`ALTER TABLE mcp_servers ADD COLUMN error_message TEXT;`);
      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_mcp_servers_name ON mcp_servers(name);
      `);

      execSafe(`ALTER TABLE scheduler_tasks ADD COLUMN description TEXT;`);
      execSafe(`ALTER TABLE scheduler_tasks ADD COLUMN cron_expr TEXT;`);
      execSafe(`ALTER TABLE scheduler_tasks ADD COLUMN task_prompt TEXT;`);
      execSafe(`ALTER TABLE scheduler_tasks ADD COLUMN endpoint_name TEXT;`);
      execSafe(`ALTER TABLE scheduler_tasks ADD COLUMN webhook_secret TEXT;`);
      execSafe(`ALTER TABLE scheduler_tasks ADD COLUMN next_run_at TEXT;`);

      db.exec(`
        UPDATE scheduler_tasks
        SET
          task_prompt = COALESCE(NULLIF(task_prompt, ''), prompt, ''),
          cron_expr = CASE
            WHEN cron_expr IS NOT NULL AND cron_expr != '' THEN cron_expr
            WHEN trigger_type = 'cron' THEN json_extract(trigger_config, '$.expression')
            ELSE cron_expr
          END
        WHERE task_prompt IS NULL OR task_prompt = '' OR cron_expr IS NULL;
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS scheduled_task_runs (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL,
          triggered_by TEXT NOT NULL,
          status TEXT NOT NULL,
          result TEXT,
          duration_ms INTEGER,
          created_at TEXT NOT NULL,
          FOREIGN KEY (task_id) REFERENCES scheduler_tasks(id) ON DELETE CASCADE
        );
      `);
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_scheduled_task_runs_task_created
        ON scheduled_task_runs(task_id, created_at DESC);
      `);
    },
  },
  {
    version: 11,
    up: (db) => {
      // IM 通道：多 Bot/多平台配置；`config` 为 JSON，敏感信息仅存 env 变量名
      db.exec(`
        CREATE TABLE IF NOT EXISTS im_channels (
          id TEXT PRIMARY KEY,
          channel_type TEXT NOT NULL,
          name TEXT NOT NULL,
          config TEXT NOT NULL DEFAULT '{}',
          enabled INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'stopped',
          error_message TEXT,
          created_at TEXT NOT NULL
        );
      `);
    },
  },
  {
    version: 13,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS skill_invocation_logs (
          id TEXT PRIMARY KEY,
          skill_name TEXT NOT NULL,
          trigger_type TEXT NOT NULL CHECK(trigger_type IN ('manual', 'llm_call')),
          invoked_by TEXT NOT NULL DEFAULT 'ui',
          input_context TEXT NOT NULL DEFAULT '',
          output TEXT,
          status TEXT NOT NULL CHECK(status IN ('success', 'failed')),
          error_message TEXT,
          duration_ms INTEGER,
          session_id TEXT,
          endpoint_name TEXT,
          created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_skill_invocation_logs_skill_created
          ON skill_invocation_logs(skill_name, created_at DESC);

        CREATE INDEX IF NOT EXISTS idx_skill_invocation_logs_created
          ON skill_invocation_logs(created_at DESC);
      `);
    },
  },
  {
    version: 14,
    up: (db) => {
      const execSafe = (sql: string) => {
        try {
          db.exec(sql);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (!message.includes('duplicate column name')) throw error;
        }
      };
      execSafe(`ALTER TABLE mcp_servers ADD COLUMN registry_id TEXT;`);
      execSafe(`ALTER TABLE mcp_servers ADD COLUMN url TEXT;`);
      execSafe(
        `ALTER TABLE mcp_servers ADD COLUMN headers TEXT NOT NULL DEFAULT '{}';`
      );
    },
  },
  {
    version: 15,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS journal_entries (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          title       TEXT NOT NULL DEFAULT '',
          content     TEXT NOT NULL DEFAULT '',
          category    TEXT NOT NULL DEFAULT '',
          tags        TEXT NOT NULL DEFAULT '[]',
          entry_date  TEXT NOT NULL,
          created_at  INTEGER NOT NULL,
          updated_at  INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_journal_entry_date ON journal_entries(entry_date);

        CREATE TABLE IF NOT EXISTS app_logs (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          level      TEXT NOT NULL,
          source     TEXT NOT NULL,
          message    TEXT NOT NULL,
          context    TEXT,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_app_logs_created ON app_logs(created_at);
      `);
    },
  },
  {
    version: 16,
    up: (db) => {
      // 消息有序内容块：保留文本与工具调用的原始执行顺序
      db.exec(`ALTER TABLE chat_messages ADD COLUMN blocks TEXT`);
    },
  },
  {
    version: 17,
    up: (db) => {
      db.exec(`ALTER TABLE chat_messages ADD COLUMN attachments TEXT`);
    },
  },
  {
    version: 18,
    up: (db) => {
      // 日记功能增强：心情、天气、地点、记忆提取标记
      const execSafe = (sql: string) => {
        try {
          db.exec(sql);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (!message.includes('duplicate column name')) throw error;
        }
      };

      execSafe(`ALTER TABLE journal_entries ADD COLUMN mood TEXT`);
      execSafe(`ALTER TABLE journal_entries ADD COLUMN weather TEXT`);
      execSafe(`ALTER TABLE journal_entries ADD COLUMN location TEXT`);
      execSafe(`ALTER TABLE journal_entries ADD COLUMN memory_extracted INTEGER NOT NULL DEFAULT 0`);

      // 记忆来源追踪：区分来自聊天、日记还是手动创建
      execSafe(`ALTER TABLE memories ADD COLUMN source_type TEXT NOT NULL DEFAULT 'chat'`);
      execSafe(`ALTER TABLE memories ADD COLUMN source_id TEXT`);

      // 为记忆来源创建索引，加速查询
      db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_source ON memories(source_type, source_id)`);
    },
  },
  {
    version: 19,
    up: (db) => {
      // 向量记忆：存储 embedding 向量（JSON 序列化的 float 数组），用于语义检索
      const execSafe = (sql: string) => {
        try {
          db.exec(sql);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (!message.includes('duplicate column name')) throw error;
        }
      };
      execSafe(`ALTER TABLE memories ADD COLUMN embedding TEXT`);
    },
  },
  {
    version: 20,
    up: (db) => {
      // 持久化 Agent 模板 ID，重启后可恢复 templateSystemPrompts
      const execSafe = (sql: string) => {
        try {
          db.exec(sql);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (!message.includes('duplicate column name')) throw error;
        }
      };
      execSafe(`ALTER TABLE chat_sessions ADD COLUMN template_id TEXT`);
    },
  },
  {
    version: 21,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS im_rate_stats (
          id TEXT PRIMARY KEY,
          channel_id TEXT NOT NULL,
          channel_type TEXT NOT NULL,
          user_id TEXT NOT NULL,
          day TEXT NOT NULL,
          minute_bucket TEXT NOT NULL,
          request_count INTEGER NOT NULL DEFAULT 0,
          blocked_count INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_im_rate_stats_bucket
          ON im_rate_stats(channel_id, user_id, day, minute_bucket);

        CREATE INDEX IF NOT EXISTS idx_im_rate_stats_channel_day
          ON im_rate_stats(channel_id, day);
      `);
    },
  },
  {
    version: 22,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS tool_approval_requests (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          tool_name TEXT NOT NULL,
          risk_level TEXT NOT NULL,
          arguments_json TEXT NOT NULL,
          summary TEXT NOT NULL,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          resolved_at TEXT,
          resolved_by TEXT,
          resolution_note TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_tool_approval_status_created
          ON tool_approval_requests(status, created_at DESC);

        CREATE INDEX IF NOT EXISTS idx_tool_approval_session_created
          ON tool_approval_requests(session_id, created_at DESC);
      `);
    },
  },
  {
    version: 23,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS tool_approval_session_grants (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          tool_name TEXT NOT NULL,
          created_at TEXT NOT NULL,
          created_by TEXT
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_tool_approval_session_grants_unique
          ON tool_approval_session_grants(session_id, tool_name);

        CREATE INDEX IF NOT EXISTS idx_tool_approval_session_grants_session
          ON tool_approval_session_grants(session_id, created_at DESC);
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
