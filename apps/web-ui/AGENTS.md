# Web UI — 指南

## 目录职责

这个目录负责浏览器端客户端。

- 页面路由
- 共享 UI 组件
- 前端 API 调用封装
- 客户端状态、i18n 与主题

不要把后端逻辑、持久化实现或助手提示资产放到这里。

## 技术栈

React 19、TypeScript 5.9、Vite 8、Ant Design 6、Jotai 2、React Router 7、Tailwind CSS 3、i18next、React Hook Form、Zod

## 目录约定

```text
src/
  pages/<PageName>/
    index.tsx
    api.ts
    types.ts
    components/
  components/
  store/
  api/base.ts
  i18n/locales/
  routes.ts
  router.tsx
```

## 硬规则

- 只用 named exports。
- 所有用户可见文案都必须走 `t('...')`。
- 同时更新 `src/i18n/locales/zh.ts` 和 `src/i18n/locales/en.ts`。
- 布局与间距优先使用 Tailwind；复杂交互组件再使用 Ant Design。
- 页面私有组件默认放在对应页面目录下，只有复用时才提升到 `components/`。

## 状态与数据流

- 局部状态使用 `useState`。
- 跨页面或持久化状态使用 Jotai atoms。
- HTTP 调用统一走 `api/base.ts` helpers。
- 除非现有模式明显失效，否则不要新增 Redux 或 React Context。

## Ant Design 约束

- `Input` / `InputNumber` 组合场景使用 `Space.Compact`，不要再用已废弃的 `addonBefore` / `addonAfter`。
- 如果用了 `Form.useForm()`，对应生命周期内必须始终有匹配的 `<Form form={form}>` 挂载。

## 提交前检查

```bash
npm run lint
npm run build
```

## 下一步阅读

- 根指南：[AGENTS.md](../../AGENTS.md)
- 前端说明：[README.md](README.md)
