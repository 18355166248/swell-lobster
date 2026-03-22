# Web UI — Frontend Guide

## Tech Stack

React 19, TypeScript 5.9, Vite 8, Ant Design 6, Jotai 2, React Router 7, Tailwind CSS 3, i18next, React Hook Form + Zod

## Directory Conventions

```
src/
  pages/<PageName>/
    index.tsx          # page component
    api.ts             # API call wrappers for this page
    types.ts           # page-specific TypeScript types
    components/        # page-local components
  components/          # shared/reusable components only
  store/               # Jotai atoms (global state only)
  api/base.ts          # base fetch helpers (apiGet, apiPost, apiPatch)
  i18n/locales/
    zh.ts              # type-master — must be complete
    en.ts              # must mirror zh.ts structure
  routes.ts            # route path constants
  router.tsx           # route registration
```

## State Management

- `useState` — local component state
- `atomWithStorage` (Jotai) — state that persists across navigations or page refresh
- No Context, no Redux
- Imports: `useAtomValue` (read-only), `useSetAtom` (write-only), `useAtom` (read+write)

## API Calls

```typescript
import { apiGet, apiPost } from '../../api/base';

const data = await apiGet<MyType>('/api/some-endpoint');
await apiPost('/api/endpoint', payload);
// Errors throw with message from response.detail or response.message
```

## Styling

- **Tailwind first** — layout, spacing, typography
- **CSS variables** — semantic tokens: `var(--accent)`, `var(--background)`, `var(--foreground)`
- **Ant Design** — complex interactive widgets (Table, Form, Modal, Select, etc.)
- Dark mode: use `.dark:` Tailwind prefix; never hardcode colors
- `important: true` is configured in Tailwind — no need for `!important`

## i18n

- All user-visible strings must use `t('key')` — no hardcoded text
- Add translations to BOTH `zh.ts` AND `en.ts`
- `zh.ts` is the type-master — TypeScript errors if `en.ts` is incomplete
- Key naming: `section.camelCaseName` (e.g., `llm.addEndpoint`, `chat.sendMessage`)

## Adding a Route

1. Add path constant to `src/routes.ts` as `ROUTES.MY_PAGE`
2. Register in `src/router.tsx` under `<RootLayout>`
3. Add menu item to `src/components/Sidebar.tsx`

## Component Rules

- Named exports only — no `export default`
- PascalCase component names
- Co-locate page-specific types and API calls in the page directory
