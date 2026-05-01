# Web UI

这个 workspace 负责 SwellLobster 的 React + Vite 客户端。

## 技术栈

- React 19
- TypeScript 5.9
- Vite 8
- Ant Design 6
- Jotai 2
- React Router 7
- Tailwind CSS 3
- i18next

## 职责范围

- Chat、Memory、MCP、Scheduler、IM、配置等页面
- 共享 UI 组件与路由注册
- 面向后端的前端 API 封装
- 主题、语言等客户端持久化状态

## 常用命令

在 `apps/web-ui/` 下执行：

```bash
npm run dev
npm run lint
npm run build
npm run format
```

## 开发约定

- 目录结构和硬规则见 [AGENTS.md](AGENTS.md)
- 所有用户可见文案都必须走 i18n
- 只有真的跨页面复用时，才把组件提升到共享目录
