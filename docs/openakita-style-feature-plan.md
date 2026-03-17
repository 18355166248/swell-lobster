# Swell-Lobster 对标 OpenAkita 功能与菜单开发规划

## 一、目标与范围

- **目标**：在 swell-lobster 中实现与 OpenAkita 一致的桌面端效果——左侧固定菜单 + 右侧主内容区，菜单包含主功能与「配置」折叠区及其二级项。
- **参考**：功能与交互完全参考 OpenAkita（`apps/setup-center` 前端 + `src/openakita/api` 后端）。
- **当前基础**：
  - 前端：`apps/web-ui` 仅简单顶栏 + Home/NotFound，无侧边栏。
  - 后端：Python CLI 占位（`src/swell_lobster/main.py`），无 HTTP API。

---

## 二、菜单结构（与 OpenAkita 对齐）

| 类型     | 菜单项     | 后端 API 参考                                           |
| -------- | ---------- | ------------------------------------------------------- |
| 主菜单   | 聊天       | `/api/chat`、sessions                                   |
| 主菜单   | 消息通道   | `/api/im/channels`、IM 配置                             |
| 主菜单   | 技能       | `/api/skills`、`/api/config/skills`                     |
| 主菜单   | MCP        | `/api/mcp/*`                                            |
| 主菜单   | 计划任务   | `/api/scheduler/*`                                      |
| 主菜单   | 记忆管理   | `/api/memories/*`                                       |
| 主菜单   | 状态面板   | `/api/health`、端点/IM 状态                             |
| 主菜单   | Token 统计 | `/api/stats/tokens/*`                                   |
| 配置二级 | LLM 端点   | `/api/config/endpoints`、reload、providers、list-models |
| 配置二级 | IM 通道    | `/api/config/env`、IM 开关与 Bot                        |
| 配置二级 | 工具与技能 | `/api/config/skills`、skills 列表                       |
| 配置二级 | 灵魂与意志 | Agent 配置（SOUL/AGENT 等）                             |
| 配置二级 | 身份配置   | `/api/identity/*`                                       |
| 配置二级 | 高级配置   | `/api/config/env`、disabled-views、诊断等               |

---

## 三、开发阶段划分

### 阶段 0：前端骨架与路由（不依赖后端）

- **0.1** 布局：左侧固定侧边栏 + 右侧主内容区。
- **0.2** 路由：定义所有菜单项对应路由。
- **0.3** 侧栏组件：Logo、主菜单 8 项、配置折叠 + 6 个二级项、底部版本占位。
- **0.4** 占位页：为上述每个路由创建占位页面。

### 阶段 1：配置 - LLM 端点

- **1.1 后端**：FastAPI + config/endpoints、reload、providers、list-models。
- **1.2 前端**：LLM 端点配置页（列表、保存、应用并重启）。
- **1.3**：保存/应用并重启流程。

### 阶段 2：配置 - IM 通道、工具与技能、灵魂与意志、身份配置、高级配置

- **2.1** IM 通道：`/api/im/channels`、`/api/config/env` + 前端页。
- **2.2** 工具与技能：`/api/config/skills` + 前端页。
- **2.3** 灵魂与意志：说明页。
- **2.4** 身份配置：`/api/identity/*` + 前端页。
- **2.5** 高级配置：`/api/config/disabled-views` + 前端页。

### 阶段 3：主功能 - 聊天

- **3.1** 后端：`POST /api/chat`、`GET/POST /api/sessions`。
- **3.2** 前端：聊天页（消息列表、输入、发送）。

### 阶段 4：主功能 - 消息通道、技能、MCP、计划任务、记忆管理

- **4.1～4.5** 各主菜单对应 API（占位或实现）+ 前端页。

### 阶段 5：主功能 - 状态面板、Token 统计

- **5.1** 状态面板 + `/api/health`。
- **5.2** Token 统计页 + `/api/stats/tokens/*`。

### 阶段 6：联调与体验收尾

- 前后端联调、错误态/加载态/无数据态、Topbar。

---

## 四、任务拆分表（按菜单 + 前后端）

| 序号     | 任务                      | 类型      |
| -------- | ------------------------- | --------- |
| 0.1      | 前端：侧栏 + 主内容区布局 | 前端      |
| 0.2      | 前端：全量路由定义        | 前端      |
| 0.3      | 前端：Sidebar 组件        | 前端      |
| 0.4      | 前端：14 个占位页         | 前端      |
| 1.1      | 后端：FastAPI + config    | 后端      |
| 1.2      | 前端：LLM 端点配置页      | 前端      |
| 1.3      | 前端：保存并重启流程      | 前端      |
| 2.1～2.5 | 配置区其余 5 项           | 后端+前端 |
| 3.1～3.2 | 聊天 API + 页             | 后端+前端 |
| 4.1～4.5 | 主功能 5 项               | 后端+前端 |
| 5.1～5.2 | 状态面板、Token 统计      | 后端+前端 |
| 6        | 联调、Topbar 收尾         | 全栈      |

---

## 五、规划文档落地点

- **主规划文档**：本文档（`docs/openakita-style-feature-plan.md`）。
- **与现有文档衔接**：在 `learning-docs/LEARNING_ROADMAP.md` 中增加一节「对标 OpenAkita 桌面端功能与菜单」，链接到本文档。后端 API 与 Python 分批规划第 5 阶段（通道与 API）对齐。

---

## 六、实施顺序建议（简要）

1. 先做**阶段 0**，验收布局与路由。
2. 再做**阶段 1**（LLM 端点），确立前后端协作模式。
3. 按**阶段 2** 顺序完成配置区其余 5 项。
4. 按**阶段 3 → 4 → 5** 完成主功能 8 项。
5. 最后**阶段 6** 联调与收尾。
