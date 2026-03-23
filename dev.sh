#!/usr/bin/env bash
# dev.sh — 一键切换 Node 版本并启动前后端开发服务

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NVM_VERSION="$(cat "$REPO_ROOT/.nvmrc" | tr -d '[:space:]')"

# ── 1. 加载 nvm ──────────────────────────────────────────────────────────────
if [ -z "${NVM_DIR:-}" ]; then
  export NVM_DIR="$HOME/.nvm"
fi

if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck source=/dev/null
  source "$NVM_DIR/nvm.sh"
else
  echo "❌  未找到 nvm，请先安装：https://github.com/nvm-sh/nvm"
  exit 1
fi

# ── 2. 切换 Node 版本 ─────────────────────────────────────────────────────────
echo "⚙️   切换 Node.js → v${NVM_VERSION} ..."
nvm use "$NVM_VERSION" || {
  echo "📦  v${NVM_VERSION} 未安装，正在安装..."
  nvm install "$NVM_VERSION"
  nvm use "$NVM_VERSION"
}

echo "✅  Node $(node -v)  |  npm $(npm -v)"

# ── 3. 清理函数（Ctrl-C 时杀掉子进程） ──────────────────────────────────────
PIDS=()
cleanup() {
  echo ""
  echo "🛑  正在关闭服务..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  echo "👋  已退出"
}
trap cleanup INT TERM

# ── 4. 启动后端 ───────────────────────────────────────────────────────────────
echo "🚀  启动后端  (src/tide-lobster) ..."
(cd "$REPO_ROOT/src/tide-lobster" && npm run dev) &
PIDS+=($!)

# ── 5. 启动前端 ───────────────────────────────────────────────────────────────
echo "🚀  启动前端  (apps/web-ui) ..."
(cd "$REPO_ROOT/apps/web-ui" && npm run dev) &
PIDS+=($!)

# ── 6. 等待子进程 ─────────────────────────────────────────────────────────────
echo ""
echo "🟢  服务已启动，按 Ctrl+C 退出"
echo "     前端  →  http://localhost:5173"
echo "     后端  →  http://127.0.0.1:18900"
echo ""
wait
