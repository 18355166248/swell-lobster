# Desktop — 指南

## 目录职责

这个目录负责 Tauri 桌面壳。

- Tauri 打包与运行时集成
- 后端 sidecar 准备
- 桌面端独有权限、插件与二进制管理

不要在这里重复实现后端业务逻辑或前端页面约定。

## 技术栈

Tauri 2、Rust、Node.js 辅助脚本，以及来自 `../web-ui` 的前端产物

## 关键入口

- `package.json` — desktop 相关脚本
- `src-tauri/` — Rust 与 Tauri 配置
- `scripts/prepare-binaries.mjs` — 打包辅助脚本
- `scripts/ensure-dev-sidecar-stubs.mjs` — 本地开发辅助脚本

## 硬规则

- 把桌面端视为 Web UI + 后端 sidecar 的宿主，而不是独立业务层。
- 新增 desktop 能力时，必须说明它影响的是前端行为、后端启动，还是操作系统权限。
- Tauri 配置与辅助脚本必须和根级校验命令保持一致。

## 提交前检查

```bash
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
```

## 下一步阅读

- 根指南：[AGENTS.md](../../AGENTS.md)
- 后端规则：[src/tide-lobster/AGENTS.md](../../src/tide-lobster/AGENTS.md)
