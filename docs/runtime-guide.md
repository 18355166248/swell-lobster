# 运行与排障指南

本文收敛 SwellLobster 的启动链路、桌面运行关系、构建入口和常见排障方式。  
如果你主要想看“如何作为桌面端用户使用产品”，先读 [desktop-user-guide.md](desktop-user-guide.md)；环境变量与代理细节请配合 [desktop-env-config.md](desktop-env-config.md) 一起看。

## 启动链路

### 1. 浏览器联调

```bash
npm run dev:web
```

会同时启动：

- `src/tide-lobster`：本地 API 服务，默认监听 `http://127.0.0.1:18900`
- `apps/web-ui`：Vite 开发服务器，默认地址 `http://localhost:5173`

适用场景：

- 调试聊天、配置、状态页等前端页面
- 联调后端 API、MCP、IM、Scheduler

### 2. 桌面联调

```bash
npm run dev:desktop
```

会同时启动：

- `src/tide-lobster`：本地开发后端
- `apps/desktop`：Tauri 开发窗口

关键行为：

- Tauri 开发窗口通过 `devUrl` 加载 `http://localhost:5173`
- `apps/desktop/scripts/ensure-dev-sidecar-stubs.mjs` 只负责满足 Tauri 编译期对 `externalBin` 的存在性要求
- 开发态桌面不会启动打包 sidecar，而是连到根脚本一并拉起的本地后端

### 3. 桌面打包

```bash
npm run build:desktop
```

该命令会顺序执行：

1. `tide-lobster` 打包为可分发二进制
2. 准备 `tide-lobster` 与 `uv` sidecar 产物
3. 执行 Tauri build

打包版桌面应用启动后会自行拉起内置 `tide-lobster` sidecar，不需要用户手动执行 `npm run dev -w tide-lobster`。

## 桌面运行关系

桌面端本质上是 Web UI 的宿主，而不是单独的一套前端逻辑：

```text
Tauri Desktop
  -> Web UI（apps/web-ui）
  -> tide-lobster sidecar
  -> data/、identity/、SQLite、输出目录
```

其中：

- Web UI 与浏览器端复用同一套 React 代码
- `tide-lobster` 负责 API、LLM、MCP、IM、Scheduler、技能执行
- 桌面壳负责 sidecar 生命周期、文件打开、日志路径、输出目录和操作系统权限

## 关键目录与路径

### API 与前端地址

- Web UI 开发地址：`http://localhost:5173`
- Backend 默认地址：`http://127.0.0.1:18900`

### 运行时数据

- SQLite：`data/tide-lobster.db`
- JSON 配置与上传：`data/`
- identity 资产：`identity/`

### 桌面输出目录

- 默认：`~/Documents/SwellLobster/outputs`
- 可通过 `SWELL_OUTPUT_DIR` 覆盖

### 桌面全局配置

- macOS：`~/.swell-lobster/.env`
- Windows：`%USERPROFILE%\\.swell-lobster\\.env`

打包桌面版会优先从该全局文件读取 API Key、代理和其它环境变量，不再依赖安装目录。

### 桌面日志

- macOS：`~/Library/Logs/ai.swell.lobster/tide-lobster.log`
- Windows：`%AppData%/ai.swell.lobster/logs/tide-lobster.log`

桌面内可从“状态”页点击“查看日志”直接打开日志文件。

## 环境变量与代理

桌面端会把这些能力透传给内置后端：

- `HTTP_PROXY`
- `HTTPS_PROXY`
- `ALL_PROXY`
- `NO_PROXY`
- `SWELL_OUTPUT_DIR`
- `SWELL_PYTHON_BIN`

推荐优先使用用户主目录下的全局 `.env` 文件配置，完整说明见 [desktop-env-config.md](desktop-env-config.md)。

## 常见问题

### 开发态点击“重启”后白屏

先确认是否仍在运行旧代码。当前行为应为：

- `tauri dev`：顶部“重启”只刷新当前窗口
- 打包版：顶部“重启”才会执行真正的应用重启

如果仍白屏：

1. 关闭当前桌面窗口
2. 重新执行 `npm run dev:desktop`
3. 确认 `http://localhost:5173` 与 `http://127.0.0.1:18900/api/health` 都可访问

### 桌面启动后后端不可用

优先区分当前是开发态还是打包态：

- 开发态：检查根脚本拉起的 `tide-lobster` 是否仍在运行
- 打包态：检查 sidecar 是否启动成功，以及日志中是否有缺失二进制或绑定文件的诊断信息

可优先查看：

- 桌面“状态”页中的服务状态
- `tide-lobster.log` 中的 `[diag]`、`[ERR]`、`[PROCESS ERROR]`、`[TERMINATED]`

### 打包或启动时报 sidecar 缺失

先执行：

```bash
npm run build:desktop
```

如果需要单独检查 sidecar 布局：

```bash
npm run check:sidecar -w swell-lobster-desktop
```

该校验会确认：

- `tide-lobster` 与 `uv` 二进制是否存在
- `externalBin` 与 capability 配置是否一致
- 当前平台的 sidecar 文件是否已落位

### `18900` 端口冲突

现象通常是：

- Web/桌面页面打不开
- `api/health` 不通
- 后端启动日志报端口占用

处理方式：

1. 先结束本地残留的 `tide-lobster` / `node` / Tauri dev 进程
2. 再重新执行根命令 `npm run dev:web` 或 `npm run dev:desktop`
3. 若问题反复出现，优先检查是否有另一个本地实例占用了 `127.0.0.1:18900`

### 模型列表或 MCP 启动超时

优先排查代理和 npm registry：

1. 检查桌面 `.env` 或系统环境变量中的代理是否生效
2. 检查 `npm config get registry`
3. 若 MCP 通过 `npx` / `bunx` 启动，确认目标包能从当前 registry 拉取

这类问题的具体排查步骤见 [desktop-env-config.md](desktop-env-config.md#mcp-启动超时快速定位)。

### 导出文件找不到

优先检查：

- 默认输出目录 `~/Documents/SwellLobster/outputs`
- 是否设置了 `SWELL_OUTPUT_DIR`
- 日志中是否有导出或打开文件失败的错误

桌面端文件打开依赖系统默认程序；如果文件已生成但打不开，通常是系统文件关联问题，而不是导出本身失败。

## 发布前最小检查

建议至少执行：

```bash
npm run verify:docs
npm run verify
npm run build:desktop
```

然后再做一轮人工验证：

- Web 启动正常
- Desktop 启动正常
- 默认进入聊天页
- 顶部“重启”符合当前环境预期
- 状态页可查看日志
- 导出文件可落盘、可打开
