# 后端与本地开发（Node）

仓库内 HTTP API 由 **`src/tide-lobster`**（Hono + TypeScript）提供，默认 **`http://127.0.0.1:18900`**。

## 安装与启动后端

在仓库根目录已执行 `npm install` 的前提下：

```bash
cd src/tide-lobster
npm install
npm run dev
```

类型检查与测试：

```bash
cd src/tide-lobster
npm run typecheck
npm run test
```

## 一键前后端（可选）

在仓库根目录：

```bash
./dev.sh
```

（Windows 可使用同目录下的 `dev.ps1`。）

详见根目录 `CLAUDE.md` / `AGENTS.md` 中的架构与端口说明。
