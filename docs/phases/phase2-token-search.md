# 阶段 2：Token 统计与会话搜索

> **目标**：记录每次对话的 token 消耗并聚合展示；支持跨会话关键词搜索。
> **预估工作量**：1 周
> **新增依赖**：无（前端图表可选 `recharts`）
> **注意**：可与阶段 1 并行启动，`usage` 字段在阶段 1 修改 llmClient 时顺带处理

---

## 步骤 1：llmClient 返回 usage

**文件**：`src/tide-lobster/src/chat/llmClient.ts`

扩展返回值类型：

```typescript
export interface LLMUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatCompletionResult {
  content: string;
  usage?: LLMUsage;
}
```

**OpenAI 协议**：响应体直接包含 `usage` 字段，直接取用。

**Anthropic 协议**：

- 非流式：响应体字段为 `{ input_tokens, output_tokens }`，做映射
- 流式：`message_start` 事件中包含 `usage`，在解析 SSE 时提取并在流结束时返回

**流式处理要点**：

```typescript
// Anthropic 流式
let usage: LLMUsage | undefined;
// 解析 SSE 时
if (event.type === 'message_start') {
  usage = {
    prompt_tokens: event.message.usage.input_tokens,
    completion_tokens: 0,
    total_tokens: event.message.usage.input_tokens,
  };
}
if (event.type === 'message_delta') {
  if (usage && event.usage) {
    usage.completion_tokens = event.usage.output_tokens;
    usage.total_tokens = usage.prompt_tokens + usage.completion_tokens;
  }
}
// 流结束时通过 callback 传出 usage
```

**无 usage 时的 fallback**：字符数估算

```typescript
function estimateTokens(text: string): number {
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const otherChars = text.length - chineseChars;
  return Math.ceil(chineseChars / 3 + otherChars / 4);
}
```

---

## 步骤 2：新增 token_stats 表

**文件**：`src/tide-lobster/src/db/index.ts`（migration version 3）

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

## 步骤 3：ChatService 写入统计

**文件**：`src/tide-lobster/src/chat/service.ts`

在 `appendTurn()` 完成后（或 stream 结束时）：

```typescript
// 1. 写入消息的 token_count
db.prepare(`UPDATE chat_messages SET token_count = ? WHERE id = ?`).run(
  usage.total_tokens,
  messageId
);

// 2. Upsert token_stats（当天 + 端点维度）
const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
db.prepare(
  `
  INSERT INTO token_stats (id, date, endpoint_name, prompt_tokens, completion_tokens, total_tokens, request_count, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, 1, ?)
  ON CONFLICT(date, endpoint_name) DO UPDATE SET
    prompt_tokens = prompt_tokens + excluded.prompt_tokens,
    completion_tokens = completion_tokens + excluded.completion_tokens,
    total_tokens = total_tokens + excluded.total_tokens,
    request_count = request_count + 1,
    updated_at = excluded.updated_at
`
).run(
  id,
  today,
  endpointName,
  usage.prompt_tokens,
  usage.completion_tokens,
  usage.total_tokens,
  new Date().toISOString()
);
```

---

## 步骤 4：实现 tokenStats 路由

**新建文件**：`src/tide-lobster/src/api/routes/tokenStats.ts`（替换占位）

```
GET /api/stats/tokens               汇总（今日/本周/本月/全部）
GET /api/stats/tokens/daily         按日分组（最近 30 天）
GET /api/stats/tokens/by-endpoint   按端点分组
```

**汇总 SQL**：

```sql
-- 今日
SELECT SUM(total_tokens) as total, SUM(request_count) as requests
FROM token_stats WHERE date = date('now', 'localtime');

-- 本周
SELECT SUM(total_tokens), SUM(request_count)
FROM token_stats WHERE date >= date('now', '-6 days', 'localtime');

-- 本月
SELECT SUM(total_tokens), SUM(request_count)
FROM token_stats WHERE date >= date('now', 'start of month', 'localtime');
```

**按日返回格式**：

```json
[
  { "date": "2026-03-23", "total_tokens": 12450, "request_count": 8 },
  { "date": "2026-03-22", "total_tokens": 8230, "request_count": 5 }
]
```

---

## 步骤 5：会话搜索 API

**文件**：`src/tide-lobster/src/api/routes/chat.ts`（追加）

```
GET /api/sessions/search?q=关键词&limit=20
```

实现（SQLite LIKE）：

```typescript
app.get('/api/sessions/search', (c) => {
  const q = c.req.query('q') ?? '';
  const limit = Math.min(parseInt(c.req.query('limit') ?? '20'), 50);
  if (!q.trim()) return c.json([]);

  const results = db
    .prepare(
      `
    SELECT m.id, m.content, m.role, m.created_at,
           s.id as session_id, s.title as session_title
    FROM chat_messages m
    JOIN chat_sessions s ON s.id = m.session_id
    WHERE m.content LIKE '%' || ? || '%'
    ORDER BY m.created_at DESC
    LIMIT ?
  `
    )
    .all(q, limit);

  return c.json(results);
});
```

**后续优化**（量大时）：升级为 SQLite FTS5：

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  content, content='chat_messages', content_rowid='rowid'
);
```

---

## 步骤 6：前端 TokenStats 页面

**文件**：`apps/web-ui/src/pages/TokenStats/index.tsx`

填充当前空壳页面：

**布局（上→下）**：

1. 统计卡片行：今日 / 本周 / 本月 / 累计（调用 `GET /api/stats/tokens`）
2. 按端点明细表（Ant Design Table，调用 `GET /api/stats/tokens/by-endpoint`）
3. 近 30 天趋势（可选：`recharts` LineChart 或简单表格）

**卡片数据格式**：

| 今日 tokens | 本周 tokens | 本月 tokens | 累计 tokens |
| ----------- | ----------- | ----------- | ----------- |
| 12,450      | 65,230      | 234,100     | 1,234,567   |

---

## 步骤 7：前端会话搜索

**文件**：`apps/web-ui/src/pages/Chat/components/SessionList.tsx`（修改）

在会话列表顶部增加搜索框：

- 输入时 debounce 300ms 调用 `GET /api/sessions/search?q=`
- 搜索结果列表：显示消息摘要 + 所属会话标题
- 点击搜索结果 → 切换到对应会话

---

## i18n 新增翻译键

```typescript
// zh.ts
tokenStats: {
  // 新增
  today: '今日',
  thisWeek: '本周',
  thisMonth: '本月',
  total: '累计',
  tokens: 'Tokens',
  requests: '请求数',
  byEndpoint: '按端点',
  dailyTrend: '每日趋势',
},
chat: {
  // 新增
  searchPlaceholder: '搜索历史消息...',
  searchNoResult: '未找到相关消息',
},
```

---

## 验证清单

- [ ] 发送消息后，`chat_messages.token_count` 有值
- [ ] `token_stats` 表今日记录每次请求后 `total_tokens` 累加
- [ ] `GET /api/stats/tokens` 返回正确的汇总数据
- [ ] TokenStats 页面卡片展示今日/本周/本月数据
- [ ] 会话搜索框输入关键词后返回匹配的消息列表
- [ ] 无 usage 响应时 fallback 估算不报错
