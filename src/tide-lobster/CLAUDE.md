# tide-lobster — Backend Guide

## Tech Stack

Node.js 20+, Hono 4, TypeScript 5.6 (strict, ESM), undici (HTTP client), dotenv, tsx (dev), vitest (tests)

## Adding a Route Group

1. Create `src/api/routes/<feature>.ts` exporting a Hono app
2. Register in `src/api/server.ts`: `app.route('/api/<feature>', featureRoutes)`
3. Return `c.json(result)` on success; `c.json({ detail: msg }, status)` on error

## Response Format

```typescript
// Success
return c.json({ data: result });

// Error
return c.json({ detail: 'Error message' }, 400); // or 404, 502, etc.
```

## Config / Settings

- All settings loaded from `src/config.ts` via `settings` singleton
- Env vars loaded from `.env` at repo root via dotenv
- Env var names: `SWELL_*` prefix or standard names (`API_PORT`, `HTTP_PROXY`)

## Data Persistence

- JSON file storage in `data/` (relative to repo root)
- Follow the `ChatSessionStore` pattern for file-based CRUD
- No database — JSON files only

## LLM Integration

- `src/chat/llmClient.ts` — handles `openai` and `anthropic` api_type
- `src/llm/bridge.ts` — fetches model lists from provider APIs (supports HTTP proxy)
- `src/llm/capabilities.ts` — infers model capabilities; add new models to the lookup table
- API keys are stored as **env var names** in endpoint config, never as raw values

## Tests

Framework: Vitest

```bash
npm run test       # vitest run (in src/tide-lobster/)
npm run typecheck  # tsc --noEmit
```

Test files: co-locate as `*.test.ts` next to source or in `__tests__/`.
