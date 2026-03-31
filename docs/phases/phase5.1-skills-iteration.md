# 阶段 5.1：技能系统迭代

> **目标**：补全 Phase 5 技能系统的核心缺陷，使 `trigger: llm_call` 真正生效为 Function Calling 工具，并新增执行历史记录和调用权限分离。
> **预估工作量**：1 周
> **无新增外部依赖**（复用现有 `globalToolRegistry`、`gray-matter`、`better-sqlite3`）
> **前置条件**：Phase 5 已完成（IM 通道 + 技能骨架均已上线）

---

## 背景与问题

Phase 5 技能系统存在三个核心缺陷：

1. **`trigger: llm_call` 形同虚设**  
   技能文件中标记了 `trigger: llm_call`，但 `service.ts` 中并未将这类技能注册进 `globalToolRegistry`，AI 对话时无法感知和自动调用这些技能。

2. **无执行记录**  
   手动执行和 AI 自动调用均无持久化记录，无法追溯执行情况、排查问题。

3. **调用权限无分离**  
   当前仅有 `enabled` 一个开关，无法精细控制「允许 UI 手动调用」vs「允许 AI 自动调用」两个维度。

**参考来源**：

- `openclaw`：`SkillInvocationPolicy`（`userInvocable` + `disableModelInvocation`）、`SkillSnapshot` 提示缓存、`applySkillsPromptLimits` Token 预算控制
- `LobsterAI`：`SkillManager.watchSkillsDir()`（文件热重载）、`syncBundledSkillsToUserData`

---

## 模块变更概览

```
src/tide-lobster/src/
  db/index.ts                     ← 新增 version 12 迁移（skill_invocation_logs 表）
  skills/
    types.ts                      ← 扩展 SkillDef：invocation_policy、parameters、file_path
    loader.ts                     ← 解析新字段 + startSkillFileWatcher（热重载）
    logger.ts                     ← 新建：logSkillInvocation / querySkillLogs
    service.ts                    ← executeSkill 加入日志记录
    skillTool.ts                  ← 新建：SkillDef → ToolDef 适配器
    skillToolRegistry.ts          ← 新建：syncSkillsToToolRegistry（注册表同步）
  index.ts                        ← 启动时注册技能工具 + 启动文件监听
  api/routes/skills.ts            ← enable/disable 后同步注册表 + 新增日志查询路由

apps/web-ui/src/
  pages/Skills/index.tsx          ← 新增「执行历史」Tab + 权限策略展示
  i18n/locales/zh.ts              ← 新增 skills 相关 key
  i18n/locales/en.ts              ← 新增 skills 相关 key
```

---

## 步骤 1：数据库迁移

**文件**：`src/tide-lobster/src/db/index.ts`（`migrations` 数组末尾追加 version 12）

```sql
CREATE TABLE IF NOT EXISTS skill_invocation_logs (
  id            TEXT PRIMARY KEY,
  skill_name    TEXT NOT NULL,
  trigger_type  TEXT NOT NULL CHECK(trigger_type IN ('manual', 'llm_call')),
  invoked_by    TEXT NOT NULL DEFAULT 'ui',  -- 'ui' | 'llm' | 'im'
  input_context TEXT NOT NULL DEFAULT '',
  output        TEXT,
  status        TEXT NOT NULL CHECK(status IN ('success', 'failed')),
  error_message TEXT,
  duration_ms   INTEGER,
  session_id    TEXT,            -- llm_call 时记录关联的会话 id，便于追溯
  endpoint_name TEXT,
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_skill_invocation_logs_skill_created
  ON skill_invocation_logs(skill_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_skill_invocation_logs_created
  ON skill_invocation_logs(created_at DESC);
```

**字段说明**：

- `trigger_type`：`manual`（UI 手动执行） / `llm_call`（AI 通过 function calling 触发）
- `invoked_by`：更细粒度区分来源，`ui`（Skills 页面）/ `llm`（AI 对话）/ `im`（Telegram 等 IM 通道）
- `session_id`：AI 调用时关联的聊天会话，方便追溯「哪次对话触发了哪个技能」
- 日志表与 `chat_sessions` 不设外键，会话删除不联级清空日志

---

## 步骤 2：类型扩展

**文件**：`src/tide-lobster/src/skills/types.ts`

新增 `SkillInvocationPolicy` 类型和 `SkillParameter` 接口，并在 `SkillDef` 中增加三个字段：

```typescript
/**
 * 调用权限策略：
 * - 'user_only'：仅显示在 UI 供手动执行，不注入 LLM tools（trigger: manual 的默认值）
 * - 'llm_only'：注册为 LLM function calling 工具，但 UI 不显示执行按钮（trigger: llm_call 的默认值）
 * - 'both'：UI 可手动执行，同时注册为 LLM tools
 */
export type SkillInvocationPolicy = 'user_only' | 'llm_only' | 'both';

export interface SkillParameter {
  type: 'string' | 'number' | 'boolean';
  description: string;
  required?: boolean;
}

export interface SkillDef {
  // ... 现有字段不变 ...

  /** 调用权限策略，由 loader 根据 trigger 推导或读取 frontmatter 显式声明 */
  invocation_policy: SkillInvocationPolicy;

  /**
   * 可选的参数 Schema。
   * 未定义时：prompt_template 只使用单一 {{context}} 占位符（向后兼容）。
   * 已定义时：prompt_template 可使用 {{param_name}} 多参数占位。
   */
  parameters?: Record<string, SkillParameter>;

  /** 技能文件的绝对路径，供热重载场景使用 */
  file_path: string;
}
```

---

## 步骤 3：Loader 扩展

**文件**：`src/tide-lobster/src/skills/loader.ts`

### 3a. 解析新字段

在 `parseSkillFile` 中新增 `invocation_policy` 推导逻辑：

```
frontmatter 显式声明 invocation_policy → 直接使用
trigger: manual（无显式声明）         → invocation_policy: 'user_only'
trigger: llm_call（无显式声明）        → invocation_policy: 'llm_only'
```

这样**所有现有技能文件无需修改**即可正常工作：`manual` 的技能继续在 UI 显示执行按钮，`llm_call` 的技能自动注册为 LLM tools。

解析 `parameters` 字段：若 frontmatter 中存在 `parameters` 对象则直接映射为 `Record<string, SkillParameter>`，否则为 `undefined`。

### 3b. 文件监听热重载

新增导出函数 `startSkillFileWatcher(onReload: () => void): void`：

- 监听 `identity/skills/` 和 `data/skills/` 两个目录
- `.md` 文件发生变更时，100ms 防抖后调用 `onReload` 回调
- 使用 `{ persistent: false }` 选项，不阻止进程退出
- 进程级单例（重复调用无副作用）

---

## 步骤 4：日志记录器

**新建文件**：`src/tide-lobster/src/skills/logger.ts`

提供两个导出函数：

```typescript
export interface SkillInvocationLogEntry {
  skillName: string;
  triggerType: 'manual' | 'llm_call';
  invokedBy: 'ui' | 'llm' | 'im';
  inputContext: string;
  output?: string;
  status: 'success' | 'failed';
  errorMessage?: string;
  durationMs?: number;
  sessionId?: string;
  endpointName?: string;
}

/** 写入执行日志。写入失败静默（不影响主流程）。 */
export function logSkillInvocation(entry: SkillInvocationLogEntry): void;

/** 查询执行历史。skillName 为空时返回全局日志。 */
export function querySkillLogs(opts: {
  skillName?: string;
  limit?: number; // 默认 50
  offset?: number; // 默认 0
}): SkillInvocationLogEntry[];
```

`logSkillInvocation` 内部用 `randomUUID()` 生成 id，以 try/catch 包裹 SQLite 写入，异常只打 `console.error` 不上抛。

---

## 步骤 5：service.ts 加入日志

**文件**：`src/tide-lobster/src/skills/service.ts`

`executeSkill` 签名变更为：

```typescript
export async function executeSkill(
  skillName: string,
  context: string,
  opts?: { invokedBy?: 'ui' | 'im' }
): Promise<string>;
```

在 try/catch 块中加入日志记录：

- 记录开始时间（`Date.now()`），计算 `durationMs`
- 成功时：`logSkillInvocation({ ..., status: 'success', output: result })`
- 失败时：`logSkillInvocation({ ..., status: 'failed', errorMessage })`，然后再 rethrow

---

## 步骤 6：技能工具适配器

**新建文件**：`src/tide-lobster/src/skills/skillTool.ts`

核心函数：

```typescript
/** 工具名前缀，避免与内置工具冲突 */
const SKILL_TOOL_PREFIX = 'skill_';

/** 技能名 → 工具名（去除特殊字符） */
export function skillToToolName(skillName: string): string;

/**
 * 将 SkillDef 包装为 ToolDef，注册进 globalToolRegistry。
 * @param skill    技能定义
 * @param sessionId 可选，来自 llm_call 上下文，用于日志关联
 */
export function skillDefToToolDef(skill: SkillDef, sessionId?: string): ToolDef;
```

`skillDefToToolDef` 的参数 schema 构建逻辑：

- `skill.parameters` 有值 → 直接映射为工具参数
- `skill.parameters` 为空 → 生成单一 `context` 字符串参数（描述拼接技能的 `description`）

`execute()` 实现流程：

1. 重新调用 `getSkill(skill.name)` 获取最新配置（支持热重载）
2. 检查 `enabled`，已禁用则直接返回错误提示字符串
3. 替换 prompt_template 中的占位符（支持多参数格式 `{{param}}`，兼容旧格式 `{{context}}`）
4. 获取第一个可用端点，调用 `requestChatCompletion`
5. 调用 `logSkillInvocation`（`triggerType: 'llm_call'`, `invokedBy: 'llm'`，传入 `sessionId`）
6. 返回结果文本；异常时记录失败日志后返回错误提示字符串（不抛出，避免中断 AI 对话流程）

工具 description 超过 200 字符时截断并加 `...`，防止系统提示膨胀。

---

## 步骤 7：工具注册管理器

**新建文件**：`src/tide-lobster/src/skills/skillToolRegistry.ts`

```typescript
/**
 * 将符合条件的技能同步到 globalToolRegistry。
 * 调用时机：进程启动、技能启用/禁用变更后。
 */
export function syncSkillsToToolRegistry(): void;
```

实现逻辑：

1. 遍历 `globalToolRegistry.listAll()`，注销所有 `skill_` 前缀的工具
2. 调用 `loadAllSkills()` 获取最新技能列表
3. 过滤：`enabled === true` 且 `invocation_policy` 为 `'llm_only'` 或 `'both'`
4. 对每个符合条件的技能调用 `globalToolRegistry.register(skillDefToToolDef(skill))`

---

## 步骤 8：修改启动入口

**文件**：`src/tide-lobster/src/index.ts`

在 `initializeBuiltinTools()` 调用之后追加：

```typescript
import { syncSkillsToToolRegistry } from './skills/skillToolRegistry.js';
import { startSkillFileWatcher } from './skills/loader.js';

// 将 llm_call 技能注册为 LLM function calling 工具
syncSkillsToToolRegistry();

// 技能文件变更时自动重新同步（无需重启服务）
startSkillFileWatcher(() => syncSkillsToToolRegistry());
```

---

## 步骤 9：修改 Skills API 路由

**文件**：`src/tide-lobster/src/api/routes/skills.ts`

### 9a. enable/disable 路由触发同步

在 `PATCH /api/assistant-skills/:name/enable` 和 `PATCH /api/assistant-skills/:name/disable` 完成 `setSkillEnabled` 后，立即调用 `syncSkillsToToolRegistry()`，使工具注册表实时生效。

### 9b. 新增日志查询路由

**注意**：`/api/assistant-skill-logs` 路由必须注册在 `/:name` 动态路由之前，避免路径匹配歧义。

```
GET /api/assistant-skill-logs?limit=50&offset=0
    → 全局执行历史（按 created_at DESC）

GET /api/assistant-skills/:name/logs?limit=50&offset=0
    → 指定技能的执行历史
```

响应格式：

```typescript
// GET /api/assistant-skill-logs
{
  logs: SkillInvocationLogEntry[]
}

// GET /api/assistant-skills/:name/logs
{
  skill_name: string;
  logs: SkillInvocationLogEntry[]
}
```

---

## 步骤 10：前端 Skills 页面扩展

**文件**：`apps/web-ui/src/pages/Skills/index.tsx`

### 10a. AssistantSkill 类型扩展

```typescript
type AssistantSkill = {
  // ...现有字段...
  invocation_policy: 'user_only' | 'llm_only' | 'both';
  parameters?: Record<
    string,
    {
      type: 'string' | 'number' | 'boolean';
      description: string;
      required?: boolean;
    }
  >;
};

type SkillLogEntry = {
  id: string;
  skill_name: string;
  trigger_type: 'manual' | 'llm_call';
  invoked_by: 'ui' | 'llm' | 'im';
  input_context: string;
  output: string | null;
  status: 'success' | 'failed';
  error_message: string | null;
  duration_ms: number | null;
  session_id: string | null;
  endpoint_name: string | null;
  created_at: string;
};
```

### 10b. AssistantSkillsTab 调整

触发方式列展示逻辑（根据 `invocation_policy`）：

| `invocation_policy` | 显示                 |
| ------------------- | -------------------- |
| `user_only`         | `手动` Tag（蓝色）   |
| `llm_only`          | `AI工具` Tag（紫色） |
| `both`              | 同时显示两个 Tag     |

执行按钮显示条件：`invocation_policy === 'user_only' || invocation_policy === 'both'`

每行操作列新增「历史」按钮（`invocation_policy` 为任意值均显示），点击弹出该技能的调用历史 Modal。

### 10c. 新增「执行历史」Tab

新增第三个 Tab，组件名 `SkillLogsTab`，通过 `GET /api/assistant-skill-logs` 加载数据。

**表格列**：

| 列       | 内容                                                               |
| -------- | ------------------------------------------------------------------ |
| 技能名   | `skill_name`                                                       |
| 触发方式 | `trigger_type`：`manual`→「手动」，`llm_call`→「AI工具」           |
| 来源     | `invoked_by`：`ui`→「手动执行」，`llm`→「AI调用」，`im`→「IM触发」 |
| 状态     | `status`：`success`→绿色「成功」，`failed`→红色「失败」            |
| 耗时     | `duration_ms`（ms 单位展示）                                       |
| 时间     | `created_at`（相对时间，hover 显示绝对时间）                       |

**展开行**（点击行展开）：

- 「输入」：`input_context`（代码块格式）
- 「输出」：`output`（Markdown 渲染，失败时显示 `error_message`）

**分页**：每页 20 条，底部分页控件，滚动到顶加载。

---

## 步骤 11：i18n 新增翻译 Key

**文件**：`apps/web-ui/src/i18n/locales/zh.ts` 和 `en.ts`

在 `skills` 节点新增：

```typescript
// zh.ts
skills: {
  // ...现有 key 不变...
  tabHistory: '执行历史',
  historyEmpty: '暂无执行记录',
  invocationPolicy: '调用策略',
  policyUserOnly: '仅手动',
  policyLlmOnly: 'AI自动',
  policyBoth: '手动+AI',
  invokedBy: '来源',
  invokedByUi: '手动执行',
  invokedByLlm: 'AI调用',
  invokedByIm: 'IM触发',
  statusSuccess: '成功',
  statusFailed: '失败',
  duration: '耗时',
  viewHistory: '历史',
  inputLabel: '输入',
  outputLabel: '输出',
}

// en.ts
skills: {
  // ...existing keys...
  tabHistory: 'Execution History',
  historyEmpty: 'No execution records',
  invocationPolicy: 'Invocation Policy',
  policyUserOnly: 'Manual Only',
  policyLlmOnly: 'AI Auto',
  policyBoth: 'Manual + AI',
  invokedBy: 'Source',
  invokedByUi: 'Manual',
  invokedByLlm: 'AI',
  invokedByIm: 'IM',
  statusSuccess: 'Success',
  statusFailed: 'Failed',
  duration: 'Duration',
  viewHistory: 'History',
  inputLabel: 'Input',
  outputLabel: 'Output',
}
```

---

## 完整数据流

### Function Calling 调用流程

```
用户发消息（Web UI / Telegram）
        ↓
ChatService.runCompletion()
  globalToolRegistry.toOpenAIFormat() 中包含：
  skill_translate、skill_web_search、skill_task_decompose ...
        ↓
LLM 返回 tool_calls: [{ name: "skill_translate", arguments: { context: "..." } }]
        ↓
ChatService.executeTool("skill_translate", args)
  → globalToolRegistry.get("skill_translate")
  → skillDefToToolDef(skill).execute(args)
    → 替换 prompt_template 占位符
    → requestChatCompletion（技能子调用，独立 LLM 请求）
    → logSkillInvocation({ triggerType: 'llm_call', invokedBy: 'llm', sessionId })
    → 返回结果文本
        ↓
工具结果追加到 messages，继续下一轮 LLM 请求
        ↓
LLM 生成最终回复，返回给用户
```

### 技能启用/禁用的工具同步流程

```
前端切换开关
→ PATCH /api/assistant-skills/:name/enable|disable
→ setSkillEnabled(name, enabled)  写入 KV Store
→ syncSkillsToToolRegistry()       重新扫描并注册
→ 下次 ChatService 请求时 tools 列表已更新
```

### 文件热重载流程

```
修改 identity/skills/translate.md
→ fs.watch 触发
→ 100ms 防抖
→ syncSkillsToToolRegistry()
→ 无需重启，技能工具已更新
```

---

## 技能 Frontmatter 格式（升级后）

现有文件**完全向后兼容**，新字段均为可选：

```markdown
---
name: translate
display_name: 多语言翻译
description: 自动检测语言并翻译为目标语言
version: 1.0.0
trigger: llm_call
enabled: true
tags: [翻译, 工具]
# 可选：显式声明调用策略（不声明时根据 trigger 自动推导）
invocation_policy: both
# 可选：多参数支持
parameters:
  text:
    type: string
    description: 需要翻译的文本
    required: true
  target_language:
    type: string
    description: 目标语言（如"中文"、"英文"）
    required: false
---

请将以下文本翻译为 {{target_language}}：

{{text}}
```

无 `invocation_policy` 字段的现有文件：

- `trigger: manual` → 自动推导为 `user_only`（UI 显示执行按钮，不注册为工具）
- `trigger: llm_call` → 自动推导为 `llm_only`（注册为工具，UI 不显示执行按钮）

---

## 验证清单

### Function Calling 集成

- [ ] 启动后端，观察日志出现 `[skills] registered tool: skill_translate`（或类似）
- [ ] 在聊天框发送「帮我翻译 Hello World 为中文」，观察 ChatService 日志中出现 `tool_calls: [{ name: "skill_translate" }]`
- [ ] 检查 `skill_invocation_logs` 表有 `trigger_type='llm_call'` 记录
- [ ] UI 禁用 translate 技能后再次测试，LLM 不再调用该工具

### 执行历史

- [ ] 手动执行技能（Skills 页面弹窗），数据库出现 `invoked_by='ui'` 记录
- [ ] `GET /api/assistant-skills/translate/logs` 返回历史列表
- [ ] 前端「执行历史」Tab 正常分页展示，展开行显示输入/输出
- [ ] 模拟失败场景（禁用端点后执行），确认 `status='failed'` 和 `error_message` 写入

### 文件热重载

- [ ] 修改 `identity/skills/translate.md` 并保存，后端日志出现重载提示
- [ ] 无需重启，再次对话确认技能描述已更新

### 权限分离

- [ ] `trigger: manual` 的技能（`daily_summary.md`）：仅显示在 UI，不出现在 LLM tools 中
- [ ] `invocation_policy: both` 的技能：UI 显示执行按钮，同时在 LLM tools 中可见

### 回归

- [ ] 现有内置工具（`get_datetime` 等）不受 `syncSkillsToToolRegistry` 影响
- [ ] Telegram 收发消息、配对码流程正常
- [ ] 前端 Skills 页面两个原有 Tab（助手技能 / Claude Code 技能）功能无变化
