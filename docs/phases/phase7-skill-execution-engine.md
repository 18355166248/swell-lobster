# 阶段 7：Skill 执行引擎 + Tauri 桌面支持

> **目标**：让 LLM 在聊天中真正能执行 Python/Node.js 脚本，生成 PPT/Excel/PDF 等文件并返回给用户；同时通过 Tauri 将 Web 应用打包为桌面应用，桌面端支持本地文件直接打开。
>
> **前置条件**：阶段 5.1 已完成（auto-routing + `read_skill` 工具可用）

---

## 背景与问题

Phase 5.1 实现了 auto-routing：LLM 能读取 SKILL.md 并知道需要运行 Python 脚本。但**执行工具缺失**——内置的 pptx/xlsx/pdf/docx SKILL.md 描述了工作流，却没有实际执行脚本的能力。

---

## 整体架构

### 运行模式

```
┌─────────────────────────────────────────────────────────────┐
│  Web 模式（浏览器访问）                                        │
│  浏览器 → HTTP → tide-lobster:18900 → run_script 工具        │
│  文件通过 GET /api/files/:filename 下载                       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Tauri 桌面模式                                               │
│  Tauri WebView → tide-lobster sidecar → run_script 工具      │
│  文件写入本地 ~/Documents/SwellLobster/outputs/               │
│  用 tauri-plugin-shell open 打开文件（系统默认程序）            │
└─────────────────────────────────────────────────────────────┘
```

### 执行流程

```
用户输入（聊天）
  ↓
LLM auto-routing → read_skill 读取 SKILL.md
  ↓
LLM 调用 run_script 工具
  ↓
tide-lobster 后端执行脚本
  ↓
文件写入 $OUTPUT_DIR（web: data/outputs/；tauri: ~/Documents/.../outputs/）
  ↓
LLM 回复含 [filename](/api/files/xxx) 链接
  ↓
前端 FileCard 渲染（Web: HTTP 下载；Tauri: 系统程序打开）
```

---

## Phase 7a：后端执行引擎

### 新建 `src/tide-lobster/src/tools/builtins/run_script.ts`

统一工具，通过文件扩展名自动选择解释器：

- `.py` → Python（检测顺序：`SWELL_PYTHON_BIN` 环境变量 → `python3` → `python` → `uv run`）
- `.js` / `.mjs` → Node.js（`process.execPath`，当前 Node 二进制，100% 可用）

**工具参数：**

| 参数              | 类型     | 必填 | 说明                                            |
| ----------------- | -------- | ---- | ----------------------------------------------- |
| `script_path`     | string   | ✅   | 脚本绝对路径，必须在 SKILLS/ 或 data/skills/ 下 |
| `args`            | string[] | ❌   | 命令行参数                                      |
| `input_data`      | string   | ❌   | 写入 stdin 的数据                               |
| `timeout_seconds` | number   | ❌   | 超时秒数（默认 30，上限 120）                   |

**安全约束（与 read_skill 一致）：**

- `realpathSync` 解析符号链接后校验路径在白名单根目录内
- 允许根目录：`SKILLS/` 和 `data/skills/`
- 文件扩展名白名单：`.py`、`.js`、`.mjs`

**注入环境变量：**

- `SKILLS_ROOT`：SKILLS/ 绝对路径
- `OUTPUT_DIR`：输出目录绝对路径（web: `data/outputs/`；通过 `SWELL_OUTPUT_DIR` 环境变量可覆盖）

**返回值（JSON 字符串）：**

```json
{
  "exit_code": 0,
  "stdout": "...",
  "stderr": "...",
  "output_files": [{ "filename": "report.pptx", "url": "/api/files/report.pptx" }],
  "timed_out": false
}
```

### 新建 `src/tide-lobster/src/api/routes/files.ts`

```
GET /api/files/:filename
```

- 从 `OUTPUT_DIR` 提供文件下载
- `basename(decodeURIComponent(filename))` 防路径穿越
- MIME 类型映射：pptx / xlsx / docx / pdf / png / jpg / zip

### 修改文件

- `src/tide-lobster/src/tools/index.ts`：注册 `runScriptTool`
- `src/tide-lobster/src/api/server.ts`：注册 `filesRouter`
- `src/tide-lobster/src/config.ts`：新增 `outputDir`（读取 `SWELL_OUTPUT_DIR`，默认 `data/outputs/`）

---

## Phase 7b：SKILL.md 更新

为 `pptx`、`xlsx`、`pdf`、`docx` 四个 SKILL.md 各加一节 `## Execution Environment`，放在文件开头 Overview 之后。

**内容约定：**

1. 使用 `run_script` 工具执行脚本（不要尝试直接 bash/shell）
2. 脚本路径：`$SKILLS_ROOT/<skill>/scripts/<file>`（`$SKILLS_ROOT` 由环境变量注入）
3. 输出文件写入 `os.environ['OUTPUT_DIR']`（Python）或 `process.env.OUTPUT_DIR`（Node.js）
4. `run_script` 返回 JSON，`output_files` 数组含下载 URL
5. 在最终回复中用 Markdown 链接引用：`[filename.pptx](/api/files/filename.pptx)`

**pptx 特殊说明：** `html2pptx.js` 是 Node.js 脚本（扩展名 `.js`），走 node 解释器。

---

## Phase 7c：Tauri 桌面应用

### 项目结构

```
apps/
  web-ui/          # React 前端（Web 与桌面共用）
  desktop/         # 新建：Tauri 桌面应用
    src-tauri/
      src/
        main.rs    # Tauri 入口，sidecar 生命周期管理
        lib.rs     # Tauri commands（run_script、open_file、get_output_dir）
      Cargo.toml
      build.rs
      tauri.conf.json
      capabilities/
        default.json
    package.json   # Tauri 开发脚本
    binaries/      # 存放平台二进制（tide-lobster、uv）
```

### Tauri 技术栈

| 插件                   | 用途                                    |
| ---------------------- | --------------------------------------- |
| `tauri-plugin-shell`   | 执行外部程序（open 文件、sidecar 管理） |
| `tauri-plugin-fs`      | 文件系统读写                            |
| `tauri-plugin-dialog`  | 文件选择/保存对话框                     |
| `tauri-plugin-process` | 应用退出时清理 sidecar                  |

### tide-lobster 作为 Sidecar

**方案：Node.js SEA（Single Executable Application）**

- Node.js 20+ 内置，构建时仍需要 `postject` 注入 blob
- 构建流程：
  1. `npm run build`（tsc → dist/）
  2. `node --experimental-sea-config sea-config.json`（生成 sea-prep.blob）
  3. 注入到目标平台二进制（node 可执行文件 + blob）
  4. 签名（macOS: `codesign`；Windows: `signtool`）
  5. 输出到 `apps/desktop/src-tauri/binaries/tide-lobster-{target}`

**替代方案（快速开发）：** 直接 bundle `node` 可执行文件 + `dist/` 目录，通过 Tauri shell plugin 启动 `node dist/index.js`。

**Tauri main.rs 核心逻辑：**

```rust
// 应用启动时
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // 1. 确定输出目录（~/Documents/SwellLobster/outputs/）
            // 2. 启动 tide-lobster sidecar，传入 OUTPUT_DIR 环境变量
            // 3. 等待 /api/health 就绪（最多 10s）
            // 4. 展示主窗口
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![open_file, get_output_dir])
        .run(...)
}

#[tauri::command]
fn open_file(path: String) -> Result<(), String> {
    // 用系统默认程序打开文件
    open::that(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_output_dir(app: AppHandle) -> String {
    // 返回当前 OUTPUT_DIR 路径
}
```

### uv Sidecar（Python 依赖管理）

- 下载对应平台的 `uv` 二进制（macOS/Linux: ~10MB，Windows: ~15MB）
- 放置到 `apps/desktop/src-tauri/binaries/uv-{target}`
- tide-lobster 的 `run_script` 检测到 uv 时优先使用 `uv run --with <deps> script.py`
- **好处**：首次运行脚本时 uv 自动安装依赖到隔离环境，不污染系统 Python

**脚本头部声明依赖（uv inline metadata）：**

```python
# /// script
# requires-python = ">=3.10"
# dependencies = ["python-pptx", "openpyxl"]
# ///
import pptx
```

### Tauri 打包配置（tauri.conf.json 关键字段）

```json
{
  "productName": "SwellLobster",
  "identifier": "ai.swell.lobster",
  "build": {
    "beforeBuildCommand": "npm run build:all",
    "frontendDist": "../web-ui/dist"
  },
  "bundle": {
    "active": true,
    "resources": ["binaries/*"],
    "externalBin": ["binaries/tide-lobster", "binaries/uv"]
  }
}
```

### 开发脚本（apps/desktop/package.json）

```json
{
  "scripts": {
    "dev": "tauri dev",
    "build": "tauri build",
    "build:binaries": "node scripts/prepare-binaries.js"
  }
}
```

---

## Phase 7d：前端双模式适配

### isTauri 工具函数

新建 `apps/web-ui/src/utils/platform.ts`：

```typescript
export const isTauri = (): boolean => '__TAURI__' in window;
```

### FileCard 组件（新建）

`apps/web-ui/src/components/FileCard/index.tsx`

```
┌─────────────────────────────────┐
│ 📊  report.pptx                 │
│     PowerPoint · 生成完成        │
│              [打开] [下载]       │
└─────────────────────────────────┘
```

**行为：**

- **Web 模式**：下载按钮 → `window.open(apiBaseUrl + href)`
- **Tauri 模式**：
  - 「打开」→ `invoke('open_file', { path: localFilePath })`（系统默认程序）
  - 「下载」→ Tauri 文件保存对话框（`@tauri-apps/plugin-dialog` save）

**文件类型映射：**

| 扩展名  | 图标 | 颜色   | 标签       |
| ------- | ---- | ------ | ---------- |
| `.pptx` | 📊   | orange | PowerPoint |
| `.xlsx` | 📈   | green  | Excel      |
| `.docx` | 📄   | blue   | Word       |
| `.pdf`  | 📕   | red    | PDF        |
| `.zip`  | 📦   | gray   | 压缩包     |

### MarkdownContent 更新

在 `a` 自定义渲染器中增加检测：

```typescript
// href 以 /api/files/ 开头 → 渲染 FileCard
if (hrefValue.startsWith('/api/files/')) {
  const filename = decodeURIComponent(hrefValue.split('/').pop() ?? '');
  return <FileCard filename={filename} href={hrefValue} />;
}
```

### i18n 新增键（chat 节）

```typescript
// zh.ts
runScriptRunning: '正在执行脚本...',
fileDownload: '下载',
fileOpen: '打开',
generatedFiles: '生成的文件',

// en.ts
runScriptRunning: 'Running script...',
fileDownload: 'Download',
fileOpen: 'Open',
generatedFiles: 'Generated files',
```

---

## 文件变更清单

### Phase 7a（后端）

| 文件                                                | 变更                |
| --------------------------------------------------- | ------------------- |
| `src/tide-lobster/src/tools/builtins/run_script.ts` | **新建**            |
| `src/tide-lobster/src/api/routes/files.ts`          | **新建**            |
| `src/tide-lobster/src/tools/index.ts`               | 注册 runScriptTool  |
| `src/tide-lobster/src/api/server.ts`                | 注册 filesRouter    |
| `src/tide-lobster/src/config.ts`                    | 新增 outputDir 配置 |

### Phase 7b（SKILL.md）

| 文件                   | 变更                          |
| ---------------------- | ----------------------------- |
| `SKILLS/pptx/SKILL.md` | 添加 Execution Environment 节 |
| `SKILLS/xlsx/SKILL.md` | 同上                          |
| `SKILLS/pdf/SKILL.md`  | 同上                          |
| `SKILLS/docx/SKILL.md` | 同上                          |

### Phase 7c（Tauri）

| 文件                                               | 变更                           |
| -------------------------------------------------- | ------------------------------ |
| `apps/desktop/`                                    | **新建目录**                   |
| `apps/desktop/src-tauri/src/main.rs`               | **新建**                       |
| `apps/desktop/src-tauri/src/lib.rs`                | **新建**                       |
| `apps/desktop/src-tauri/Cargo.toml`                | **新建**                       |
| `apps/desktop/src-tauri/tauri.conf.json`           | **新建**                       |
| `apps/desktop/src-tauri/capabilities/default.json` | **新建**                       |
| `apps/desktop/package.json`                        | **新建**                       |
| `apps/desktop/scripts/prepare-binaries.js`         | **新建**                       |
| 根目录 `package.json`                              | workspaces 添加 `apps/desktop` |

### Phase 7d（前端）

| 文件                                                   | 变更                        |
| ------------------------------------------------------ | --------------------------- |
| `apps/web-ui/src/utils/platform.ts`                    | **新建**                    |
| `apps/web-ui/src/components/FileCard/index.tsx`        | **新建**                    |
| `apps/web-ui/src/components/MarkdownContent/index.tsx` | a 标签增加 /api/files/ 检测 |
| `apps/web-ui/src/i18n/locales/zh.ts`                   | chat 节新增 4 个键          |
| `apps/web-ui/src/i18n/locales/en.ts`                   | 同步 zh.ts                  |

---

## 验证方案

### Web 模式端到端

1. 启动后端：`npm run dev`（src/tide-lobster/）
2. 发消息：「帮我创建一个关于 AI 趋势的 5 页 PPT」
3. 观察：LLM auto-routing → read_skill → run_script 工具调用
4. 确认：响应含 `/api/files/xxx.pptx` 链接，前端渲染 FileCard
5. 点击下载，验证文件可打开

### Tauri 开发模式

1. `cd apps/desktop && npm run dev`（Tauri dev server）
2. 同样发 PPT 生成消息
3. FileCard 显示「打开」按钮
4. 点击后系统 PowerPoint/Keynote 自动打开文件

### 安全测试

```bash
# 路径穿越测试（应返回 Error）
curl -X POST http://localhost:18900/api/chat \
  -d '{"message":"run_script with /etc/passwd.py"}'

# 文件路由安全测试（应 403）
curl http://localhost:18900/api/files/../../etc/passwd
```

### Python 未安装时

- 发送 Excel 生成请求
- 应看到友好错误：「未找到 Python，建议安装 uv：curl -LsSf https://astral.sh/uv/install.sh | sh」
- Tauri 模式：uv sidecar 已打包，无此问题

---

## 完成情况

- [x] Phase 7a：run_script 工具 + 文件路由
- [x] Phase 7b：SKILL.md 更新
- [x] Phase 7c：Tauri 桌面脚手架
- [x] Phase 7d：前端 FileCard + 双模式适配
