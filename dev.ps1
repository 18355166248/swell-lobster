# dev.ps1 — 一键启动 / 打包开发服务
# 需 PowerShell 5.1+（建议 PowerShell 7+）
#
# 用法：
#   .\dev.ps1              # 默认：web 模式（后端 + web-ui）
#   .\dev.ps1 web          # 后端 + web-ui
#   .\dev.ps1 desktop      # 后端 + Tauri 桌面端（Tauri 内部自动启动 web-ui）
#   .\dev.ps1 build        # 打包桌面端（构建后端 SEA → 准备 binaries → tauri build）

param(
  [ValidateSet('web', 'desktop', 'build')]
  [string]$Mode = 'web'
)

$ErrorActionPreference = 'Stop'

$RepoRoot = $PSScriptRoot
if (-not $RepoRoot) {
  $RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
}

function Test-CommandAvailable {
  param([string]$Name)
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Stop-DevProcessTree {
  param([System.Diagnostics.Process]$Proc)
  if (-not $Proc -or $Proc.HasExited) { return }
  $null = & taskkill.exe /PID $Proc.Id /T /F 2>$null
  if (-not $?) {
    Stop-Process -Id $Proc.Id -Force -ErrorAction SilentlyContinue
  }
}

# 检测端口是否被占用，若占用则强制终止对应进程
function Clear-Port {
  param([int]$Port)
  $conns = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
  if (-not $conns) { return }
  $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($procId in $pids) {
    Write-Host "  端口 $Port 被 PID $procId 占用，正在清理..." -ForegroundColor Yellow
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
  }
  # 最多等 3 秒确认端口释放
  for ($i = 0; $i -lt 6; $i++) {
    Start-Sleep -Milliseconds 500
    if (-not (Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue)) { break }
  }
}

if (-not (Test-CommandAvailable 'node') -or -not (Test-CommandAvailable 'npm')) {
  Write-Error '未找到 node 或 npm，请先安装 Node.js（建议 >= 20.20.0）。'
  exit 1
}

Write-Host "✅   Node $(node -v)  |  npm $(npm -v)" -ForegroundColor Green

$backendDir  = Join-Path $RepoRoot 'src\tide-lobster'
$frontendDir = Join-Path $RepoRoot 'apps\web-ui'
$desktopDir  = Join-Path $RepoRoot 'apps\desktop'

foreach ($d in @($backendDir, $frontendDir, $desktopDir)) {
  if (-not (Test-Path -LiteralPath $d)) {
    Write-Error "目录不存在：$d"
    exit 1
  }
}

# ── 打包模式（顺序执行） ──────────────────────────────────────────────────────
if ($Mode -eq 'build') {
  Write-Host ''
  Write-Host '📦  [1/3] 构建后端二进制  (src/tide-lobster) ...' -ForegroundColor Cyan
  Push-Location $backendDir
  try { npm run build:pkg } finally { Pop-Location }

  Write-Host ''
  Write-Host '📦  [2/3] 准备 Tauri sidecar binaries  (apps/desktop) ...' -ForegroundColor Cyan
  Push-Location $desktopDir
  try { npm run prepare:binaries } finally { Pop-Location }

  Write-Host ''
  Write-Host '📦  [3/3] 打包桌面端  (apps/desktop) ...' -ForegroundColor Cyan
  Push-Location $desktopDir
  try { npm run build } finally { Pop-Location }

  Write-Host ''
  Write-Host '✅   桌面端打包完成' -ForegroundColor Green
  exit 0
}

# ── 启动后端 ─────────────────────────────────────────────────────────────────
Write-Host '🔍   检查端口占用...' -ForegroundColor Cyan
Clear-Port -Port 18900
Write-Host '🚀   启动后端  (src/tide-lobster) ...' -ForegroundColor Cyan
$pBackend = Start-Process -FilePath 'cmd.exe' `
  -ArgumentList @('/c', 'npm run dev') `
  -WorkingDirectory $backendDir `
  -PassThru -NoNewWindow

$script:DevChildren = @($pBackend)

# ── 根据模式启动前端或桌面端 ─────────────────────────────────────────────────
if ($Mode -eq 'desktop') {
  Write-Host '🚀   启动桌面端  (apps/desktop — Tauri) ...' -ForegroundColor Cyan
  Clear-Port -Port 5173
  $pDesktop = Start-Process -FilePath 'cmd.exe' `
    -ArgumentList @('/c', 'npm run dev') `
    -WorkingDirectory $desktopDir `
    -PassThru -NoNewWindow
  $script:DevChildren += $pDesktop

  Write-Host ''
  Write-Host '🟢   服务已启动，按 Ctrl+C 退出' -ForegroundColor Green
  Write-Host '     后端    →  http://127.0.0.1:18900'
  Write-Host '     桌面端  →  Tauri 窗口（内部自动启动 web-ui http://localhost:5173）'
  Write-Host ''
} else {
  Write-Host '🚀   启动前端  (apps/web-ui) ...' -ForegroundColor Cyan
  Clear-Port -Port 5173
  $pFrontend = Start-Process -FilePath 'cmd.exe' `
    -ArgumentList @('/c', 'npm run dev') `
    -WorkingDirectory $frontendDir `
    -PassThru -NoNewWindow
  $script:DevChildren += $pFrontend

  Write-Host ''
  Write-Host '🟢   服务已启动，按 Ctrl+C 退出' -ForegroundColor Green
  Write-Host '     前端  →  http://localhost:5173'
  Write-Host '     后端  →  http://127.0.0.1:18900'
  Write-Host ''
}

function Stop-AllDev {
  Write-Host ''
  Write-Host '🛑   正在关闭服务...' -ForegroundColor Yellow
  foreach ($p in $script:DevChildren) {
    Stop-DevProcessTree -Proc $p
  }
  Write-Host '👋   已退出' -ForegroundColor Green
}

[Console]::TreatControlCAsInput = $false
$cancelHandler = [ConsoleCancelEventHandler] {
  param($sender, $e)
  Stop-AllDev
  $e.Cancel = $true
  [Environment]::Exit(0)
}
$cancelAdd = [Console].GetEvent('CancelKeyPress').GetAddMethod($true)
$null = $cancelAdd.Invoke($null, @($cancelHandler))

try {
  Wait-Process -InputObject $script:DevChildren
} finally {
  $cancelRemove = [Console].GetEvent('CancelKeyPress').GetRemoveMethod($true)
  $null = $cancelRemove.Invoke($null, @($cancelHandler))
  $stillRunning = $script:DevChildren | Where-Object { $_ -and -not $_.HasExited }
  if ($stillRunning) { Stop-AllDev }
}
