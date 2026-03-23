# 阶段 3：记忆系统与工具调用

> **目标**：长期记忆让 AI 更了解用户；Function Calling 让 AI 能执行任务。
> **预估工作量**：2-3 周
> **新增依赖**：无（undici 已有，用于 search_web 工具）
> **前置条件**：阶段 1 已完成（systemPrompt 注入点存在）

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
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT                -- NULL 表示永不过期
);
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(memory_type);
CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC);
CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at DESC);
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

- 使用同一端点的 LLM（低优先级，不影响正常对话）
- 提取失败只记录日志，不抛错
- 去重：新记忆的 content 与现有记忆相似度高（字符重叠 > 80%）时跳过

---

## 步骤 4：修改 ChatService 注入记忆

**文件**：`src/tide-lobster/src/chat/service.ts`

在构建 system prompt 时追加相关记忆：

```typescript
const systemPrompt = identityService.loadSystemPrompt(session.persona_path);
const userMessage = messages.at(-1)?.content ?? '';
const relevantMemories = memoryStore.findRelevant(userMessage, 5);

if (relevantMemories.length > 0) {
  const memoryBlock = relevantMemories.map((m) => `- ${m.content}`).join('\n');
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

**启动时注册**：

```typescript
// src/tide-lobster/src/index.ts 或 tools/index.ts
globalToolRegistry.register(getDatetimeTool);
globalToolRegistry.register(readMemoryTool);
globalToolRegistry.register(writeMemoryTool);
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

  // 执行工具
  for (const tc of result.tool_calls) {
    const tool = globalToolRegistry.get(tc.name);
    const toolResult = tool ? await tool.execute(tc.arguments) : `工具 ${tc.name} 不存在`;
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

在工具执行时向 SSE 流推送特殊事件：

```
data: {"type":"tool_call","name":"get_datetime","status":"running"}

data: {"type":"tool_result","name":"get_datetime","content":"2026-03-23 14:30:00"}
```

前端接收处理：

```typescript
// ChatMessage 气泡下方展示折叠的工具调用信息
// event.type === 'tool_call' → 显示 "正在执行：get_datetime..."
// event.type === 'tool_result' → 替换为折叠卡片，可展开查看结果
```

---

## 步骤 10：记忆管理 API

**文件**：`src/tide-lobster/src/api/routes/memory.ts`（替换占位）

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

填充当前空壳：

- 顶部：类型过滤 Tab（全部/事实/偏好/事件/规则）+ 关键词搜索框
- 记忆列表：Ant Design Table（内容、类型 Tag、重要性 1-10、创建时间）
- 行操作：编辑（Modal）、删除（确认）
- 底部：手动添加记忆按钮（Modal 表单）
- 右上角：危险操作 - 清空全部记忆

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

- [ ] 告知 AI "我喜欢简洁的回答"，结束会话后查 `memories` 表有新记录
- [ ] 下次新建会话，system prompt 中出现该记忆
- [ ] 聊天中问 "现在几点了"，AI 调用 `get_datetime` 工具并返回正确时间
- [ ] SSE 流式中出现 `tool_call` / `tool_result` 事件，前端显示工具执行状态
- [ ] 工具调用超过 5 轮时停止并返回已有内容
- [ ] 记忆管理页正常显示、编辑、删除记忆
- [ ] 手动添加记忆后在聊天中可被检索到
