# SwellLobster

**7x24 小时个人助理** — 参考 XimaLobster 思路，支持前端与 Node 技术栈的 AI 助手项目。

---

## 项目简介

SwellLobster 是一个面向个人助理场景的 AI 项目，集成了学习路线、身份与人格配置、以及可选的 Web 前端。项目**内部支持 Node 技术栈**：前端为 React + TypeScript + Vite，并配有「用 Node 从 0 到 1 自建多 Agent 后端」的独立文档，便于在现有基础上扩展 Node 端能力。

---

## 核心能力

| 能力              | 说明                                                                                |
| ----------------- | ----------------------------------------------------------------------------------- |
| **Web 前端**      | `apps/web-ui`：React 19 + TypeScript + Vite 8，可独立运行与联调                     |
| **身份与人格**    | `identity/`：SOUL、AGENT、personas 等配置，与主流程解耦                             |
| **学习路线**      | `learning-docs/`：XimaLobster 项目学习路线、Node 后端可行性评估、从 0 到 1 自建指南 |
| **Node 后端思路** | 文档化 Node 替代 Python 后端的可行性，以及分阶段自建多 Agent 后端的路线图           |

---

## 技术栈

| 层级              | 技术                                                                                      |
| ----------------- | ----------------------------------------------------------------------------------------- |
| **前端 (Web UI)** | Node 20+，React 19，TypeScript，Vite 8                                                    |
| **身份与配置**    | Markdown / YAML（SOUL、AGENT、personas）                                                  |
| **学习与自建**    | 文档内推荐：Node 18+，Fastify/Express，Vercel AI SDK / LangChain.js，SQLite / pgvector 等 |

前端与学习文档中的自建后端均围绕 **Node**，方便在仓库内统一使用 Node 生态（脚本、工具、可选后端服务）。

---

## 快速开始

### 环境要求

- **Node.js**：>= 20.20.0（见 `apps/web-ui/.nvmrc`）
- 包管理：npm / pnpm / yarn 均可

### 运行 Web 前端

```bash
cd apps/web-ui
npm install
npm run dev
```

浏览器访问 Vite 默认地址（如 `http://localhost:5173`）即可。

### 其他脚本

```bash
cd apps/web-ui
npm run build   # 构建生产包
npm run preview # 预览生产构建
npm run lint    # ESLint 检查
npm run format  # Prettier 格式化（仅 web-ui 内）
```

### 代码规范与 Git Hooks（根目录）

在仓库根目录执行一次 `npm install` 后，会启用 **Husky** Git 钩子：

- **pre-commit**：对暂存文件执行 **lint-staged**（Prettier 格式化 + ESLint --fix），仅处理本次提交涉及的文件。
- **commit-msg**：由 **commitlint** 校验提交信息格式。

提交信息须符合：`<type>: <中文描述>`，例如 `feat: 添加登录页`、`fix: 修复列表分页错误`。  
常用 type：`feat` / `fix` / `docs` / `style` / `refactor` / `perf` / `test` / `chore`。

根目录可用脚本：

```bash
npm run format        # 全仓库 Prettier 格式化
npm run format:check  # 仅检查格式，不写入
npm run lint          # 执行 apps/web-ui 的 ESLint
npm run lint:fix      # ESLint 并自动修复
```

根目录与 web-ui 均使用同一套 **Prettier** 配置（见根目录 `.prettierrc`），ESLint 已通过 `eslint-config-prettier` 与 Prettier 兼容。

---

## 项目结构

```
swell-lobster/
├── apps/
│   └── web-ui/          # React + TypeScript + Vite 前端
├── identity/            # 身份、人格、运行时说明（SOUL、AGENT、personas）
├── docs/                # 提示词、结构说明等
├── learning-docs/       # 学习路线与 Node 自建文档
│   ├── LEARNING_ROADMAP.md
│   ├── node_后端可行性与_0_到_1_自建指南.plan.md
│   ├── BUILD_SIMILAR_AGENT_BACKEND.md
│   └── ...
└── README.md
```

---

## 文档索引

| 文档                                                                                         | 内容                                                           |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| [LEARNING_ROADMAP.md](learning-docs/LEARNING_ROADMAP.md)                                     | XimaLobster 项目学习路线、架构与请求主流程                     |
| [Node 后端可行性与 0 到 1 自建指南](learning-docs/node_后端可行性与_0_到_1_自建指南.plan.md) | Node 替代 Python 后端的可行性结论与交付物说明                  |
| [BUILD_SIMILAR_AGENT_BACKEND.md](learning-docs/BUILD_SIMILAR_AGENT_BACKEND.md)               | 从 0 到 1 自建多 Agent 助手后端（Node 版）— 技术选型与阶段划分 |

---

## 内部 Node 能力说明

本项目在以下方面**内置 Node 支持**，便于在内部扩展 Node 相关功能：

1. **前端应用**：`apps/web-ui` 为完整 Node 项目，使用 React + TypeScript + Vite，可接 REST/SSE 等后端 API。
2. **脚本与工具**：仓库内可增加 `scripts/` 或根目录 Node 脚本，统一使用 Node 运行（与前端共享 Node 版本约定）。
3. **自建后端**：`learning-docs` 中的文档明确给出「用 Node 从 0 到 1 自建多 Agent 后端」的路线（Fastify/Express、LLM SDK、存储、ReAct、会话、记忆、多 Agent、多通道），可按需实现并与现有 Web UI 对接。
4. **版本约定**：前端通过 `apps/web-ui/.nvmrc` 约定 Node 版本，团队可在此基础上统一开发与 CI 环境。

---

## 参考

- 项目思路与能力参考自 [XimaLobster](https://github.com/openakita/openakita)（开源多 Agent AI 助手）。
- 学习路线与架构描述见仓库内 `learning-docs/` 与 `docs/`。
