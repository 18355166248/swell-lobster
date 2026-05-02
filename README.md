# SwellLobster

SwellLobster 是一个个人 AI 助手产品的 monorepo，包含 Web、桌面端和 Node.js 后端。

## 仓库结构

```text
swell-lobster/
├── apps/
│   ├── desktop/       # Tauri 桌面壳
│   └── web-ui/        # React + Vite 客户端
├── src/
│   └── tide-lobster/  # Hono 后端
├── identity/          # Persona 与助手身份资产
├── data/              # 运行时数据、上传文件、JSON 资产、SQLite DB
├── docs/              # 仓库内正式文档
└── scripts/           # 根级校验与工作流脚本
```

## 架构概览

| 层级        | 技术栈                                        | 说明                                           |
| ----------- | --------------------------------------------- | ---------------------------------------------- |
| Web UI      | React 19、TypeScript、Vite、Ant Design、Jotai | 浏览器端与桌面端 UI 复用同一套前端             |
| Desktop     | Tauri 2                                       | 封装前端并拉起后端 sidecar                     |
| Backend     | Hono、TypeScript、Node.js、Vitest             | API 服务、LLM 集成、Scheduler、MCP、IM         |
| Persistence | SQLite + JSON files                           | `data/tide-lobster.db` 与 `data/` 下配置类文件 |
| Identity    | Markdown / Prompt assets                      | 运行时从 `identity/` 加载                      |

## 环境要求

- Node.js `>=20.20.0`
- npm workspaces
- Rust 工具链（desktop 校验与打包需要）

## 快速开始

先在根目录安装依赖：

```bash
npm install
```

启动 Web 开发联调：

```bash
npm run dev:web
```

启动桌面开发联调：

```bash
npm run dev:desktop
```

构建桌面安装产物：

```bash
npm run build:desktop
```

## 运行模式

| 命令                    | 会启动什么                                       | 适用场景              |
| ----------------------- | ------------------------------------------------ | --------------------- |
| `npm run dev:web`       | `tide-lobster` + Vite Web UI                     | 浏览器联调            |
| `npm run dev:desktop`   | `tide-lobster` + Tauri Desktop                   | 桌面联调              |
| `npm run build`         | backend + web 构建                               | 仓库基础构建校验      |
| `npm run build:desktop` | `tide-lobster` 打包 + sidecar 准备 + Tauri build | 桌面安装包/发布前构建 |

说明：

- `dev:web` 与 `dev:desktop` 都由根脚本同时拉起后端。
- 开发态桌面窗口加载的是 `http://localhost:5173`，不是打包后的静态资源。
- 打包后的桌面应用会自行拉起内置 `tide-lobster` sidecar，不依赖你手动先跑后端。

## 桌面运行关系

桌面端不是独立业务层，而是下面这条链路的宿主：

```text
Tauri Desktop
  -> Web UI（复用 apps/web-ui）
  -> tide-lobster API / MCP / IM / Scheduler
  -> SQLite + JSON + identity 资产
```

- 浏览器模式下，Web UI 直接访问本地 `http://127.0.0.1:18900`。
- 桌面打包版下，Tauri 会启动内置后端 sidecar，并把日志、输出目录和代理环境透传给它。
- 默认输出目录为 `~/Documents/SwellLobster/outputs`，可用 `SWELL_OUTPUT_DIR` 覆盖。

## 常用命令

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run verify:docs
npm run verify
```

按 workspace 单独执行：

```bash
npm run dev -w tide-lobster
npm run dev -w swell-lobster
npm run build:desktop
```

## 质量门禁

- `npm run verify:docs`：校验仓库级一致性与文档约束。
- `npm run verify`：本地主质量门，覆盖 backend、frontend、desktop 与仓库一致性。
- Husky 会对暂存文件执行 `lint-staged`，并用 `commitlint` 校验提交信息。
- CI 会在 `push` / `pull_request` 上复用同一套校验流程。

## 提交规范

格式：`<type>: <中文描述>`

允许的 `type`：`feat`、`fix`、`docs`、`style`、`refactor`、`perf`、`test`、`chore`、`revert`、`ci`、`build`

示例：

```text
feat: 新增聊天会话管理功能
```

## 仓库指南

- 根指南：[AGENTS.md](AGENTS.md)
- 前端指南：[apps/web-ui/AGENTS.md](apps/web-ui/AGENTS.md)
- 桌面端指南：[apps/desktop/AGENTS.md](apps/desktop/AGENTS.md)
- 后端指南：[src/tide-lobster/AGENTS.md](src/tide-lobster/AGENTS.md)

## 相关文档

- 运行与排障指南：[docs/runtime-guide.md](docs/runtime-guide.md)
- 桌面发布前验收清单：[docs/desktop-validation-checklist.md](docs/desktop-validation-checklist.md)
- 桌面环境变量与代理：[docs/desktop-env-config.md](docs/desktop-env-config.md)
- 当前项目状态：[docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md)
- 路线图：[docs/roadmap.md](docs/roadmap.md)
