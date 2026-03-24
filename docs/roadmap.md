# swell-lobster 功能开发路线图

> 参考项目：openakita（Python 完整 AI 助手）
> 后端：Node.js 20+ / Hono 4 / better-sqlite3
> 前端：React 19 / TypeScript / Ant Design 6 / Tailwind

---

## 当前状态（2026-03）

### 已完成（可用）

| 功能                                                          | 后端 | 前端 |
| ------------------------------------------------------------- | ---- | ---- |
| 聊天会话（SSE 流式）                                          | ✅   | ✅   |
| LLM 端点管理                                                  | ✅   | ✅   |
| Identity 文件读写                                             | ✅   | ✅   |
| 阶段 1：身份注入 system prompt、persona、消息操作、上下文截断 | ✅   | ✅   |
| 阶段 2：Token 统计 + 会话搜索                                 | ✅   | ✅   |
| Markdown + LaTeX + Mermaid 渲染                               | —    | ✅   |

### 已有骨架，未实现

| 功能                 | 后端               | 前端    |
| -------------------- | ------------------ | ------- |
| 记忆管理             | 占位（返回空数组） | UI 框架 |
| 技能 (Skills)        | 占位               | UI 框架 |
| MCP 服务器           | 占位               | UI 框架 |
| 计划任务 (Scheduler) | 占位               | UI 框架 |
| IM 通道              | 占位               | UI 框架 |

### 关键缺口

- `llmClient.ts` 尚不支持 `tools` / Function Calling（阶段 3）

---

## 阶段总览

```
阶段1：身份系统激活 ✅     → identity 文件注入 system prompt，persona 切换（已完成，见 phases/phase1-identity.md 文首状态）
阶段2：Token统计 + 搜索 ✅ → 记录 token 消耗，会话关键词搜索（已完成，见 phases/phase2-token-search.md 文首状态）
阶段3：记忆 + 工具调用    → 长期记忆，Function Calling 内置工具
阶段4：MCP + 计划任务     → MCP 工具生态，Cron 定时任务
阶段5：IM + 技能系统      → Telegram Bot 接入，技能可扩展
```

### 依赖关系图

```
阶段1 ──────────────────────────────────────────── 所有后续依赖
  │   阶段2 （可与阶段1并行启动）
  └── 阶段3 ── 阶段4 ── 阶段5
```

---

## 详细文档索引

| 文档                                                                 | 内容                        |
| -------------------------------------------------------------------- | --------------------------- |
| [phases/phase1-identity.md](./phases/phase1-identity.md)             | 身份系统激活 + 聊天增强     |
| [phases/phase2-token-search.md](./phases/phase2-token-search.md)     | Token 统计 + 会话搜索       |
| [phases/phase3-memory-tools.md](./phases/phase3-memory-tools.md)     | 记忆系统 + Function Calling |
| [phases/phase4-mcp-scheduler.md](./phases/phase4-mcp-scheduler.md)   | MCP 服务器 + 计划任务       |
| [phases/phase5-im-skills.md](./phases/phase5-im-skills.md)           | IM 通道 + 技能系统          |
| [architecture/database-schema.md](./architecture/database-schema.md) | 完整 SQLite Schema          |
| [architecture/api-reference.md](./architecture/api-reference.md)     | 所有 API 端点汇总           |

---

## 新增 npm 依赖汇总

| 阶段 | 包                                       | 用途                           |
| ---- | ---------------------------------------- | ------------------------------ |
| 1    | 无                                       | 纯业务逻辑                     |
| 2    | `recharts`（前端，可选）                 | Token 趋势图表                 |
| 3    | 无                                       | undici 已有                    |
| 4    | `node-cron`、`@modelcontextprotocol/sdk` | 定时任务、MCP 集成             |
| 5    | `grammy`、`gray-matter`                  | Telegram Bot、frontmatter 解析 |

---

## 关键技术决策

| 决策          | 选择                      | 理由                                |
| ------------- | ------------------------- | ----------------------------------- |
| 数据库        | SQLite（better-sqlite3）  | 已有，个人助手规模足够              |
| 记忆检索      | SQLite LIKE / FTS5        | 不引入向量数据库，< 1000 条性能够用 |
| DB Migration  | 带版本号的 migration 函数 | 安全演化 schema                     |
| Telegram SDK  | grammy                    | TypeScript 原生，API 更现代         |
| Markdown 解析 | gray-matter               | 轻量，只解析 frontmatter            |
| 工具调用循环  | 最多 5 轮                 | 防无限循环                          |
| IM 消息映射   | user_id → ChatSession     | 保持对话历史连续                    |
