# 桌面端环境变量配置

桌面应用（SwellLobster Desktop）内置了 `tide-lobster` 后端进程，所有对外 API 请求（LLM 接口、模型列表拉取等）均由该进程发出。本文介绍如何为桌面端配置环境变量，包括代理设置。

---

## 配置方式

桌面端支持两种方式注入环境变量，**推荐优先使用方式一**。

### 方式一：在数据目录放 `.env` 文件（推荐）

桌面端启动时会自动加载数据目录下的 `.env` 文件，无需修改系统环境变量，重启应用即生效。

**数据目录路径**

Windows 下两个位置均支持，优先读取 `AppData\Local`：

| 系统    | 路径（任选其一）                                            |
| ------- | ----------------------------------------------------------- |
| Windows | `C:\Users\{用户名}\AppData\Local\ai.swell.lobster\`（优先） |
| Windows | `C:\Users\{用户名}\AppData\Roaming\ai.swell.lobster\`       |
| macOS   | `~/Library/Application Support/ai.swell.lobster/`           |

不确定哪个路径实际生效时，查看日志文件（见文末"验证是否生效"），日志里会打印出实际扫描的路径。

**操作步骤**

1. 打开对应目录（若不存在，手动创建）
2. 新建文件 `.env`
3. 写入所需配置，保存
4. 重启 SwellLobster 桌面应用

**`.env` 文件示例**

```env
# HTTP 代理（适用于 http:// 请求）
HTTP_PROXY=http://127.0.0.1:7897

# HTTPS 代理（适用于 https:// 请求，LLM 接口均走此配置）
HTTPS_PROXY=http://127.0.0.1:7897

# 不走代理的地址（逗号分隔），留空则全部走代理
NO_PROXY=localhost,127.0.0.1

# 自定义 Python 路径（用于 run_script 工具，可选）
# SWELL_PYTHON_BIN=/usr/local/bin/python3
```

> **提示**：`127.0.0.1:7897` 是 Clash 的默认混合代理端口，根据实际代理软件地址修改。

---

### 方式二：系统环境变量（永久生效，全局）

将代理写入操作系统的环境变量，所有进程（包括桌面应用）都会继承。

#### Windows

**图形界面操作**

1. `Win + S` 搜索"环境变量"，点击"编辑系统环境变量"
2. 点击"环境变量..."
3. 在"用户变量"（仅当前用户）或"系统变量"（所有用户）区域点击"新建"
4. 分别添加：
   - 变量名：`HTTPS_PROXY`，变量值：`http://127.0.0.1:7897`
   - 变量名：`HTTP_PROXY`，变量值：`http://127.0.0.1:7897`
5. 点击确定，**重启 SwellLobster**

**命令行操作（当前用户，重启后永久生效）**

```powershell
[System.Environment]::SetEnvironmentVariable("HTTPS_PROXY", "http://127.0.0.1:7897", "User")
[System.Environment]::SetEnvironmentVariable("HTTP_PROXY",  "http://127.0.0.1:7897", "User")
```

#### macOS

**临时生效（当前终端会话）**

```bash
export HTTPS_PROXY=http://127.0.0.1:7897
export HTTP_PROXY=http://127.0.0.1:7897
# 然后从该终端启动应用
open /Applications/SwellLobster.app
```

**永久生效（写入 shell 配置）**

编辑 `~/.zshrc`（zsh，macOS 默认）或 `~/.bash_profile`（bash）：

```bash
export HTTPS_PROXY=http://127.0.0.1:7897
export HTTP_PROXY=http://127.0.0.1:7897
export NO_PROXY=localhost,127.0.0.1
```

保存后执行 `source ~/.zshrc`，**重启 SwellLobster**。

> **注意**：macOS 从 Finder / Dock 启动的 GUI 应用不会读取 shell 的 `export` 配置，推荐使用方式一（`.env` 文件）。

---

## 支持的环境变量

| 变量名             | 说明                                                        | 示例                         |
| ------------------ | ----------------------------------------------------------- | ---------------------------- |
| `HTTPS_PROXY`      | HTTPS 请求走代理（LLM 接口均为 HTTPS）                      | `http://127.0.0.1:7897`      |
| `HTTP_PROXY`       | HTTP 请求走代理                                             | `http://127.0.0.1:7897`      |
| `ALL_PROXY`        | HTTP + HTTPS 统一代理（优先级低于上两项）                   | `http://127.0.0.1:7897`      |
| `NO_PROXY`         | 不走代理的主机名，逗号分隔，支持通配符 `*`                  | `localhost,127.0.0.1,.local` |
| `SWELL_PYTHON_BIN` | 指定 Python 可执行文件路径，用于 run_script 工具            | `/usr/local/bin/python3`     |
| `SWELL_OUTPUT_DIR` | 覆盖输出文件目录（默认 `~/Documents/SwellLobster/outputs`） | `/tmp/swell-out`             |

---

## 优先级

同一变量同时存在时，加载顺序（后者覆盖前者）：

```
系统环境变量 → 安装目录/.env → 数据目录/.env
```

即数据目录的 `.env` 优先级最高，适合在不改动系统配置的情况下按需覆盖。

---

## 验证是否生效

重启桌面应用后，在设置页面"端点"处点击"刷新模型列表"。如果能正常拉取，说明代理配置已生效。也可查看日志文件确认：

| 系统    | 日志路径                                                                   |
| ------- | -------------------------------------------------------------------------- |
| Windows | `C:\Users\{用户名}\AppData\Roaming\ai.swell.lobster\logs\tide-lobster.log` |
| macOS   | `~/Library/Logs/ai.swell.lobster/tide-lobster.log`                         |

---

## MCP 启动超时快速定位

若日志中出现类似错误：

```text
[mcp] failed to start Tavily: Error: MCP[Tavily] connect timed out after 15000ms
```

按下面顺序排查：

1. 先确认该 MCP 是否通过 `npx` / `bunx` / `pnpm dlx` 启动。
2. 如果是临时执行器，优先检查 `npm` 当前 registry，而不是先怀疑 MCP 代码本身。
3. 若机器配置了公司内网源，例如 `http://xnpm.ximalaya.com/`，要确认目标包是否存在且可访问；内网源返回 `502` 或无该包时，`npx` 往往只表现为启动超时。
4. 再检查代理是否对终端进程生效。注意：项目根 `.env` 会被桌面内置后端读取，但不会自动影响你手动执行的 `npm` / `npx` 命令。

推荐的快速验证命令：

```bash
npm config get registry
curl -I https://registry.npmjs.org/
curl -I https://registry.npmjs.org/tavily-mcp
curl -I https://registry.npmjs.org/bilibili-mcp-js
```

若你本地使用代理端口 `7897`，手动排查时要显式带上代理环境变量：

```bash
HTTPS_PROXY=http://127.0.0.1:7897 \
HTTP_PROXY=http://127.0.0.1:7897 \
ALL_PROXY=http://127.0.0.1:7897 \
npm config get registry
```

### 本次案例结论

- 现象：`Tavily` 和 `bilibili-search` 均报 `MCP[...] connect timed out`
- 干扰项：`telegram connected`、`IMKCFRunLoopWakeUpReliable`、`page has no displayID` 不是根因
- 根因：全局 npm registry 指向 `http://xnpm.ximalaya.com/`，而目标 MCP 包在该源上不可用或返回 `502`
- 修复方向：
  - 临时：切换 `nrm` / `npm config set registry https://registry.npmjs.org/`
  - 长期：对 `npx` 型 MCP 显式指定 registry，避免继承全局错误源
