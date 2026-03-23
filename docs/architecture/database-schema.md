# 数据库 Schema 完整参考

> SQLite（better-sqlite3），单文件存储于 `data/tide-lobster.db`
> Migration 按版本号顺序执行，通过 `schema_version` 表追踪

---

## Migration 版本表

| 版本 | 阶段  | 内容                                                         |
| ---- | ----- | ------------------------------------------------------------ |
| 1    | 初始  | chat_sessions、chat_messages、llm_endpoints、key_value_store |
| 2    | 阶段1 | chat_sessions.persona_path、chat_messages.token_count        |
| 3    | 阶段2 | token_stats                                                  |
| 4    | 阶段3 | memories                                                     |
| 5    | 阶段4 | mcp_servers、scheduled_tasks                                 |
| 6    | 阶段5 | im_channels                                                  |

---

## 完整 Schema

### schema_version（系统表）

```sql
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER NOT NULL
);
```

---

### chat_sessions

```sql
CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  endpoint_name TEXT,
  persona_path TEXT,              -- 阶段1新增：如 "default.md"
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

---

### chat_messages

```sql
CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT,
  token_count INTEGER,            -- 阶段2新增：该条消息的 token 数
  created_at TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_messages_session ON chat_messages(session_id, sequence);
```

---

### llm_endpoints

```sql
CREATE TABLE IF NOT EXISTS llm_endpoints (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  model TEXT NOT NULL,
  api_type TEXT NOT NULL,         -- 'openai' | 'anthropic'
  base_url TEXT NOT NULL,
  api_key_env TEXT,               -- 环境变量名，如 "OPENAI_API_KEY"
  timeout INTEGER DEFAULT 60,
  max_tokens INTEGER DEFAULT 4096,
  enabled BOOLEAN DEFAULT TRUE,
  priority INTEGER DEFAULT 100,
  created_at TEXT NOT NULL
);
```

---

### key_value_store

```sql
CREATE TABLE IF NOT EXISTS key_value_store (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

---

### token_stats（阶段2）

```sql
CREATE TABLE IF NOT EXISTS token_stats (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,                    -- YYYY-MM-DD
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
```

---

### memories（阶段3）

```sql
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  memory_type TEXT NOT NULL CHECK(memory_type IN ('fact', 'preference', 'event', 'rule')),
  source_session_id TEXT,
  tags TEXT DEFAULT '[]',          -- JSON 数组
  importance INTEGER DEFAULT 5 CHECK(importance BETWEEN 1 AND 10),
  access_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT                  -- NULL 表示永不过期
);
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(memory_type);
CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC);
CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at DESC);
```

---

### mcp_servers（阶段4）

```sql
CREATE TABLE IF NOT EXISTS mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  command TEXT NOT NULL,
  args TEXT DEFAULT '[]',          -- JSON 数组
  env TEXT DEFAULT '{}',           -- JSON 对象，额外环境变量
  enabled BOOLEAN DEFAULT TRUE,
  status TEXT DEFAULT 'stopped',   -- 'running' | 'stopped' | 'error'
  error_message TEXT,
  created_at TEXT NOT NULL
);
```

---

### scheduled_tasks（阶段4）

```sql
CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  cron_expr TEXT NOT NULL,
  task_prompt TEXT NOT NULL,
  endpoint_name TEXT,
  enabled BOOLEAN DEFAULT TRUE,
  last_run_at TEXT,
  last_run_status TEXT,            -- 'success' | 'error' | 'timeout'
  last_run_result TEXT,
  next_run_at TEXT,
  created_at TEXT NOT NULL
);
```

---

### im_channels（阶段5）

```sql
CREATE TABLE IF NOT EXISTS im_channels (
  id TEXT PRIMARY KEY,
  channel_type TEXT NOT NULL,      -- 'telegram' | 'feishu' | 'dingtalk'
  name TEXT NOT NULL,
  config TEXT NOT NULL,            -- JSON，存储频道配置
  enabled BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'stopped',
  error_message TEXT,
  created_at TEXT NOT NULL
);
```

---

## Migration 实现参考

```typescript
// src/tide-lobster/src/db/index.ts

const migrations = [
  {
    version: 1,
    up: (db: Database) => {
      db.exec(`CREATE TABLE IF NOT EXISTS chat_sessions (...)`);
      db.exec(`CREATE TABLE IF NOT EXISTS chat_messages (...)`);
      db.exec(`CREATE TABLE IF NOT EXISTS llm_endpoints (...)`);
      db.exec(`CREATE TABLE IF NOT EXISTS key_value_store (...)`);
    },
  },
  {
    version: 2,
    up: (db: Database) => {
      db.exec(`ALTER TABLE chat_sessions ADD COLUMN persona_path TEXT`);
      db.exec(`ALTER TABLE chat_messages ADD COLUMN token_count INTEGER`);
    },
  },
  // ... 后续版本
];

export function initDb(dbPath: string): Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)`);
  const { v: currentVersion } = db
    .prepare(`SELECT COALESCE(MAX(version), 0) as v FROM schema_version`)
    .get() as { v: number };

  for (const m of migrations) {
    if (m.version > currentVersion) {
      db.transaction(() => {
        m.up(db);
        db.prepare(`INSERT INTO schema_version (version) VALUES (?)`).run(m.version);
      })();
    }
  }
  return db;
}
```
