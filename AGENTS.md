# SwellLobster — 仓库指南

## 概览

SwellLobster 是一个个人 AI 助手产品的 monorepo。

- `apps/web-ui` — React 19 + Vite Web 客户端
- `apps/desktop` — Tauri 桌面壳
- `src/tide-lobster` — Hono + Node.js 后端
- `identity/` — persona、soul 与助手提示资产
- `data/` — 运行时状态、上传文件、JSON 配置与 SQLite 数据库

要求 Node.js `20.20.0`。桌面端校验还需要 Rust 工具链。

## Node 运行时

- 本项目固定使用 Node.js `20.20.0`，以 `.node-version` 为准。
- 运行任何 `node` / `npm` / `npx` / `tsx` / `vitest` / `tsc` 命令前，必须先用 `fnm use 20.20.0` 切换当前 shell。
- 在 PowerShell 中执行校验或开发命令时，把切换与命令放在同一个 shell 会话里，例如：

```powershell
fnm use 20.20.0
node --version
npm run verify
```

- 如果当前 PowerShell 会话里 `fnm` 不在 `PATH`（例如 Codex 非交互 shell），先加载 fnm 环境，再切换：

```powershell
& "$env:LOCALAPPDATA\Microsoft\WinGet\Links\fnm.exe" env --use-on-cd --shell powershell | Out-String | Invoke-Expression
fnm use 20.20.0
node --version
npm run verify
```

- `node --version` 必须输出 `v20.20.0` 后才能继续运行仓库命令。
- 如果 Codex 沙箱拒绝执行 `fnm.exe`，必须用提升权限重跑同一条 fnm 切换命令；如果无法完成 fnm 切换，停止并询问用户，不要继续执行任何 Node/npm 校验或开发命令。
- 不要直接使用系统默认 `node`，也不要绕过 fnm 直接调用固定 Node 安装路径运行本仓库命令；当前机器默认 Node 可能不是 20，会导致 `better-sqlite3` 等原生依赖 ABI 不匹配。

## 真相来源

- 仓库结构与根命令入口以本文件为准。
- 子系统实现约束以各子目录 `AGENTS.md` 为准。
- 可执行质量门禁以根 `package.json` scripts 和 `scripts/` 为准。
- 如果 README、CLAUDE 文档和代码不一致，优先遵循 `AGENTS.md` 与可执行脚本。

## 架构

| 层级        | 技术栈                                        | 说明                                                    |
| ----------- | --------------------------------------------- | ------------------------------------------------------- |
| Web         | React 19、TypeScript、Vite、Ant Design、Jotai | 开发地址 `http://localhost:5173`                        |
| Desktop     | Tauri 2                                       | 封装 Web UI，并打包后端 sidecar                         |
| Backend     | Hono、TypeScript、Node.js、Vitest             | API 服务默认运行在 `http://127.0.0.1:18900`             |
| Persistence | SQLite + JSON files                           | SQLite 位于 `data/tide-lobster.db`，JSON 用于配置类资产 |
| Identity    | Markdown / 结构化提示资产                     | 运行时从 `identity/` 加载                               |

## 下一步阅读

- [apps/AGENTS.md](apps/AGENTS.md)
- [apps/web-ui/AGENTS.md](apps/web-ui/AGENTS.md)
- [apps/desktop/AGENTS.md](apps/desktop/AGENTS.md)
- [src/AGENTS.md](src/AGENTS.md)
- [src/tide-lobster/AGENTS.md](src/tide-lobster/AGENTS.md)
- [identity/AGENTS.md](identity/AGENTS.md)
- [docs/AGENTS.md](docs/AGENTS.md)
- [scripts/AGENTS.md](scripts/AGENTS.md)

## 常用命令

根目录执行：

```bash
npm run typecheck
npm run test
npm run build
npm run verify:docs
npm run verify
```

联调入口：

```bash
npm run dev:web
npm run dev:desktop
npm run build:desktop
```

## 质量门禁

- `npm run verify:docs`：校验仓库级一致性与导航约束。
- `npm run verify`：提交前的主质量门，覆盖后端、前端、desktop 与仓库一致性。
- Husky 会执行 `lint-staged` 和 `commitlint`。
- CI 必须运行与本地一致的根命令校验链路。

## 提交规范

格式：`<type>: <中文描述>`

允许的 `type`：

- `feat`
- `fix`
- `docs`
- `style`
- `refactor`
- `perf`
- `test`
- `chore`
- `revert`
- `ci`
- `build`

## 默认约束

- 校验改动时优先使用根脚本，不要各自拼接临时 workspace 命令。
- 新增顶层产品目录或工程目录时，必须补对应 `AGENTS.md`。
- 不要再把存储描述成 “JSON only” 或 “no database”；当前后端同时使用 SQLite 和 JSON。
- 根指南保持短小，详细实现规则下沉到最近的子系统文档。

## 参考文档

- [docs/runtime-guide.md](docs/runtime-guide.md) — 启动链路、桌面运行关系、常见排障
- [docs/desktop-validation-checklist.md](docs/desktop-validation-checklist.md) — 桌面发布前人工验收清单
- [docs/desktop-env-config.md](docs/desktop-env-config.md) — 桌面端环境变量与代理配置
- [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) — 当前项目状态
- [docs/roadmap.md](docs/roadmap.md) — 开发路线图
