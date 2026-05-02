# SwellLobster 项目开发进度报告

**更新日期**：2026-05-02

---

## 📊 项目概览

SwellLobster 是一个 24/7 个人 AI 助手项目，采用 Node.js + React 技术栈，参考 openakita 架构设计。

**技术栈**：

- 后端：Node.js 20+ / Hono 4 / SQLite (better-sqlite3)
- 前端：React 19 / TypeScript / Vite 8 / Ant Design 6

---

## ✅ 已完成功能（阶段 1-7、阶段 9 已完成）

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
│   ├── chat.db              # SQLite 数据库
│   ├── skills/              # 用户自定义技能
│   └── tmp/                 # 临时文件
└── docs/                    # 文档
    ├── roadmap.md           # 开发路线图
    ├── phases/              # 各阶段详细文档
    └── architecture/        # 架构文档
```

---

## 🎯 下一步建议

### 优先级1：部署与运行文档收尾

- 当前活动任务：`docs/tasks/active/2026-05-02-deployment-runtime-docs-closure.md`
- 重点补齐：
  - 本地开发启动说明
  - 生产构建与发布说明
  - 桌面端环境变量、代理与日志排障说明
  - Web / Desktop / sidecar 关系说明
- 目标：让新人仅靠仓库文档即可完成启动、配置与基础排障

### 优先级2：桌面实机验证

- 当前活动任务：`docs/tasks/active/2026-05-02-desktop-release-validation.md`
- 重点验证：
  - 安装包首次启动
  - sidecar 拉起与健康检查
  - 默认进入聊天页
  - 顶部重启按钮在开发态 / 打包态行为正确
  - 文件导出、本地打开、日志落盘与升级链路
- 目标：补齐桌面交付前最后一轮真实环境验收

### 优先级3：阶段10-14 后续开发主线

- **阶段10：IM 扩展 + Agent 委托 MVP**
  - IM 抽象层收敛并补齐钉钉/飞书
  - 通道级 RPM / RPD 限流
  - `delegate_task` 打通模板化子 Agent 委托
- **阶段11：工具执行审批 + 安全边界**
  - 工具风险分级、审批状态机、审计落库
  - 文件路径边界、脚本执行边界、网络访问边界
- **阶段12：计划模式 + 多 Agent 协作 v1**
  - 结构化 plan、步骤状态流转、子 Agent 结果汇总
  - 聊天页计划时间线与失败步骤重试
- **阶段13：统一扩展运行时**
  - 收敛 builtin / skill / mcp 的 catalog、manifest、健康状态
- **阶段14：观测性、稳定性与数据治理**
  - trace / metrics、migration、备份恢复、发布基线

对应阶段文档：

- `docs/phases/phase10-im-ratelimit-acp.md`
- `docs/phases/phase11-execution-approval.md`
- `docs/phases/phase12-plan-mode-multi-agent.md`
- `docs/phases/phase13-extension-runtime-unification.md`
- `docs/phases/phase14-observability-stability-governance.md`

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
- [ ] 用户手册

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

# 2. 启动后端
cd src/tide-lobster
npm run dev

# 3. 启动前端（新终端）
cd apps/web-ui
npm run dev

# 4. 访问
# 前端：http://localhost:5173
# 后端：http://127.0.0.1:18900
```

### 生产构建

```bash
# 后端
cd src/tide-lobster
npm run build
npm start

# 前端
cd apps/web-ui
npm run build
npm run preview
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
✅ IM 通道（Telegram Bot）  
✅ 技能系统（5个内置技能）

项目架构清晰、代码规范、文档完善，具备良好的可扩展性。接下来可以根据实际需求，选择性地进行功能增强和新功能开发。
