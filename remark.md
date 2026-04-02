# 参考项目

/Users/xmly/Swell/other-code/LobsterAI
/Users/xmly/Swell/other-code/openclaw

# Tauri 打包测试

现在按顺序测试：

Step 1：重新构建，把二进制输出到正确位置
npm run build:sea -w tide-lobster

Step 2：准备 Tauri 所需二进制（会检查 uv 和 tide-lobster 是否存在）
npm run prepare:binaries -w swell-lobster-desktop

Step 3：Tauri 打包
npm run build -w swell-lobster-desktop

或直接用脚本一步完成（Step 2+3）：
./dev.sh build

---

验证打包结果：

# 找到 .app 位置（macOS）

ls apps/desktop/src-tauri/target/release/bundle/macos/

# 运行 .app，确认 tide-lobster 自动启动

open "apps/desktop/src-tauri/target/release/bundle/macos/SwellLobster.app"

# 另开终端检查后端是否启动

lsof -i :18900
curl http://127.0.0.1:18900/api/health

如果 prepare:binaries 报 uv 相关警告可以先忽略，tide-lobster 是核心，uv 是可选依赖

核心功能（聊天/MCP/Memory/IM）

Windows 完全适配，SEA 打包脚本已覆盖 Windows 目标：

'win32-x64': { triple: 'x86_64-pc-windows-msvc' }

SEA 会把 Node.js 运行时一起打包进去，Windows 用户不需要装 Node。

Python 脚本（run_script 工具）

默认不内置 Python，当前检测顺序：
SWELL_PYTHON_BIN → python3 → python → uv run → 报错提示

如果 Windows 用户没装 Python，就跑不了 .py 脚本。

---

要内置 Python 的话

uv 自带 Python 运行时，uv run script.py 会自动下载 Python，是最干净的方案。要实现需要三步：

Step 1：补全 prepare-binaries.mjs 的解压逻辑

Windows 下载 .zip，macOS/Linux 下载 .tar.gz：

// Windows (zip)
execSync(`unzip -o "${tmpArchive}" "uv.exe" -d "${BINARIES_DIR}"`, ...);
fs.renameSync(join(BINARIES_DIR, 'uv.exe'), uvDest);

// macOS/Linux (tar.gz)
execSync(`tar -xzf "${tmpArchive}" --strip-components=1 -C "${BINARIES_DIR}"`, ...);
fs.renameSync(join(BINARIES_DIR, 'uv'), uvDest);

Step 2：tauri.conf.json 把 uv 加回去
"externalBin": ["binaries/tide-lobster", "binaries/uv"]

Step 3：lib.rs 启动 tide-lobster 时注入 uv 路径

.env("SWELL_UV_BIN", resource_dir.join("binaries").join("uv"))

然后 run_script.ts 读 process.env.SWELL_UV_BIN 优先用内置 uv。

---

# 当前项目windows安装的话适配么 windows 没有py 会内置么

核心功能（聊天/MCP/Memory/IM）

Windows 完全适配，SEA 打包脚本已覆盖 Windows 目标：

'win32-x64': { triple: 'x86_64-pc-windows-msvc' }

SEA 会把 Node.js 运行时一起打包进去，Windows 用户不需要装 Node。

Python 脚本（run_script 工具）

默认不内置 Python，当前检测顺序：
SWELL_PYTHON_BIN → python3 → python → uv run → 报错提示

如果 Windows 用户没装 Python，就跑不了 .py 脚本。

---

要内置 Python 的话

uv 自带 Python 运行时，uv run script.py 会自动下载 Python，是最干净的方案。要实现需要三步：

Step 1：补全 prepare-binaries.mjs 的解压逻辑

Windows 下载 .zip，macOS/Linux 下载 .tar.gz：

// Windows (zip)
execSync(`unzip -o "${tmpArchive}" "uv.exe" -d "${BINARIES_DIR}"`, ...);
fs.renameSync(join(BINARIES_DIR, 'uv.exe'), uvDest);

// macOS/Linux (tar.gz)
execSync(`tar -xzf "${tmpArchive}" --strip-components=1 -C "${BINARIES_DIR}"`, ...);
fs.renameSync(join(BINARIES_DIR, 'uv'), uvDest);

Step 2：tauri.conf.json 把 uv 加回去
"externalBin": ["binaries/tide-lobster", "binaries/uv"]

Step 3：lib.rs 启动 tide-lobster 时注入 uv 路径

.env("SWELL_UV_BIN", resource_dir.join("binaries").join("uv"))

然后 run_script.ts 读 process.env.SWELL_UV_BIN 优先用内置 uv。

---
