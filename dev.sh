#!/usr/bin/env bash
# dev.sh — 一键启动 / 打包开发服务
#
# 用法：
#   ./dev.sh            # 默认：web 模式（后端 + web-ui）
#   ./dev.sh web        # 后端 + web-ui
#   ./dev.sh desktop    # 后端 + Tauri 桌面端（Tauri 内部自动启动 web-ui）
#   ./dev.sh build      # 打包桌面端（构建后端 SEA → 准备 binaries → tauri build）

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODE="${1:-web}"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "❌  未找到 node 或 npm，请先安装 Node.js（建议 >= 20.20.0）"
  exit 1
fi

echo "✅  Node $(node -v)  |  npm $(npm -v)"

# ── 打包模式（顺序执行，无需并发） ───────────────────────────────────────────
if [ "$MODE" = "build" ]; then
  echo ""
  echo "📦  [1/3] 构建后端 SEA 二进制  (src/tide-lobster) ..."
  (cd "$REPO_ROOT/src/tide-lobster" && npm run build:sea)

  echo ""
  echo "📦  [2/3] 准备 Tauri sidecar binaries  (apps/desktop) ..."
  (cd "$REPO_ROOT/apps/desktop" && npm run prepare:binaries)

  echo ""
  echo "📦  [3/3] 打包桌面端  (apps/desktop) ..."
  (cd "$REPO_ROOT/apps/desktop" && npm run build)

  echo ""
  echo "✅  桌面端打包完成"
  exit 0
fi

# ── 清理函数（Ctrl-C 时杀掉子进程） ─────────────────────────────────────────
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

# ── 根据模式启动前端或桌面端 ─────────────────────────────────────────────────
if [ "$MODE" = "desktop" ]; then
  echo "🚀  启动桌面端  (apps/desktop — Tauri) ..."
  (cd "$REPO_ROOT/apps/desktop" && npm run dev) &
  PIDS+=($!)

  echo ""
  echo "🟢  服务已启动，按 Ctrl+C 退出"
  echo "     后端    →  http://127.0.0.1:18900"
  echo "     桌面端  →  Tauri 窗口（内部自动启动 web-ui http://localhost:5173）"
  echo ""
elif [ "$MODE" = "web" ]; then
  echo "🚀  启动前端  (apps/web-ui) ..."
  (cd "$REPO_ROOT/apps/web-ui" && npm run dev) &
  PIDS+=($!)

  echo ""
  echo "🟢  服务已启动，按 Ctrl+C 退出"
  echo "     前端  →  http://localhost:5173"
  echo "     后端  →  http://127.0.0.1:18900"
  echo ""
else
  echo "❌  未知模式：$MODE"
  echo "    可选：web | desktop | build"
  exit 1
fi

wait
