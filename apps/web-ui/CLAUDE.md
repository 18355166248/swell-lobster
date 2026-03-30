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

## Ant Design Input 组合（addonAfter / addonBefore）

- Ant Design 6 起 **`Input` / `InputNumber` 的 `addonAfter` / `addonBefore` 已弃用**，须改用 **`Space.Compact`**；详见仓库根目录 `.cursor/rules/antd-input-addonafter.mdc`，示例见 `pages/Scheduler/index.tsx` 的 `TimeOfDayFields`。

## Ant Design Form + Modal

控制台若出现 **`Instance created by useForm is not connected to any Form element`**，说明 `Form.useForm()` 拿到的实例当前没有挂在任何 `<Form form={form}>` 上。常见原因与对策：

1. **`Modal` + `destroyOnHidden`**：关闭弹窗会卸载内部 `<Form>`，父组件里的 `form` 实例仍存在 → 告警。含表单的弹窗**不要**对 `Modal` 使用 `destroyOnHidden`（除非把 `useForm` 与整段表单 UI 一起放进仅在 `open` 时挂载的子组件，并在该子组件内持有实例）。
2. **分步弹窗只渲染部分步骤**：若第一步没有 `<Form>`、第二步才有，第一步起 `form` 就处于未连接状态 → 用**一个** `<Form form={form}>` 包住弹窗内所有步骤（第一步可无 `Form.Item`）。
3. **`Form.useWatch('field', form)` 写在含 `<Form>` 的父组件里**：与 (1) 叠加时更易触发。优先在 **`<Form>` 的子组件内**使用 `Form.useWatch('field')`（不传第二个参数，走上下文）；或在父组件用 **`onValuesChange` + `useState`** 镜像需要的字段，避免在「Form 未挂载」阶段订阅。

硬规则：**只要调用了 `Form.useForm()`，就必须保证在对应 UI 生命周期内始终有 `<Form form={form}>` 与之绑定**（同一 `form` 实例不要离开 Form 树仍被 `useWatch`/校验使用）。

参考实现：`pages/IM/index.tsx`（多步 + 单 Form）、`pages/config/LLM/AddEndpointDialog.tsx`（`onValuesChange` 同步字段）。
