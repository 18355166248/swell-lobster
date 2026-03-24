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

- `apps/web-ui/AGENTS.md` — frontend conventions, components, state, i18n
- `src/tide-lobster/AGENTS.md` — backend routes, LLM integration, data persistence
