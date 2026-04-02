# 阶段 5.1：技能系统迭代

> **目标**：修复 Phase 5 技能系统的核心缺陷——`trigger: llm_call` 形同虚设，让 LLM 在对话中能自动感知并执行技能。
> **采用方案**：Auto-routing（系统提示注入 + `read_skill` 工具），而非 Function Calling 注册。
> **无新增外部依赖**（复用现有 `gray-matter`、`fs.watch`）
> **前置条件**：Phase 5 已完成（IM 通道 + 技能骨架均已上线）

---

## 背景与问题

Phase 5 技能系统存在核心缺陷：

**`trigger: llm_call` 形同虚设**
技能文件中标记了 `trigger: llm_call`，但 AI 对话时完全无法感知这些技能的存在，也无法自动调用。

### 方案选型

| 方案                     | 描述                                                               | 问题                                                                |
| ------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Function Calling 注册    | 把每个技能包装成 ToolDef，注册进 `globalToolRegistry`              | 每个技能占用一个工具 slot，tools 列表膨胀；技能增减需重启或手动同步 |
| **Auto-routing（采用）** | 系统提示注入技能列表，LLM 用 `read_skill` 工具读取 SKILL.md 后执行 | 无需注册，启用/禁用即时生效；技能内容更灵活                         |

Auto-routing 参考 LobsterAI 的 `SkillManager` 设计：LLM 先扫描 `<available_skills>` 中的 description，匹配后读取完整 SKILL.md 指令，再按指令回复。

---

## 模块变更概览

```
src/tide-lobster/src/
  skills/
    autoRouting.ts              ← 新建：构建 <available_skills> 系统提示片段
    loader.ts                   ← 扩展：新增 file_path、parameters 字段解析；新增文件热重载
    types.ts                    ← 简化：移除 SkillTrigger / SkillInvocationPolicy
    service.ts                  ← 移除 llm_only 调用限制
    skillTool.ts                ← 删除（Function Calling 适配器，不再需要）
    skillToolRegistry.ts        ← 删除（工具注册表同步，不再需要）
  tools/builtins/read_skill.ts  ← 新建：读取 SKILL.md 文件内容的内置工具
  tools/index.ts                ← 注册 read_skill 工具
  chat/service.ts               ← buildSystemPrompt 注入 skills auto-routing 块
  index.ts                      ← 移除 syncSkillsToToolRegistry 调用；保留文件监听器
  api/routes/skills.ts          ← 移除 enable/disable 时的 syncSkillsToToolRegistry 调用
```

---

## 步骤 1：新建 autoRouting.ts

**新建文件**：`src/tide-lobster/src/skills/autoRouting.ts`

```typescript
/**
 * 构建 LobsterAI 风格的 skills auto-routing 片段，注入 system prompt。
 *
 * 列出所有已启用技能的 id、名称、描述和 SKILL.md 文件路径。
 * LLM 通过扫描 description 决定是否调用某个技能，再用 read_skill 工具读取完整内容执行。
 * 每次 chat 请求动态调用，无缓存，启用/禁用变更立即生效。
 */
export function buildSkillsAutoRoutingPrompt(): string;
```

生成的系统提示片段格式：

```xml
## Skills (mandatory)
Before replying: scan <available_skills> <description> entries.
- If exactly one skill clearly applies: read its SKILL.md at <location> with the read_skill tool, then follow it.
- If no skill clearly applies: answer directly.
<available_skills>
  <skill>
    <id>translate</id>
    <name>多语言翻译</name>
    <description>自动检测语言并翻译为目标语言</description>
    <location>/abs/path/SKILLS/translate/SKILL.md</location>
  </skill>
</available_skills>
```

每次 `ChatService.buildSystemPrompt()` 调用时动态生成，无缓存——技能启用/禁用后下一轮对话立即生效，无需重启或手动同步。

---

## 步骤 2：新建 read_skill 内置工具

**新建文件**：`src/tide-lobster/src/tools/builtins/read_skill.ts`

```typescript
export const readSkillTool: ToolDef = {
  name: 'read_skill',
  description: 'Read the full content of a SKILL.md file. Only paths inside SKILLS/ or data/skills/ are allowed.',
  parameters: {
    path: {
      type: 'string',
      description: 'Absolute path to the SKILL.md file, as listed in <location>.',
      required: true,
    },
  },
  async execute({ path: filePath }) { ... }
};
```

安全约束：

- 允许目录：`SKILLS/` 和 `data/skills/`（两者均为绝对路径白名单）
- 使用 `realpathSync` 解析符号链接后再对比，防止路径穿越
- 文件不存在或路径越权时返回错误字符串（不抛出，不中断 AI 对话）

在 `tools/index.ts` 中注册：`initializeBuiltinTools()` 内追加 `globalToolRegistry.register(readSkillTool)`。

---

## 步骤 3：Loader 扩展

**文件**：`src/tide-lobster/src/skills/loader.ts`

### 3a. 新增字段解析

`parseSkillFile` 返回的 `SkillDef` 新增两个字段：

- `file_path: string` — SKILL.md 的绝对路径，供 auto-routing 填充 `<location>`
- `parameters?: Record<string, SkillParameter>` — 可选的多参数 Schema，`executeSkill` 渲染模板时使用

`SkillDef` 中同时**移除**：

- `trigger` — 不再区分 `manual` / `llm_call`，所有启用技能均进入 auto-routing 列表
- `invocation_policy` — 改用统一的 `enabled` 开关控制

### 3b. 文件监听热重载

新增导出函数 `startSkillFileWatcher(onReload: () => void): void`：

- 监听 `SKILLS/` 和 `data/skills/` 两个目录（`recursive: true`）
- 仅 `SKILL.md` 文件变更时触发，100ms 防抖
- `persistent: false`，不阻止进程退出
- 进程级单例（重复调用无副作用）

> **注意**：auto-routing 每次请求动态构建，`onReload` 回调目前为空（文件变更后下一次对话自动生效）。文件监听器保留，供未来扩展缓存失效逻辑使用。

---

## 步骤 4：集成到 buildSystemPrompt

**文件**：`src/tide-lobster/src/chat/service.ts`

`buildSystemPrompt` 将系统提示拼接顺序调整为三段：

```
[人格基础提示]

## 关于用户的记忆
- ...（最多 2000 字符）

## Skills (mandatory)
<available_skills>...</available_skills>
```

三段均为可选——无人格提示、无记忆、无启用技能时各段自动省略。

---

## 步骤 5：清理已删除模块

| 文件                          | 操作                                                           | 原因                                                 |
| ----------------------------- | -------------------------------------------------------------- | ---------------------------------------------------- |
| `skills/skillTool.ts`         | 删除                                                           | Function Calling ToolDef 适配器，auto-routing 不需要 |
| `skills/skillToolRegistry.ts` | 删除                                                           | 工具注册表同步，auto-routing 不需要                  |
| `index.ts`                    | 移除 `syncSkillsToToolRegistry()` 调用                         | 模块已删除                                           |
| `api/routes/skills.ts`        | 移除 enable/disable 路由中的 `syncSkillsToToolRegistry()` 调用 | 模块已删除                                           |
| `skills/service.ts`           | 移除 `llm_only` 调用限制检查                                   | `invocation_policy` 字段已移除                       |
| `skills/types.ts`             | 移除 `SkillTrigger` / `SkillInvocationPolicy` 类型             | 不再使用                                             |

---

## 技能目录结构（不变）

```
SKILLS/                        ← 内置技能（source: 'builtin'）
  translate/
    SKILL.md
  daily_summary/
    SKILL.md

data/skills/                   ← 用户自定义技能（source: 'user'，可覆盖内置）
  my_custom_skill/
    SKILL.md
```

SKILL.md frontmatter 格式（`trigger` 和 `invocation_policy` 字段已废弃，可安全移除）：

```markdown
---
name: translate
display_name: 多语言翻译
description: 自动检测语言并翻译为目标语言
version: 1.0.0
enabled: true
tags: [翻译, 工具]
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

---

## 完整数据流

### Auto-routing 调用流程

```
用户发消息（Web UI / Telegram）
        ↓
ChatService.buildSystemPrompt()
  → buildSkillsAutoRoutingPrompt()
    加载所有 enabled=true 的技能，生成 <available_skills> XML 块
  → 系统提示 = 人格 + 记忆 + <available_skills>
        ↓
LLM 收到带 <available_skills> 的系统提示
  扫描各技能 <description>，判断是否有匹配
        ↓
（若有匹配技能）LLM 发起 tool_calls:
  [{ name: "read_skill", arguments: { path: "/abs/path/SKILLS/translate/SKILL.md" } }]
        ↓
ChatService 执行 read_skill 工具
  → 校验路径在允许目录内
  → readFileSync 读取 SKILL.md 完整内容
  → 返回 SKILL.md 文本给 LLM
        ↓
LLM 阅读 SKILL.md 指令，按指令生成回复
        ↓
用户收到最终回复
```

### 技能启用/禁用流程

```
前端切换开关
→ PATCH /api/assistant-skills/:name/enable|disable
→ setSkillEnabled(name, enabled)  写入 KV Store
→ 下次 ChatService 请求时 buildSkillsAutoRoutingPrompt() 自动感知新状态
```

### 文件热重载流程

```
修改 SKILLS/translate/SKILL.md 并保存
→ fs.watch 触发
→ 100ms 防抖
→ onReload()（当前为空回调，auto-routing 已是动态构建）
→ 下次对话自动使用新内容
```

---

## 验证清单

> **完成情况（截至 2026-04-02）**：下列能力已在代码中落地，并在开发自测中通过。发版或大版本合并前仍建议按小节做一次端到端回归。

### Auto-routing 基本功能

- [x] 启动后端，发送与已启用技能描述匹配的消息（如「帮我翻译 Hello World 为中文」）
- [x] 观察 ChatService 日志出现 `tool_calls: [{ name: "read_skill" }]`
- [x] 确认 `read_skill` 返回 SKILL.md 内容，LLM 按技能指令回复
- [x] 发送无关消息，确认 LLM 直接回答（不调用 `read_skill`）

### 路径安全

- [x] 尝试传入 `read_skill` 非法路径（如 `/etc/passwd`），确认返回 `Error: path is outside the allowed skills directories.`
- [x] 确认符号链接场景不能绕过目录限制（`read_skill` 使用 `realpathSync` 与白名单根目录校验）

### 启用/禁用即时生效

- [x] 禁用 translate 技能后发送翻译请求，确认 `<available_skills>` 中不再包含该技能，LLM 直接回答
- [x] 重新启用后，下一轮对话立即恢复

### 文件热重载

- [x] 修改 `SKILLS/translate/SKILL.md` 并保存，无需重启
- [x] 下次对话中 LLM 按新版 SKILL.md 内容执行（`loader` 监听 + 每轮动态构建 auto-routing）

### 手动执行（UI）

- [x] Skills 页面手动执行技能，`executeSkill` 正常调用 LLM 并返回结果
- [x] `skill_invocation_logs` 表写入 `trigger_type='manual'` 记录（执行日志由前一阶段保留）

### 回归

- [x] 内置记忆工具（`read_memory` / `write_memory` / `delete_memory`）与 `read_skill` 行为正常（**说明**：`get_datetime` 等已随阶段 5.2 从 builtins 移除，不再作为本阶段回归项）
- [x] Telegram 收发消息、配对码流程正常
- [x] 前端 Skills 页面原有功能（列表展示、启用/禁用开关、手动执行）无变化
