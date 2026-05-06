# SwellLobster 项目开发进度报告

**更新日期**：2026-05-06

---

## 📊 项目概览

SwellLobster 是一个 24/7 个人 AI 助手项目，采用 Node.js + React 技术栈，参考 openakita 架构设计。

**技术栈**：

- 后端：Node.js 20+ / Hono 4 / SQLite (better-sqlite3)
- 前端：React 19 / TypeScript / Vite 8 / Ant Design 6

---

## ✅ 已完成功能（阶段 1-13 全部完成）

### 阶段1：身份系统激活 ✅

- Identity 文件注入 system prompt
- Persona 切换（default / boyfriend / business）
- 消息操作与上下文截断
- 多模态支持（文字 + 图片）

### 阶段2：Token 统计 + 搜索 ✅

- Token 消耗记录与统计
- 会话关键词搜索
- 使用趋势分析

### 阶段3：记忆 + 工具调用 ✅

- **长期记忆系统**
  - 自动提取（规则 pre-filter + LLM 判断）
  - 手动管理（CRUD）
  - Fingerprint 去重
  - 相关记忆检索注入 system prompt
- **Function Calling**
  - 内置工具：get_datetime、read_memory、write_memory、delete_memory
  - 工具调用循环（最多5轮）
  - SSE 工具执行状态推送
  - 工具结果截断保护（20000字符）

### 阶段4：MCP + 计划任务 ✅

- **MCP 服务器管理**
  - 子进程生命周期管理
  - 工具自动注册到 globalToolRegistry
  - 进程退出清理
- **计划任务**
  - Cron 定时任务
  - Webhook 触发
  - 自然语言转 Cron
  - 执行历史记录（最近50条）
- **模型故障转移**
  - Endpoint fallback 配置
  - 自动切换备用端点

### 阶段5：IM + 技能系统 ✅

- **IM 通道**
  - Telegram Bot（grammy）
  - 文字 + 图片消息支持
  - 白名单用户控制
  - 通道生命周期管理
  - 可扩展架构（ChannelAdapter）
- **技能系统**
  - 5个内置技能模板：
    - `daily_summary` — 每日工作总结
    - `web_search` — 网页搜索整理
    - `code_review` — 代码审查
    - `translate` — 多语言翻译
    - `task_decompose` — 任务拆解
  - 技能文件监听与热重载
  - 手动执行 + 自动注册为工具（trigger: llm_call）

### 阶段6：多模态输入 + 生产力工具 ✅

- 图片上传与多模态理解
- 文件上传与附件提示
- `read_file` 内置工具（txt / md / pdf）
- 会话导出（Markdown / JSON）
- 语音输入按钮（Web Speech API）

### 阶段7：Agent 模板系统 ✅

- 内置 6 个 Agent 模板：
  - `code-assistant`
  - `writing-assistant`
  - `data-analyst`
  - `research-assistant`
  - `customer-service`
  - `general`
- 新建对话时支持模板选择
- 模板注入额外 system prompt
- 模板支持推荐 persona 与工具集

### 日记增强（最近完成）✅

- 心情记录（7 种 mood）
- 日记与记忆来源绑定
- 创建/更新日记时自动提取记忆
- 支持手动重新提取记忆
- 支持查看日记关联记忆与时间线视图

### 阶段9：向量记忆 + 网络搜索 ✅

- Embedding 服务与配置项已落地
- `read_memory` 已支持语义检索优先、最低相似度阈值与失败回退
- `web_search` 已支持 Brave / Tavily / DuckDuckGo 与 `searchProvider`
- 高级配置页已提供 Embedding、阈值、provider 与搜索 API Key 配置
- 已补齐 embedding 回填脚本、provider 显式配置、回归测试与文档收口

### 阶段10：IM 扩展 + Agent 委托 ✅

- 已落地 IM 通道级 RPM / RPD 限流与 `im_rate_stats` 统计
- 已落地 `delegate_task` MVP，子会话默认禁止递归委托
- 已接入钉钉 Stream 通道 MVP，并接到现有 `IMManager -> ChatService` 链路
- 已接入飞书 WSClient 长连接通道，并补齐 IM 页面配置、扫码安装与消息发送链路
- 已补齐飞书自动化测试、通知流回归与阶段状态文档同步

### 阶段11：工具执行审批 + 安全边界 + 审计 ✅

- 工具风险元数据与 `ToolPermissionMeta` 已落地（`tools/policy.ts`、`tools/registry.ts`）
- 审批状态机接入聊天流（`chat/service.ts`）
- 审批持久化与查询 API（`api/routes/approvals.ts`、`store/approvalStore.ts`）
- 路径边界与网络边界（`net/fetchDispatcher.ts`）
- 前端审批 UI（modal 方式，支持批准一次/会话级批准/拒绝）
- 执行审计日志（`tools/executionAudit.ts`、DB migration 24、Status 页展示）

### 阶段12：计划模式 + 多 Agent 协作 ✅

- 计划数据结构（`planner/planSchema.ts`）
- Planner 生成与触发（`ChatService.generatePlanDraft`）
- 步骤执行引擎（`ChatService.executeStep` + `chatStreamPlan`）
- 子 Agent 委托协调层（`agents/delegateService.ts`）
- 计划持久化与 API（`store/planStore.ts`、DB migration 25、`api/routes/plans.ts`）
- 前端时间线 UI（`PlanTimeline.tsx`、`PlanStepCard.tsx`、Chat 页集成）
- 已补计划生成耗时、执行耗时、步骤耗时、审批等待次数/耗时、委托次数与失败步骤定位

### 阶段13：统一扩展运行时 ✅

- 已新增 `extensions/` 抽象层，统一 builtin / assistant skill / MCP server 描述结构
- 已支持最小 manifest 推导、健康状态映射与统一 catalog 聚合
- 已新增 `/api/extensions`、`/api/extensions/:id`、`/api/extensions/:id/{enable|disable|reload}`
- 已补 unified catalog / skill 启停 / MCP 生命周期动作的 route 回归测试
- 已新增前端 Extensions 入口页（`apps/web-ui/src/pages/Extensions/`），表格展示来源/健康状态/能力/权限画像，支持过滤、启停、重载、抽屉详情
- 已为 `tool_execution_audit` 增补 `extension_source` / `extension_id` 字段（DB migration 27），`/api/approvals/audit?source=` 支持按来源过滤

### 其他功能

- 文件上传与附件管理（支持图片、PDF、txt、md）
- 会话导出（Markdown / JSON）
- 日记功能
- Markdown + LaTeX + Mermaid 渲染

---

## 📁 项目结构

```
swell-lobster/
├── apps/
│   ├── web-ui/              # React 前端
│   └── desktop/             # Tauri 桌面应用（可选）
├── src/tide-lobster/        # Node.js 后端
│   ├── api/routes/          # API 路由
│   ├── chat/                # 聊天服务
│   ├── memory/              # 记忆系统
│   ├── tools/               # 工具注册与执行
│   ├── mcp/                 # MCP 服务器管理
│   ├── scheduler/           # 计划任务
│   ├── im/                  # IM 通道
│   └── skills/              # 技能系统
├── identity/                # 身份配置
│   ├── personas/            # 人格文件
│   └── skills/              # 内置技能模板
│       ├── daily_summary/
│       ├── web_search/
│       ├── code_review/
│       ├── translate/
│       └── task_decompose/
├── data/                    # 数据目录
│   ├── tide-lobster.db      # SQLite 数据库
│   ├── skills/              # 用户自定义技能
│   └── tmp/                 # 临时文件
└── docs/                    # 文档
    ├── roadmap.md           # 开发路线图
    ├── phases/              # 各阶段详细文档
    └── architecture/        # 架构文档
```

---

## 🎯 下一步建议

### 优先级1：桌面实机验证

- 当前活动任务：`docs/tasks/active/2026-05-02-desktop-release-validation.md`
- 目标：执行一轮真实桌面环境验收，回填 `docs/desktop-validation-checklist.md`

### 优先级2：阶段14（观测性与稳定性）

- 对应文档：`docs/phases/phase14-observability-stability-governance.md`
- 主要内容：统一观测事件模型、trace 与指标聚合、DB 迁移收敛、备份恢复能力、统一错误码、发布前稳定性基线

---

## 📊 技术债务与改进点

### 代码质量

- [x] 增加主干回归测试（Journal / Agent 模板 / 搜索链路）
- [x] 阶段 9 收口（迁移脚本 / provider 配置 / 阈值 / 文档）
- [x] 增加桌面端与导出链路回归测试
- [x] 完善主干错误处理
- [x] 统一前后端日志入口与格式

### 文档

- [x] API 文档（已有 api-reference.md）
- [x] 数据库 Schema 文档（已有 database-schema.md）
- [ ] 部署文档与运行说明收尾
- [x] 桌面端用户手册（`docs/desktop-user-guide.md`）

### 安全

- [ ] API 认证与鉴权
- [ ] 敏感数据加密
- [ ] 输入验证增强
- [ ] CORS 配置

### 性能

- [ ] 数据库查询优化
- [ ] 大文件上传优化
- [x] 前端主路由代码分割
- [ ] 图片压缩与 CDN

---

## 🚀 快速开始

### 开发环境

```bash
# 1. 安装依赖
npm install

# 2. 启动 Web 联调（同时拉起后端 + 浏览器前端）
npm run dev:web

# 3. 访问
# 前端：http://localhost:5173
# 后端：http://127.0.0.1:18900
```

桌面联调：

```bash
npm run dev:desktop
```

### 桌面安装包构建

```bash
npm run build:desktop
```

---

## 📚 参考文档

| 文档                                                        | 说明          |
| ----------------------------------------------------------- | ------------- |
| [roadmap.md](./roadmap.md)                                  | 开发路线图    |
| [phase1-identity.md](./phases/phase1-identity.md)           | 阶段1详细文档 |
| [phase2-token-search.md](./phases/phase2-token-search.md)   | 阶段2详细文档 |
| [phase3-memory-tools.md](./phases/phase3-memory-tools.md)   | 阶段3详细文档 |
| [phase4-mcp-scheduler.md](./phases/phase4-mcp-scheduler.md) | 阶段4详细文档 |
| [phase5-im-skills.md](./phases/phase5-im-skills.md)         | 阶段5详细文档 |
| [phase5-completion.md](./phases/phase5-completion.md)       | 阶段5完成状态 |
| [database-schema.md](./architecture/database-schema.md)     | 数据库设计    |
| [api-reference.md](./architecture/api-reference.md)         | API 接口文档  |

---

## 🎉 总结

SwellLobster 项目已完成所有规划的5个核心阶段，具备了一个完整的个人 AI 助手所需的全部基础功能：

✅ 多模态对话（文字 + 图片）  
✅ 长期记忆（自动提取 + 手动管理）  
✅ 工具调用（内置工具 + MCP 扩展）  
✅ 定时任务（Cron + Webhook）  
✅ IM 通道（Telegram + 钉钉 + 飞书 + 限流）  
✅ 技能系统（5个内置技能）  
✅ 工具审批与安全边界（风险元数据 + 审批状态机 + 执行审计）  
✅ 计划模式（结构化 plan 生成、步骤执行、持久化、前端时间线 UI、metrics）  
✅ 统一扩展运行时（builtin/skill/mcp catalog、前端管理页、审计联动）

阶段 1-13 全部完成，下一步进入阶段 14（观测性 + 稳定性 + 数据治理）。
