# SwellLobster — Project Guide

## Overview

**SwellLobster** is a 24/7 personal AI assistant. Monorepo with npm workspaces:

- `apps/web-ui` — React/Vite frontend
- `src/tide-lobster` — Hono/Node.js backend

Node.js >= 20.20.0 required.

## Architecture

| Layer    | Stack                        | Port                        |
| -------- | ---------------------------- | --------------------------- |
| Frontend | React 19 + Vite + TypeScript | http://localhost:5173 (dev) |
| Backend  | Hono + Node.js + TypeScript  | http://127.0.0.1:18900      |
| Data     | JSON files in `data/`        | —                           |
| Persona  | Files in `identity/`         | —                           |

## Dev Commands

```bash
# Backend (run in src/tide-lobster/)
npm run dev        # tsx watch src/index.ts
npm run build      # tsc → dist/
npm start          # node dist/index.js
npm run test       # vitest run
npm run typecheck  # tsc --noEmit

# Frontend (run in apps/web-ui/)
npm run dev        # vite dev server
npm run build      # tsc -b && vite build
npm run lint       # eslint .
npm run lint:fix   # eslint . --fix
npm run format     # prettier --write

# Root
npm run format     # prettier --write all files
npm run lint       # lint frontend
npm prepare        # setup husky
```

## Commit Convention

Format: `<type>: <中文描述>`

Types: `feat` `fix` `docs` `style` `refactor` `perf` `test` `chore` `revert` `ci` `build`

Example: `feat: 新增聊天会话管理功能`

Max 100 chars. Enforced by commitlint + husky pre-commit hook.

## Code Style

Prettier config (`.prettierrc`):

- `semi: true`, `singleQuote: true`, `tabWidth: 2`
- `trailingComma: 'es5'`, `printWidth: 100`, `endOfLine: 'lf'`

Applied automatically on pre-commit via lint-staged.

## Sub-directory Guides

- `apps/web-ui/CLAUDE.md` — frontend conventions, components, state, i18n
- `src/tide-lobster/CLAUDE.md` — backend routes, LLM integration, data persistence

## gstack

- 所有网页浏览任务使用 `/browse` skill（来自 gstack）。
- 禁止使用 `mcp__claude-in-chrome__*` 工具。
- 如果 gstack skills 无法使用，运行 `cd ~/.claude/skills/gstack && ./setup` 重新构建二进制并注册 skills。

首次安装：

```bash
git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack && cd ~/.claude/skills/gstack && ./setup
```

可用 skills：`/office-hours`、`/plan-ceo-review`、`/plan-eng-review`、`/plan-design-review`、`/design-consultation`、`/review`、`/ship`、`/land-and-deploy`、`/canary`、`/benchmark`、`/browse`、`/qa`、`/qa-only`、`/design-review`、`/setup-browser-cookies`、`/setup-deploy`、`/retro`、`/investigate`、`/document-release`、`/codex`、`/cso`、`/autoplan`、`/careful`、`/freeze`、`/guard`、`/unfreeze`、`/gstack-upgrade`。
