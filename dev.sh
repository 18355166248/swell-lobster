#!/usr/bin/env bash
# dev.sh — 一键启动前后端开发服务（Node 版本由 fnm/nvm/系统自行管理）

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "❌  未找到 node 或 npm，请先安装 Node.js（建议 >= 20.20.0）"
  exit 1
fi

echo "✅  Node $(node -v)  |  npm $(npm -v)"

# ── 清理函数（Ctrl-C 时杀掉子进程） ───────────────────────────────────────────
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

# ── 启动后端 ─────────────────────────────────────────────────────────────────
echo "🚀  启动后端  (src/tide-lobster) ..."
(cd "$REPO_ROOT/src/tide-lobster" && npm run dev) &
PIDS+=($!)

# ── 启动前端 ─────────────────────────────────────────────────────────────────
echo "🚀  启动前端  (apps/web-ui) ..."
(cd "$REPO_ROOT/apps/web-ui" && npm run dev) &
PIDS+=($!)

# ── 等待子进程 ───────────────────────────────────────────────────────────────
echo ""
echo "🟢  服务已启动，按 Ctrl+C 退出"
echo "     前端  →  http://localhost:5173"
echo "     后端  →  http://127.0.0.1:18900"
echo ""
wait
