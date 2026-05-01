# Apps — 指南

## 目录职责

这个目录存放面向用户的应用入口。

- `web-ui/`：浏览器端客户端
- `desktop/`：Tauri 桌面壳

新增应用时，必须明确它是独立产品入口，还是现有入口的包装层。

## 规则

- 每个子应用目录都必须有自己的 `AGENTS.md` 或 README。
- 应用层只负责交互与宿主集成，不应重复实现后端核心业务。
- 如果新增应用改变根运行方式或构建方式，要同步更新根 README 与根 `AGENTS.md`。

## 下一步阅读

- Web：[web-ui/AGENTS.md](web-ui/AGENTS.md)
- Desktop：[desktop/AGENTS.md](desktop/AGENTS.md)
