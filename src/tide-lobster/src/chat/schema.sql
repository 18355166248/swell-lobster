-- Chat sessions table
CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  endpoint_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Chat messages table
-- tool_invocations：助手消息上多轮工具执行的 JSON 轨迹（由迁移 v6 添加，新建库可一并建列）
CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  tool_invocations TEXT,
  FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated_at ON chat_sessions(updated_at);