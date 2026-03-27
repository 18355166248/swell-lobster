# 阶段 3：记忆系统与工具调用

> **状态**：已完成（2026-03-28）
> **目标**：长期记忆让 AI 更了解用户；Function Calling 让 AI 能执行任务。
> **预估工作量**：2-3 周（已交付）
> **新增依赖**：无（undici 已有，用于 search_web 工具）
> **前置条件**：阶段 1 已完成（systemPrompt 注入点存在）

下文各步骤为实施时的设计说明，已实现并可通过下方验证清单回归确认。

---

## 模块结构

```
src/tide-lobster/src/
  memory/
    types.ts           记忆类型定义
    store.ts           CRUD + 关键词搜索
    extractorService.ts  LLM 驱动的记忆提取（fire-and-forget）
  tools/
    types.ts           Tool / ToolCall 类型定义
    registry.ts        工具注册表（全局单例）
    executor.ts        工具执行调度器
    builtins/
      get_datetime.ts  获取当前时间（无网络依赖）
      read_memory.ts   读取记忆
      write_memory.ts  写入记忆
      search_web.ts    网页搜索（可选，需配置搜索 API）
```

---

## 步骤 1：记忆数据模型

**文件**：`src/tide-lobster/src/db/index.ts`（migration version 4）

```sql
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  memory_type TEXT NOT NULL CHECK(memory_type IN ('fact', 'preference', 'event', 'rule')),
  source_session_id TEXT,
  tags TEXT DEFAULT '[]',        -- JSON 数组，如 ["工作", "习惯"]
  importance INTEGER DEFAULT 5 CHECK(importance BETWEEN 1 AND 10),
  access_count INTEGER DEFAULT 0,
  -- 参考 LobsterAI coworkMemoryExtractor.ts / coworkMemoryJudge.ts 的设计
  is_explicit BOOLEAN DEFAULT FALSE, -- TRUE=用户主动触发（含"记住/记下"），FALSE=AI 自动提取
  confidence REAL DEFAULT 0.8,       -- 提取置信度 0.0-1.0（规则评分或 LLM 判断的信心分）
  fingerprint TEXT,                  -- content 归一化后的 16 位 SHA-1，用于精确去重
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT                -- NULL 表示永不过期
);
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(memory_type);
CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC);
CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_fingerprint ON memories(fingerprint);
```

**类型定义**：`src/tide-lobster/src/memory/types.ts`

```typescript
export type MemoryType = 'fact' | 'preference' | 'event' | 'rule';

export interface Memory {
  id: string;
  content: string;
  memory_type: MemoryType;
  source_session_id?: string;
  tags: string[];
  importance: number; // 1-10
  access_count: number;
  is_explicit: boolean; // 用户主动触发 vs AI 自动提取
  confidence: number; // 0.0-1.0
  fingerprint?: string; // 去重用
  created_at: string;
  updated_at: string;
  expires_at?: string;
}

export interface CreateMemoryInput {
  content: string;
  memory_type: MemoryType;
  source_session_id?: string;
  tags?: string[];
  importance?: number;
  is_explicit?: boolean;
  confidence?: number;
  expires_at?: string;
}
```

---

## 步骤 2：MemoryStore

**新建文件**：`src/tide-lobster/src/memory/store.ts`

```typescript
export class MemoryStore {
  list(options?: { type?: MemoryType; limit?: number; offset?: number }): Memory[];
  get(id: string): Memory | undefined;
  create(input: CreateMemoryInput): Memory;
  update(id: string, patch: Partial<Pick<Memory, 'content' | 'importance' | 'tags'>>): Memory;
  delete(id: string): void;

  // 关键词搜索（SQLite LIKE，多关键词 OR 逻辑）
  search(query: string, limit?: number): Memory[];

  // 检索相关记忆（供 ChatService 注入 system prompt）
  // 对 query 分词，匹配 content 和 tags，按 importance DESC 排序
  findRelevant(query: string, limit?: number): Memory[];
}
```

**findRelevant 实现**：

```sql
SELECT * FROM memories
WHERE (content LIKE '%' || ? || '%' OR tags LIKE '%' || ? || '%')
  AND (expires_at IS NULL OR expires_at > datetime('now'))
ORDER BY importance DESC, access_count DESC
LIMIT ?
```

调用后自动递增 `access_count`。

---

## 步骤 3：记忆提取器

**新建文件**：`src/tide-lobster/src/memory/extractorService.ts`

**触发时机**：每次 `ChatService` 收到完整 assistant 响应后，异步 fire-and-forget。

**LLM 提示词**：

```
你是记忆提取助手。分析以下对话，提取值得长期记住的信息。

只提取满足以下条件之一的信息：
1. 用户明确表达的偏好、习惯或个人信息
2. 用户纠正 AI 的规则（"不要...""以后..."）
3. 重要的事实或决定

以 JSON 数组格式返回，每条记忆：
{
  "content": "...",
  "memory_type": "fact|preference|event|rule",
  "importance": 1-10,
  "tags": ["标签1", "标签2"]
}

如果没有值得记录的信息，返回 []

对话内容：
{conversation}
```

**实现要点**：

**第一步：规则 pre-filter**（参考 LobsterAI `coworkMemoryExtractor.ts`，减少约 60% 无效 LLM 调用）：

```typescript
// 1. 显式触发检测：直接提取，跳过 LLM，is_explicit=true，confidence=1.0
const EXPLICIT_RE = /(?:请)?(?:记住|记下|帮我记|保存到记忆)[：:，,]?\s*(.+)/;

// 2. 以下情况直接跳过本轮，不调 LLM：
const DISCARD_RULES = [
  (text: string) => text.length < 50, // 对话太短
  (text: string) => /^(ok|好的|谢谢|没问题|收到|明白)[。！!]?$/i.test(text.trim()), // 纯礼貌回应
  (text: string) => /今天|昨天|最近|这次|这个|报错|bug|error/i.test(text), // 临时性内容
  (text: string) => text.trimEnd().endsWith('?') || text.trimEnd().endsWith('？'), // 纯问句
];
if (DISCARD_RULES.some((fn) => fn(lastUserMessage))) return; // 跳过提取
```

**第二步：LLM 提取**（通过 pre-filter 后才调用）：

使用同一端点的 LLM（低优先级，不影响正常对话），提取失败只记录日志，不抛错。

**第三步：基于 fingerprint 去重**（比字符重叠更准确）：

```typescript
import { createHash } from 'node:crypto';

function fingerprint(text: string): string {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
  return createHash('sha1').update(normalized).digest('hex').slice(0, 16);
}

// 写入时：fingerprint 冲突则更新置信度而非插入新条目
db.prepare(`
  INSERT INTO memories (id, content, ..., fingerprint, confidence)
  VALUES (?, ?, ..., ?, ?)
  ON CONFLICT(fingerprint) DO UPDATE SET
    confidence = MAX(confidence, excluded.confidence),
    access_count = access_count + 1,
    updated_at = excluded.updated_at
`).run(...);
```

---

## 步骤 4：修改 ChatService 注入记忆

**文件**：`src/tide-lobster/src/chat/service.ts`

在构建 system prompt 时追加相关记忆：

```typescript
const systemPrompt = identityService.loadSystemPrompt(session.persona_path);
const userMessage = messages.at(-1)?.content ?? '';
const relevantMemories = memoryStore.findRelevant(userMessage, 5);

if (relevantMemories.length > 0) {
  // 记忆块总字符上限 2000，防止大量记忆撑满 context（参考 LobsterAI 的截断保护设计）
  const MAX_MEMORY_BLOCK_CHARS = 2000;
  const memoryBlock = relevantMemories
    .map((m) => `- ${m.content}`)
    .join('\n')
    .slice(0, MAX_MEMORY_BLOCK_CHARS);
  systemPrompt += `\n\n## 关于用户的记忆\n${memoryBlock}`;
}
```

在流结束后，异步触发记忆提取：

```typescript
// fire-and-forget
extractorService.extractFromSession(sessionId, endpointConfig).catch(logger.error);
```

---

## 步骤 5：工具类型与注册表

**新建文件**：`src/tide-lobster/src/tools/types.ts`

```typescript
export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  enum?: string[];
  required?: boolean;
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
  execute(args: Record<string, unknown>): Promise<string>; // 返回文本结果
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}
```

**新建文件**：`src/tide-lobster/src/tools/registry.ts`

```typescript
export class ToolRegistry {
  private tools = new Map<string, ToolDef>();

  register(tool: ToolDef): void;
  unregister(name: string): void;
  get(name: string): ToolDef | undefined;
  listAll(): ToolDef[];

  // 转换为 LLM API 要求的格式
  toOpenAIFormat(): OpenAITool[];
  toAnthropicFormat(): AnthropicTool[];
}

export const globalToolRegistry = new ToolRegistry();
```

---

## 步骤 6：内置工具实现

**文件**：`src/tide-lobster/src/tools/builtins/get_datetime.ts`

```typescript
export const getDatetimeTool: ToolDef = {
  name: 'get_datetime',
  description: '获取当前日期和时间',
  parameters: {
    timezone: { type: 'string', description: '时区，如 "Asia/Shanghai"', required: false },
  },
  async execute({ timezone }) {
    const tz = (timezone as string) || 'Asia/Shanghai';
    return new Date().toLocaleString('zh-CN', { timeZone: tz });
  },
};
```

**文件**：`src/tide-lobster/src/tools/builtins/read_memory.ts`

```typescript
export const readMemoryTool: ToolDef = {
  name: 'read_memory',
  description: '搜索用户的长期记忆',
  parameters: {
    query: { type: 'string', description: '搜索关键词', required: true },
    limit: { type: 'number', description: '返回条数（默认5）', required: false },
  },
  async execute({ query, limit }) {
    const memories = memoryStore.search(String(query), Number(limit ?? 5));
    return memories.map((m) => `[${m.memory_type}] ${m.content}`).join('\n') || '未找到相关记忆';
  },
};
```

**文件**：`src/tide-lobster/src/tools/builtins/write_memory.ts`

```typescript
export const writeMemoryTool: ToolDef = {
  name: 'write_memory',
  description: '保存一条记忆',
  parameters: {
    content: { type: 'string', description: '记忆内容', required: true },
    memory_type: {
      type: 'string',
      description: 'fact/preference/event/rule',
      enum: ['fact', 'preference', 'event', 'rule'],
      required: true,
    },
    importance: { type: 'number', description: '重要性 1-10', required: false },
  },
  async execute({ content, memory_type, importance }) {
    memoryStore.create({
      content: String(content),
      memory_type: memory_type as MemoryType,
      importance: Number(importance ?? 5),
    });
    return '记忆已保存';
  },
};
```

**文件**：`src/tide-lobster/src/tools/builtins/delete_memory.ts`（新增）

```typescript
// AI 可主动调用此工具删除过时或错误的记忆（参考 LobsterAI 的显式删除机制）
export const deleteMemoryTool: ToolDef = {
  name: 'delete_memory',
  description: '删除一条不再有效的记忆（用于纠正过时信息）',
  parameters: {
    query: { type: 'string', description: '要删除的记忆关键词', required: true },
  },
  async execute({ query }) {
    const found = memoryStore.search(String(query), 1);
    if (!found.length) return '未找到匹配的记忆';
    memoryStore.delete(found[0].id);
    return `已删除记忆：${found[0].content}`;
  },
};
```

**启动时注册**：

```typescript
// src/tide-lobster/src/index.ts 或 tools/index.ts
globalToolRegistry.register(getDatetimeTool);
globalToolRegistry.register(readMemoryTool);
globalToolRegistry.register(writeMemoryTool);
globalToolRegistry.register(deleteMemoryTool);
```

---

## 步骤 7：扩展 llmClient 支持 tools

**文件**：`src/tide-lobster/src/chat/llmClient.ts`

在请求参数中增加 `tools`，返回值支持 `tool_calls`：

```typescript
interface ChatCompletionRequest {
  // ...现有字段...
  tools?: OpenAITool[] | AnthropicTool[];
}

interface ChatCompletionResult {
  content: string;
  tool_calls?: ToolCall[];
  usage?: LLMUsage;
}
```

**OpenAI 格式**：`{ type: "function", function: { name, description, parameters } }`
**Anthropic 格式**：`{ name, description, input_schema }`（从 OpenAI 格式转换）

---

## 步骤 8：工具调用循环（ChatService）

**文件**：`src/tide-lobster/src/chat/service.ts`

```typescript
const MAX_TOOL_ROUNDS = 5;
let round = 0;
let currentMessages = [...historyMessages];

while (round < MAX_TOOL_ROUNDS) {
  const result = await llmClient.requestChatCompletion({
    messages: currentMessages,
    tools: globalToolRegistry.toOpenAIFormat(),
    systemPrompt,
  });

  if (!result.tool_calls?.length) {
    // 无工具调用，直接返回最终结果
    return result.content;
  }

  // 执行工具（参考 LobsterAI coworkRunner.ts 的 TOOL_RESULT_MAX_CHARS 截断保护）
  const TOOL_RESULT_MAX_CHARS = 20_000;
  for (const tc of result.tool_calls) {
    const tool = globalToolRegistry.get(tc.name);
    const rawResult = tool ? await tool.execute(tc.arguments) : `工具 ${tc.name} 不存在`;
    // 超长结果截断，防止撑满 context window
    const toolResult =
      rawResult.length > TOOL_RESULT_MAX_CHARS
        ? rawResult.slice(0, TOOL_RESULT_MAX_CHARS) +
          `\n...[输出过长已截断，共 ${rawResult.length} 字符]`
        : rawResult;
    currentMessages.push(
      { role: 'assistant', content: null, tool_calls: [tc] },
      { role: 'tool', tool_call_id: tc.id, content: toolResult }
    );
    // SSE 通知前端工具执行状态（见步骤9）
  }
  round++;
}
```

---

## 步骤 9：SSE 工具事件

**文件**：`src/tide-lobster/src/chat/service.ts`（流式响应中）

在工具执行时向 SSE 流推送特殊事件（补充调用参数和截断标记）：

```
// 执行开始：携带调用参数（便于前端展示"正在用什么参数调用"）
data: {"type":"tool_call","name":"read_memory","status":"running","args":{"query":"用户偏好"}}

// 执行结束：携带结果摘要 + 是否截断标记
data: {"type":"tool_result","name":"read_memory","content":"[偏好] 喜欢简洁...","truncated":false}

// 截断示例
data: {"type":"tool_result","name":"search_web","content":"...前20000字符...","truncated":true,"original_length":45000}
```

前端接收处理：

```typescript
// ChatMessage 气泡下方展示折叠的工具调用信息
// event.type === 'tool_call' → 显示 "正在执行：read_memory（query: 用户偏好）"
// event.type === 'tool_result' → 替换为折叠卡片，可展开查看结果；truncated=true 时显示截断提示
```

---

## 步骤 10：记忆管理 API

**文件**：`src/tide-lobster/src/api/routes/memory.ts`（已实现）

```
GET    /api/memories                  列出记忆（?type=&limit=&offset=）
GET    /api/memories/search?q=        关键词搜索
POST   /api/memories                  手动创建
PATCH  /api/memories/:id              编辑 content/importance/tags
DELETE /api/memories/:id              删除单条
DELETE /api/memories?confirm=true     清空所有记忆
POST   /api/memories/extract/:sessionId  手动从指定会话提取记忆
```

---

## 步骤 11：前端记忆管理页

**文件**：`apps/web-ui/src/pages/Memory/index.tsx`

已实现：

- 顶部：类型过滤（全部/事实/偏好/事件/规则）+ 关键词搜索框
- 记忆列表：Ant Design Table（内容、类型 Tag、重要性 1-10、创建时间）
- 行操作：编辑（Modal）、删除（确认）
- 手动添加记忆按钮（Modal 表单）
- 危险操作：清空全部记忆（确认）

---

## i18n 新增翻译键

```typescript
// zh.ts
memory: {
  // 扩展现有
  types: { fact: '事实', preference: '偏好', event: '事件', rule: '规则' },
  importance: '重要性',
  addMemory: '添加记忆',
  editMemory: '编辑记忆',
  clearAll: '清空所有记忆',
  clearConfirm: '确定要清空所有记忆？此操作不可恢复',
  extractFrom: '从会话提取记忆',
  noMemories: '暂无记忆',
  searchPlaceholder: '搜索记忆内容...',
},
chat: {
  // 新增工具调用相关
  toolCalling: '正在执行工具...',
  toolResult: '工具执行结果',
},
```

---

## 验证清单

- [x] 告知 AI "我喜欢简洁的回答"，结束会话后查 `memories` 表有新记录
- [x] 下次新建会话，system prompt 中出现该记忆
- [x] 聊天中问 "现在几点了"，AI 调用 `get_datetime` 工具并返回正确时间
- [x] SSE 流式中出现 `tool_call` / `tool_result` 事件，前端显示工具执行状态（含参数）
- [x] 工具调用超过 5 轮时停止并返回已有内容
- [x] 记忆管理页正常显示、编辑、删除记忆
- [x] 手动添加记忆后在聊天中可被检索到
- [x] 说"记住我喜欢 TypeScript"，记忆 `is_explicit=true`，`confidence=1.0`，无需等待 LLM 提取
- [x] 对话只有"好的/OK"时，规则 pre-filter 拦截，后端日志无 LLM 提取调用
- [x] 同一内容第二次提取时，fingerprint 冲突，`access_count` +1，不新增条目
- [x] 工具返回超过 20000 字符时，SSE `content` 字段被截断，`truncated=true`，含原始长度
- [x] 告知 AI "删除我的偏好记忆"，AI 调用 `delete_memory` 工具完成删除
- [x] 注入记忆块超过 2000 字符时自动截断，不影响正常响应
