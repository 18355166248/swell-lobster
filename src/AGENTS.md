# Src — 指南

## 目录职责

这个目录存放后端与服务端实现。

当前主实现是：

- `tide-lobster/`：Hono + Node.js 后端

## 规则

- `src/` 下新增子系统时，必须说明它是独立服务、共享库，还是现有后端的一部分。
- 每个长期维护的子目录都应补自己的 `AGENTS.md` 或 README。
- 服务端目录要优先说明运行入口、依赖边界和验证命令。

## 下一步阅读

- [tide-lobster/AGENTS.md](tide-lobster/AGENTS.md)
