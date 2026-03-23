# 阶段 1：身份系统激活

> **目标**：让 identity 文件真正作用于聊天，每次对话有系统提示词；补全聊天基本体验。
> **预估工作量**：1-2 周
> **新增依赖**：无

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
  loadSystemPrompt(personaPath?: string): string;

  // 列出 identity/personas/ 下所有 .md 文件
  listPersonas(): PersonaInfo[];
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
GET /api/identity/personas
```

返回格式：

```json
[
  { "path": "default.md", "name": "默认", "description": "平衡友好的助手" },
  { "path": "jarvis.md", "name": "Jarvis", "description": "专业严谨的执行助手" }
]
```

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

新增工具函数：

```typescript
function trimMessages(
  messages: ChatMessage[],
  maxChars: number = 60000 // 约 15000 tokens
): ChatMessage[] {
  // 从最新消息向前保留，总字符数不超过 maxChars
  // 始终保留第一条 user 消息（若超限则只保留最近 N 条）
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

- [ ] 新建会话时，system prompt 包含 identity/runtime/soul.summary.md 内容
- [ ] 切换 persona 后，下一条消息的 system prompt 使用新 persona 文件
- [ ] 存量数据库（无 `persona_path` 列）能正常升级，不报错
- [ ] persona 列表 API 返回 identity/personas/ 下的 md 文件列表
- [ ] 消息气泡 hover 显示复制/重试按钮
- [ ] 发送超长历史消息时不报 token 超限错误（截断生效）
