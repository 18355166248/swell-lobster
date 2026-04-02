# 阶段 5.2：tools/builtins 瘦身重构

> **目标**：将 `builtins` 从 7 个工具收缩到 3 个，职责收敛为"只保留必须访问内部状态的工具"。
> 外部服务交给 MCP 生态，简单上下文改为系统提示注入，行为引导转为 SKILL.md。
> **不破坏现有任何工具行为，每步独立可交付。**

---

## 现状 → 目标对照

| 工具                  | 现状                  | 目标         | 方式                        |
| --------------------- | --------------------- | ------------ | --------------------------- |
| `get_datetime.ts`     | 工具调用获取当前时间  | **删除**     | 系统提示静态注入            |
| `search_web.ts`       | 自持 Tavily HTTP 调用 | **删除**     | Tavily 官方 MCP 替代        |
| `read_memory.ts`      | 查询内部 SQLite       | **保留**     | —                           |
| `write_memory.ts`     | 写入内部 SQLite       | **保留**     | —                           |
| `delete_memory.ts`    | 删除内部 SQLite       | **保留**     | —                           |
| `send_sticker_bqb.ts` | 工具调用搜索 emoji 池 | **转 SKILL** | `emoji-expression/SKILL.md` |
| `read_skill.ts`       | auto-routing 核心依赖 | **保留**     | —                           |

迁移后 `builtins/` 仅剩 3 个文件，且三者都是"内部状态访问"，职责清晰。

---

## 子阶段规划

---

### 7.1 删除 `get_datetime`，改为系统提示注入

> 工具调用有额外的 token 往返开销；时间是静态上下文，直接注入更高效。
> LobsterAI 的 `buildLocalTimeContextPrompt()` 采用同样策略。

#### 变更内容

**`src/chat/service.ts`** — `buildSystemPrompt()` 末尾追加时间行：

```typescript
const now = new Date().toLocaleString('zh-CN', {
  timeZone: 'Asia/Shanghai',
  hour12: false,
});
systemPrompt += `\n\n当前时间：${now}（Asia/Shanghai）`;
```

**删除**：`src/tools/builtins/get_datetime.ts`

**`src/tools/index.ts`** — 移除对应 import 与 register 行。

#### 验证

发送「现在几点」，响应直接包含正确时间，`tool_call` 事件中不再出现 `get_datetime`。

**完成情况（截至 2026-04-02）**：✅ 已交付 — `get_datetime.ts` 已删除，`buildSystemPrompt` 注入本地时间。

---

### 7.2 删除 `search_web`，接入 Tavily MCP

> Tavily 官方维护 `tavily-mcp` npm 包，和项目现有 `mcpManager` 完全兼容。
> 外部 API 变更、认证、重试由 MCP server 负责，项目不再自持任何 Tavily 代码。

#### 接入方式

通过 UI「MCP 服务器」页面添加一条配置：

```json
{
  "name": "Tavily Search",
  "command": "npx",
  "args": ["-y", "tavily-mcp@latest"],
  "env": {
    "TAVILY_API_KEY": "tvly-xxxxxxxxxxxxxxxx"
  }
}
```

`mcpManager` 启动后自动将 Tavily MCP 的工具注册进 `globalToolRegistry`，调用链路与现有 builtin 完全一致。

#### 变更内容

**删除**：`src/tools/builtins/search_web.ts`

**`src/tools/index.ts`** — 移除对应 import 与 register 行。

**`.env.example`** — 注明 key 已迁移至 MCP 配置：

```
# TAVILY_API_KEY 已废弃，搜索功能改由 MCP server 提供
# 请在 UI「MCP 服务器」页面的 env 字段填写 TAVILY_API_KEY
```

#### 注意事项

- Tavily MCP 工具名为 `tavily-search`（与原 `search_web` 不同），LLM 自动适配，无需改提示词
- MCP server 未配置时 LLM 收不到搜索工具，会回复"无法搜索"——行为符合预期
- 生产环境建议固定版本号，避免 `latest` 引入破坏性变更

#### 验证

添加 MCP 配置并启用后，发送「搜索 xxx」，`tool_call` 中工具名应为 `tavily-search` 且正常返回结果。

**完成情况（截至 2026-04-02）**：✅ 已交付 — `search_web.ts` 已移除；搜索依赖在 UI「MCP 服务器」中配置 Tavily（`tavily-mcp`）。

---

### 7.3 `send_sticker_bqb` 转为 SKILL

> 该工具的本质是"行为引导"：何时发表情、发哪类表情。这正是 SKILL.md 的职责。
> 去掉工具调用后，LLM 直接在回复中输出 emoji，token 开销为零。

#### 新增 SKILL 文件

新建 `SKILLS/emoji-expression/SKILL.md`：

```markdown
---
name: emoji-expression
description: 在轻松、安慰、庆祝、撒娇等氛围时，在回复中加入合适的 emoji 表情。每轮最多一个，放在语气合适的位置。
---

# Emoji Expression

## 何时使用

对话氛围轻松、需要安慰、庆祝或撒娇时，在回复中**自然地插入一个 emoji**。

- 每轮对话最多使用一次
- 放在与语气最搭配的位置（句末、段落间或独立成行）
- 正式、严肃或用户明显不需要时，不使用

## 情绪参考

| 情绪      | 推荐 emoji  |
| --------- | ----------- |
| 开心/庆祝 | 🎉 ✨ 😊 🥳 |
| 安慰/鼓励 | 🤗 💪 🌟 ❤️ |
| 撒娇/可爱 | 🥺 😋 🐾 🌸 |
| 惊讶      | 😲 🤩 👀    |
| 晚安/告别 | 🌙 👋 😴    |
| 疲惫      | 😮‍💨 🛋️ ☕    |
```

#### 变更内容

**删除**：`src/tools/builtins/send_sticker_bqb.ts`

**`src/tools/index.ts`** — 移除对应 import 与 register 行。

> `sticker/` 目录暂时保留，待 SKILL 方案效果稳定后再一并清理。

#### 取舍说明

| 对比项       | 工具方式                | SKILL 方式               |
| ------------ | ----------------------- | ------------------------ |
| emoji 精确度 | 从 emoji 池精确匹配     | LLM 自主选择，略有随机性 |
| token 开销   | 多一次工具调用往返      | 零额外开销               |
| 维护成本     | emoji 数据库 + 工具代码 | 只维护一个 md 文件       |
| 可扩展性     | 改 emoji 需改代码       | 改 SKILL.md 即可         |

#### 验证

发送「今天好开心」，回复中自然出现 emoji，`tool_call` 事件不再出现 `send_sticker_bqb`。

**完成情况（截至 2026-04-02）**：✅ 已交付 — `send_sticker_bqb.ts` 已删除；仓库内已提供 `SKILLS/emoji-expression/SKILL.md`。

---

## 不迁移的工具及原因

| 工具                                             | 原因                                                                                     |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `read_memory` / `write_memory` / `delete_memory` | 直接操作内部 SQLite，做成 MCP 需独立子进程，引入进程间通信开销，对单机个人助手是过度设计 |
| `read_skill`                                     | Phase 5.1 auto-routing 的核心依赖，技能系统按需读取 SKILL.md 的机制需要它                |

---

## 交付顺序

```
7.1（删 get_datetime）→ 7.2（search_web → Tavily MCP）→ 7.3（send_sticker → SKILL）
```

- **7.1** 改动最小（10 行内），立刻减少每轮工具调用次数
- **7.2** 依赖 MCP 配置，建议先配好 `npx tavily-mcp` 验证通过后再删除代码
- **7.3** 可独立进行，SKILL 效果满意后再删除工具代码与 `sticker/` 目录

---

## 最终目录结构

```
src/tools/
  types.ts
  registry.ts
  index.ts              ← 仅注册 3 个 builtin
  builtins/
    read_memory.ts
    write_memory.ts
    delete_memory.ts
    read_skill.ts
```

---

## 验证清单总览

| 子阶段                             | 状态      | 说明                                                |
| ---------------------------------- | --------- | --------------------------------------------------- |
| 7.1 删除 `get_datetime`            | ✅ 已完成 | 时间由系统提示注入；无 `get_datetime` 工具          |
| 7.2 删除 `search_web` / Tavily MCP | ✅ 已完成 | 自持 Tavily 代码已删；搜索走 MCP `tavily-search`    |
| 7.3 `send_sticker_bqb` → SKILL     | ✅ 已完成 | 工具已删；`SKILLS/emoji-expression/SKILL.md` 已存在 |

> **说明**：上表表示代码与仓库资产已对齐；若需证明 Tavily 搜索在本地可用，仍须在「MCP 服务器」中配置 `TAVILY_API_KEY` 并做一次「搜索 xxx」端到端验证。
