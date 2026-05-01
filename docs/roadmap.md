# swell-lobster 功能开发路线图

> 参考项目：openakita（Python 完整 AI 助手）
> 后端：Node.js 20+ / Hono 4 / better-sqlite3
> 前端：React 19 / TypeScript / Ant Design 6 / Tailwind

---

## 当前状态（2026-05-02）

### 已完成（可用）

| 功能                                                          | 后端 | 前端 |
| ------------------------------------------------------------- | ---- | ---- |
| 聊天会话（SSE 流式）                                          | ✅   | ✅   |
| LLM 端点管理                                                  | ✅   | ✅   |
| Identity 文件读写                                             | ✅   | ✅   |
| 阶段 1：身份注入 system prompt、persona、消息操作、上下文截断 | ✅   | ✅   |
| 阶段 2：Token 统计 + 会话搜索                                 | ✅   | ✅   |
| 阶段 3：记忆管理 + 工具调用                                   | ✅   | ✅   |
| 阶段 4：MCP 服务器 + 计划任务                                 | ✅   | ✅   |
| 阶段 5：IM 通道 + 技能系统                                    | ✅   | ✅   |
| 阶段 6：多模态输入 + 生产力工具                               | ✅   | ✅   |
| 阶段 7：Agent 模板系统                                        | ✅   | ✅   |
| Markdown + LaTeX + Mermaid 渲染                               | —    | ✅   |
| 文件上传与附件管理                                            | ✅   | ✅   |
| 会话导出（Markdown）                                          | ✅   | ✅   |
| 日记功能                                                      | ✅   | ✅   |
| 日记增强：心情记录 + 记忆联动                                 | ✅   | ✅   |
| 阶段 9：Embedding 配置 + 语义记忆检索 + `web_search` 收口能力 | ✅   | ✅   |

### 核心功能完整度

当前已完成阶段 1-7 和阶段 9，系统具备：

- 多模态对话（文字 + 图片）
- 文件附件上传与 `read_file` 工具解析
- 长期记忆（自动提取 + 手动管理）
- 工具调用（内置工具 + MCP 扩展）
- 定时任务（Cron + Webhook）
- IM 通道（Telegram Bot）
- 技能系统（5 个内置技能）
- 预设 Agent 模板（6 个内置模板）
- 会话导出（Markdown / JSON）
- 日记心情记录与记忆自动提取
- Embedding 配置、语义记忆检索阈值与降级链路、多提供商网络搜索
- 桌面 sidecar 自检、导出文件名归一化、前后端统一日志上报

---

## 阶段总览

```
阶段1：身份系统激活 ✅        → identity 文件注入 system prompt，persona 切换
阶段2：Token统计 + 搜索 ✅    → 记录 token 消耗，会话关键词搜索
阶段3：记忆 + 工具调用 ✅     → 长期记忆，Function Calling 内置工具
阶段4：MCP + 计划任务 ✅      → MCP 工具生态，Cron 定时任务
阶段5：IM + 技能系统 ✅       → Telegram Bot 接入，技能可扩展
阶段6：多模态 + 生产力 ✅     → 图片/文件上传、`read_file`、导出、语音输入
阶段7：Agent 模板系统 ✅      → 模板选会话、推荐 persona / tool preset
阶段9：向量记忆 + 网络搜索 ✅ → 语义检索阈值、迁移脚本、provider 配置、回归测试已补齐
阶段10：更多 IM + ACP ⬜     → 限流、钉钉/飞书、delegate_task
```

### 依赖关系图

```
阶段1 ───────────────────────────────────────────────────────── 所有后续依赖
  │   阶段2 （可与阶段1并行启动）
  └── 阶段3 ── 阶段4 ── 阶段5 ── 阶段6 ── 阶段7 ── 阶段9 ── 阶段10
```

---

## 详细文档索引

| 文档                                                                             | 内容                        |
| -------------------------------------------------------------------------------- | --------------------------- |
| [phases/phase1-identity.md](./phases/phase1-identity.md)                         | 身份系统激活 + 聊天增强     |
| [phases/phase2-token-search.md](./phases/phase2-token-search.md)                 | Token 统计 + 会话搜索       |
| [phases/phase3-memory-tools.md](./phases/phase3-memory-tools.md)                 | 记忆系统 + Function Calling |
| [phases/phase4-mcp-scheduler.md](./phases/phase4-mcp-scheduler.md)               | MCP 服务器 + 计划任务       |
| [phases/phase5-im-skills.md](./phases/phase5-im-skills.md)                       | IM 通道 + 技能系统          |
| [phases/phase6-multimodal-input.md](./phases/phase6-multimodal-input.md)         | 多模态输入 + 生产力工具     |
| [phases/phase7-agent-templates.md](./phases/phase7-agent-templates.md)           | Agent 模板系统              |
| [phases/phase9-vector-memory-search.md](./phases/phase9-vector-memory-search.md) | 向量记忆 + 网络搜索         |
| [phases/phase10-im-ratelimit-acp.md](./phases/phase10-im-ratelimit-acp.md)       | 更多 IM + ACP               |
| [architecture/database-schema.md](./architecture/database-schema.md)             | 完整 SQLite Schema          |
| [architecture/api-reference.md](./architecture/api-reference.md)                 | 所有 API 端点汇总           |

---

## 新增 npm 依赖汇总

| 阶段 | 包                                       | 用途                           |
| ---- | ---------------------------------------- | ------------------------------ |
| 1    | 无                                       | 纯业务逻辑                     |
| 2    | `recharts`（前端，可选）                 | Token 趋势图表                 |
| 3    | 无                                       | undici 已有                    |
| 4    | `node-cron`、`@modelcontextprotocol/sdk` | 定时任务、MCP 集成             |
| 5    | `grammy`、`gray-matter`                  | Telegram Bot、frontmatter 解析 |
| 6    | `pdfjs-dist`                             | PDF 解析                       |

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
| Agent 模板    | data 驱动 JSON 模板库     | 易扩展、前后端共享同一来源          |

---

## 当前推荐顺序

1. 文档与部署：补部署文档、用户手册与运行说明。
2. 桌面实机验证：按 sidecar 检查结果补一轮安装包与升级链路验证。
3. 阶段 10 延后：等 Web/桌面主干稳定后再扩 IM 与子 Agent 协作。
