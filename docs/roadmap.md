# swell-lobster 功能开发路线图

> 参考项目：openakita（Python 完整 AI 助手）
> 后端：Node.js 20.20.0 / Hono 4 / better-sqlite3
> 前端：React 19 / TypeScript / Ant Design 6 / Tailwind

---

## 当前状态（2026-05-15）

### 已完成（可用）

| 功能                                                                          | 后端 | 前端 |
| ----------------------------------------------------------------------------- | ---- | ---- |
| 聊天会话（SSE 流式）                                                          | ✅   | ✅   |
| LLM 端点管理                                                                  | ✅   | ✅   |
| Identity 文件读写                                                             | ✅   | ✅   |
| 阶段 1：身份注入 system prompt、persona、消息操作、上下文截断                 | ✅   | ✅   |
| 阶段 2：Token 统计 + 会话搜索                                                 | ✅   | ✅   |
| 阶段 3：记忆管理 + 工具调用                                                   | ✅   | ✅   |
| 阶段 4：MCP 服务器 + 计划任务                                                 | ✅   | ✅   |
| 阶段 5：IM 通道 + 技能系统                                                    | ✅   | ✅   |
| 阶段 6：多模态输入 + 生产力工具                                               | ✅   | ✅   |
| 阶段 7：Agent 模板系统                                                        | ✅   | ✅   |
| Markdown + LaTeX + Mermaid 渲染                                               | —    | ✅   |
| 文件上传与附件管理                                                            | ✅   | ✅   |
| 会话导出（Markdown）                                                          | ✅   | ✅   |
| 日记功能                                                                      | ✅   | ✅   |
| 日记增强：心情记录 + 记忆联动                                                 | ✅   | ✅   |
| 阶段 9：Embedding 配置 + 语义记忆检索 + `web_search` 收口能力                 | ✅   | ✅   |
| 阶段 10：IM 限流 + 钉钉 / 飞书通道 + `delegate_task` 委托 MVP                 | ✅   | ✅   |
| 阶段 11：工具风险元数据 + 审批状态机 + 审计日志 + 前端审批 UI                 | ✅   | ✅   |
| 阶段 12（步骤1-6）：计划模式数据结构 + 执行引擎 + 持久化 + 时间线 UI          | ✅   | ✅   |
| 阶段 13：统一扩展运行时（catalog、manifest、API + 前端扩展管理页）            | ✅   | ✅   |
| 阶段 14：统一观测事件、trace、指标聚合、DB 迁移收敛、备份恢复、错误码         | ✅   | ✅   |
| 阶段 15a：API 鉴权、CORS、`zod` 校验、字段加密、Security 设置页               | ✅   | ✅   |
| 阶段 15b：docx / xlsx / pptx 工具 + 技能模板 + Skills「文档生成」             | ✅   | ✅   |
| 阶段 15c：browser_automation、email_send（SMTP）+ 技能模板 + Skills「自动化」 | ✅   | ✅   |
| 阶段 16a：统一出站网络策略层（outboundPolicy + 配置 API）                     | ✅   | —    |
| 阶段 16b：run_script 子进程环境净化                                           | ✅   | —    |
| 阶段 16c：前端沙箱与网络设置页                                                | —    | ✅   |

### 规划中

| 功能                             | 后端 | 前端 |
| -------------------------------- | ---- | ---- |
| （暂无，阶段 16 已完成，规划中） | —    | —    |

### 核心功能完整度

当前已完成阶段 1-7、阶段 9-14，系统具备：

- 多模态对话（文字 + 图片）
- 文件附件上传与 `read_file` 工具解析
- 长期记忆（自动提取 + 手动管理）
- 工具调用（内置工具 + MCP 扩展）
- 定时任务（Cron + Webhook）
- IM 通道（Telegram / 钉钉 / 飞书）
- 技能系统（5 个内置技能）
- 预设 Agent 模板（6 个内置模板）
- 会话导出（Markdown / JSON）
- 日记心情记录与记忆自动提取
- Embedding 配置、语义记忆检索阈值与降级链路、多提供商网络搜索
- 桌面 sidecar 自检、导出文件名归一化、前后端统一日志上报
- IM 通道限流（RPM/RPD）、钉钉 Stream 通道、`delegate_task` Agent 委托 MVP
- 工具风险元数据与审批状态机、路径/网络边界、前端审批 UI、执行审计日志
- 计划模式（结构化 plan 生成、步骤执行引擎、持久化、前端时间线 UI）
- 统一扩展目录（builtin / skill / mcp catalog、manifest、健康状态与生命周期 API + 前端管理页、按来源过滤审计）
- 统一观测事件模型（12 种事件类别、trace 持久化、指标聚合、P95/每日趋势）
- DB 迁移收敛、备份恢复（SQLite + data 目录，pre-restore 回滚保护）
- 统一错误码与 AppError 类（`types/errors.ts`）
- Status 页观测面板（最近失败、慢调用、审批阻塞、MCP 健康状态）
- API 鉴权、本机/远程 token、鉴权失败限流、CORS 白名单、敏感字段加密与 Security 设置页
- 文档导出工具（docx/xlsx/pptx）、文档技能模板与 Skills「文档生成」分类
- 浏览器自动化与 SMTP 发件工具、自动化技能模板与 Skills「自动化」分类

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
阶段10：更多 IM + ACP ✅     → 限流、钉钉、飞书、delegate_task、通知流回归与文档已收口
阶段11：执行审批与安全 ✅    → 工具元数据、审批状态机、审计、前端 UI 全部完成
阶段12：计划模式 + 多 Agent ✅ → 计划结构、执行引擎、时间线 UI、metrics 与失败定位已完成
阶段13：统一扩展运行时 ✅    → catalog、manifest、API、前端扩展管理页、审计联动全部完成
阶段14：观测性与稳定性 ✅    → trace、指标、migration、备份恢复、发布基线全部完成
阶段15a：安全底座 ✅        → token 鉴权、CORS、zod 校验、敏感字段加密、Security 设置页
阶段15b：文档导出能力 ✅    → docx/xlsx/pptx tools、文档技能模板、Skills 文档分组
阶段15c：自动化能力 ✅      → browser_automation、email_send（SMTP）、Skills 自动化分组
阶段16a：统一出站网络策略 ✅  → outboundPolicy、checkOutbound、配置 API（/api/config/sandbox）
阶段16b：子进程环境净化 ✅    → run_script 剥离 SWELL_*、*_API_KEY 等敏感环境变量
阶段16c：沙箱设置页 ✅        → 前端可视化出站模式与规则、子进程净化状态
```

注：同上子阶段释义与验收清单见 [phase15-security-productivity-skills.md](./phases/phase15-security-productivity-skills.md#p15-subphases)。

### 依赖关系图

```
阶段1 ─────────────────────────────────────────────────────────────────── 所有后续依赖
  │   阶段2 （可与阶段1并行启动）
  └── 阶段3 ── 阶段4 ── 阶段5 ── 阶段6 ── 阶段7 ── 阶段9 ── 阶段10 ── 阶段11 ── 阶段12 ── 阶段13 ── 阶段14 ── 阶段15
```

阶段 15 在交付上已完成 **15a**、**15b**、**15c**，根级 `npm run verify` 通过，阶段 15 收口完成。阶段 16（**16a/16b/16c**）已全部交付，根级 `npm run verify` 通过，阶段 16 收口完成。

---

## 详细文档索引

| 文档                                                                                                           | 内容                                                            |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| [phases/phase1-identity.md](./phases/phase1-identity.md)                                                       | 身份系统激活 + 聊天增强                                         |
| [phases/phase2-token-search.md](./phases/phase2-token-search.md)                                               | Token 统计 + 会话搜索                                           |
| [phases/phase3-memory-tools.md](./phases/phase3-memory-tools.md)                                               | 记忆系统 + Function Calling                                     |
| [phases/phase4-mcp-scheduler.md](./phases/phase4-mcp-scheduler.md)                                             | MCP 服务器 + 计划任务                                           |
| [phases/phase5-im-skills.md](./phases/phase5-im-skills.md)                                                     | IM 通道 + 技能系统                                              |
| [phases/phase6-multimodal-input.md](./phases/phase6-multimodal-input.md)                                       | 多模态输入 + 生产力工具                                         |
| [phases/phase7-agent-templates.md](./phases/phase7-agent-templates.md)                                         | Agent 模板系统                                                  |
| [phases/phase9-vector-memory-search.md](./phases/phase9-vector-memory-search.md)                               | 向量记忆 + 网络搜索                                             |
| [phases/phase10-im-ratelimit-acp.md](./phases/phase10-im-ratelimit-acp.md)                                     | 更多 IM + ACP                                                   |
| [phases/phase11-execution-approval.md](./phases/phase11-execution-approval.md)                                 | 工具执行审批 + 安全边界                                         |
| [phases/phase12-plan-mode-multi-agent.md](./phases/phase12-plan-mode-multi-agent.md)                           | 计划模式 + 多 Agent 协作                                        |
| [phases/phase13-extension-runtime-unification.md](./phases/phase13-extension-runtime-unification.md)           | 统一扩展运行时                                                  |
| [phases/phase14-observability-stability-governance.md](./phases/phase14-observability-stability-governance.md) | 观测性 + 稳定性 + 数据治理                                      |
| [phases/phase15-security-productivity-skills.md](./phases/phase15-security-productivity-skills.md)             | 安全加固 + 生产力技能（**15a/15b/15c**，锚点 `#p15-subphases`） |
| [phases/phase16-sandbox-outbound-policy.md](./phases/phase16-sandbox-outbound-policy.md)                       | OS 级沙箱与出站网络策略（**16a/16b/16c**）                      |
| [architecture/database-schema.md](./architecture/database-schema.md)                                           | 完整 SQLite Schema                                              |
| [architecture/api-reference.md](./architecture/api-reference.md)                                               | 所有 API 端点汇总                                               |

---

## 新增 npm 依赖汇总

| 阶段 | 包                                                              | 用途                                      |
| ---- | --------------------------------------------------------------- | ----------------------------------------- |
| 1    | 无                                                              | 纯业务逻辑                                |
| 2    | `recharts`（前端，可选）                                        | Token 趋势图表                            |
| 3    | 无                                                              | undici 已有                               |
| 4    | `node-cron`、`@modelcontextprotocol/sdk`                        | 定时任务、MCP 集成                        |
| 5    | `grammy`、`gray-matter`                                         | Telegram Bot、frontmatter 解析            |
| 6    | `pdfjs-dist`                                                    | PDF 解析                                  |
| 15   | `docx`、`exceljs`、`pptxgenjs`、`nodemailer`、`playwright-core` | Phase15 文档导出、SMTP 发件与浏览器自动化 |

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

阶段 15a / 15b / 15c 已完成，阶段 15 根级 `verify` 通过，桌面端实机验证通过。当前主线进入**阶段 16**。

阶段 16 范围（与文档子阶段对齐）：

- **16a（统一出站策略）** 进行中：新建 `net/outboundPolicy.ts`，网络工具均接入策略校验，暴露 `/api/config/sandbox` 配置端点
- **16b（子进程环境净化）** 进行中：`run_script` 启动子进程前剥离所有宿主敏感环境变量
- **16c（沙箱设置页）** 待 16a 后启动：Security 页新增「沙箱与网络」面板

建议顺序：16a → 16b（可并行）→ 16c → 阶段 16 根级 `verify` 收口。

剩余技术债务（按优先级，不在阶段 16 必做范围）：

1. 部署文档与运行说明收尾
2. 数据库查询优化
3. 大文件上传优化、图片压缩
