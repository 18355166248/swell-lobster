# 阶段 1：身份系统激活

> **目标**：让 identity 文件真正作用于聊天，每次对话有系统提示词；补全聊天基本体验。
> **预估工作量**：1-2 周
> **新增依赖**：无
>
> **状态**：✅ **已完成**（2026-03-24）。实现以仓库源码为准；本文档保留为规划说明与验收参考。**请勿按本文档重复从零实现**。

---

## 背景

当前 `ChatService.chat()` / `chatStream()` 调用 LLM 时没有传入任何 system prompt。
`identity/` 目录下已有 SOUL、AGENT、personas 等文件，但完全未被读取。

本阶段目标：打通 identity → system prompt → llmClient 的完整链路。

---

## 步骤 1：升级 DB Migration 机制

**文件**：`src/tide-lobster/src/db/index.ts`

当前 db 初始化是直接执行建表 SQL，无版本控制。改为带版本号的 migration 函数：

```typescript
// 迁移函数数组，按顺序执行
const migrations: Array<{ version: number; up: (db: Database) => void }> = [
  {
    version: 1,
    up: (db) => {
      // 已有的建表语句
    },
  },
  {
    version: 2,
    up: (db) => {
      // 阶段1新增
      db.exec(`ALTER TABLE chat_sessions ADD COLUMN persona_path TEXT`);
      db.exec(`ALTER TABLE chat_messages ADD COLUMN token_count INTEGER`);
    },
  },
];

function runMigrations(db: Database): void {
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
```

**Schema 变更**：

```sql
ALTER TABLE chat_sessions ADD COLUMN persona_path TEXT;
ALTER TABLE chat_messages ADD COLUMN token_count INTEGER;
```

---

## 步骤 2：新建 IdentityService

**新建文件**：`src/tide-lobster/src/identity/identityService.ts`

```typescript
export interface PersonaInfo {
  path: string; // 相对于 identity/personas/ 的路径，如 "default.md"
  name: string; // 从文件 # 标题提取
  description: string; // 文件第一段落（非标题行）
}

export class IdentityService {
  // 组装 system prompt
  // 读取顺序：soul.summary.md → agent.core.md → persona 文件
  // 若文件不存在则跳过该段
  // 总长度硬上限 8000 字符，超出时截断并附加说明（防止超长身份文件撑满 context）
  loadSystemPrompt(personaPath?: string): string;

  // 列出 identity/personas/ 下所有 .md 文件
  listPersonas(): PersonaInfo[];

  // 热重载：清除文件内容缓存，重新读取磁盘（无需重启服务）
  // 适用场景：用户直接编辑 identity/ 下的文件后，通过 API 触发更新
  reload(): void;
}
```

**拼接格式**：

```
{soul.summary.md 内容}

---

{agent.core.md 内容}

---

{personas/<personaPath> 内容}
```

**注意**：

- 使用 `fs.readFileSync`（同步读取），文件小不影响性能
- 文件不存在时静默跳过，不抛错
- `listPersonas()` 解析 md 文件的第一个 `# 标题` 作为 name，第一段非标题文本作为 description
- `loadSystemPrompt()` 拼接完成后检查总字符数，超过 8000 时截断末尾并追加 `\n...[身份文件过长已截断]`

---

## 步骤 3：扩展 llmClient

**文件**：`src/tide-lobster/src/chat/llmClient.ts`

在请求参数类型中增加 `systemPrompt?: string`：

```typescript
// OpenAI 协议：在 messages 数组头部插入 { role: "system", content: systemPrompt }
// Anthropic 协议：在请求体增加顶层 system: systemPrompt 字段

interface ChatCompletionRequest {
  // ...现有字段...
  systemPrompt?: string;
}
```

两种协议处理：

```typescript
// OpenAI
const messages = systemPrompt
  ? [{ role: 'system', content: systemPrompt }, ...userMessages]
  : userMessages;

// Anthropic
const body = {
  model,
  messages,
  ...(systemPrompt ? { system: systemPrompt } : {}),
};
```

---

## 步骤 4：修改 ChatService

**文件**：`src/tide-lobster/src/chat/service.ts`

在 `chat()` 和 `chatStream()` 的 LLM 调用前：

```typescript
const identityService = new IdentityService();
const systemPrompt = identityService.loadSystemPrompt(session.persona_path ?? undefined);
```

扩展 `createSession` 接受 `persona_path?: string`。
扩展 `updateSession` 支持 `persona_path` 字段。

---

## 步骤 5：新增 Persona API

**新建文件**：`src/tide-lobster/src/api/routes/persona.ts`（或追加到 `identity.ts`）

```
GET  /api/identity/personas   列出所有 persona 文件
POST /api/identity/reload     热重载 identity/ 目录（编辑 persona 文件后无需重启）
```

**GET /api/identity/personas** 返回格式：

```json
[
  { "path": "default.md", "name": "默认", "description": "平衡友好的助手" },
  { "path": "jarvis.md", "name": "Jarvis", "description": "专业严谨的执行助手" }
]
```

**POST /api/identity/reload** 实现：调用 `identityService.reload()`，清除文件读取缓存，返回 `{ message: '已重载', personaCount: N }`。

---

## 步骤 6：Chat API 扩展

**文件**：`src/tide-lobster/src/api/routes/chat.ts`

- `POST /api/sessions` body 增加 `persona_path?: string`
- `PATCH /api/sessions/:id` 支持 `{ persona_path: string }` patch

---

## 步骤 7：前端 PersonaSelect 组件

**新建文件**：`apps/web-ui/src/pages/Chat/components/PersonaSelect.tsx`

- 组件位置：聊天顶部操作栏，endpoint 选择器旁边
- 调用 `GET /api/identity/personas` 获取列表
- 选中后调用 `PATCH /api/sessions/:id { persona_path }` 更新会话
- 用 `atomWithStorage` 持久化上次选择，新建 session 时自动应用

---

## 步骤 8：消息操作（ChatMessage）

**修改/新建**：`apps/web-ui/src/pages/Chat/components/MessageActions.tsx`

在消息气泡 hover 时显示操作栏：

| 操作                      | 逻辑                                             |
| ------------------------- | ------------------------------------------------ |
| 复制                      | `navigator.clipboard.writeText(message.content)` |
| 重试（仅 assistant 消息） | 删除最后一对消息，重新发送上一条 user 消息       |

重试实现：

1. 在前端消息列表中找到倒数第二条 `role=user` 消息
2. 调用 `sendMessageStream(sessionId, userMessage.content)`
3. 后端追加新的消息对（不删除旧消息，或可加 `retry: true` 参数让后端处理）

---

## 步骤 9：上下文截断保护

**文件**：`src/tide-lobster/src/chat/service.ts`

两层独立保护，参考 LobsterAI `coworkRunner.ts` 的 `FINAL_RESULT_MAX_CHARS = 120_000` 设计思路：

```typescript
const MAX_SINGLE_MSG_CHARS = 8_000; // 单条消息内容上限
const MAX_TOTAL_CHARS = 60_000; // 历史消息总量上限（约 15000 tokens）

function trimMessages(messages: ChatMessage[]): ChatMessage[] {
  // 第一层：截断单条超长消息（防止一条粘贴大量代码撑满 context）
  const trimmed = messages.map((m) => {
    if (typeof m.content === 'string' && m.content.length > MAX_SINGLE_MSG_CHARS) {
      return { ...m, content: m.content.slice(0, MAX_SINGLE_MSG_CHARS) + '\n...[内容过长已截断]' };
    }
    return m;
  });

  // 第二层：历史总量超限时，从最旧消息开始丢弃
  // 保留规则：始终保留最近 2 条（至少一个 user+assistant 对）
  while (totalChars(trimmed) > MAX_TOTAL_CHARS && trimmed.length > 2) {
    trimmed.shift();
  }
  return trimmed;
}

function totalChars(messages: ChatMessage[]): number {
  return messages.reduce(
    (sum, m) => sum + (typeof m.content === 'string' ? m.content.length : 0),
    0
  );
}
```

估算规则（无 tokenizer）：总字符数 / 4 ≈ token 数（英文），/ 3 ≈ token 数（中文混合）。

---

## i18n 新增翻译键

需要在 `zh.ts` 和 `en.ts` 中添加：

```typescript
// zh.ts
persona: {
  label: '人设',
  default: '默认',
  select: '选择人设',
  noPersonas: '未找到人设文件',
},
chat: {
  // 新增
  copyMessage: '复制',
  retryMessage: '重试',
  messageCopied: '已复制',
}
```

---

## 验证清单

- [x] 新建会话时，system prompt 包含 identity/runtime/soul.summary.md 内容
- [x] 切换 persona 后，下一条消息的 system prompt 使用新 persona 文件
- [x] 存量数据库（无 `persona_path` 列）能正常升级，不报错
- [x] persona 列表 API 返回 identity/personas/ 下的 md 文件列表
- [x] 消息气泡 hover 显示复制/重试按钮
- [x] 发送超长历史消息时不报 token 超限错误（截断生效）
- [x] 单条超长消息（> 8000 字符）被截断后附加 `...[内容过长已截断]` 标记
- [x] `POST /api/identity/reload` 调用后编辑过的 persona 文件立即生效，无需重启服务
- [x] identity 文件总内容超过 8000 字符时，system prompt 被截断，不抛错
