# dev.ps1 — 一键启动前后端开发服务（Node 版本由 fnm/nvm/系统自行管理）
# 需 PowerShell 5.1+（建议 PowerShell 7+）

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
  if (-not $Proc -or $Proc.HasExited) {
    return
  }
  $targetPid = $Proc.Id
  # 结束 npm/node 子进程树（与 bash 里 kill 子进程意图一致）
  $null = & taskkill.exe /PID $targetPid /T /F 2>$null
  if (-not $?) {
    Stop-Process -Id $targetPid -Force -ErrorAction SilentlyContinue
  }
}

if (-not (Test-CommandAvailable 'node') -or -not (Test-CommandAvailable 'npm')) {
  Write-Error '未找到 node 或 npm，请先安装 Node.js（建议 >= 20.20.0）。'
  exit 1
}

Write-Host "✅   Node $(node -v)  |  npm $(npm -v)" -ForegroundColor Green

$backendDir = Join-Path $RepoRoot 'src\tide-lobster'
$frontendDir = Join-Path $RepoRoot 'apps\web-ui'
foreach ($d in @($backendDir, $frontendDir)) {
  if (-not (Test-Path -LiteralPath $d)) {
    Write-Error "目录不存在：$d"
    exit 1
  }
}

# ── 启动后端 / 前端（同一控制台，Ctrl+C 时尽量结束子进程树） ─────────────
Write-Host '🚀   启动后端  (src/tide-lobster) ...' -ForegroundColor Cyan
$pBackend = Start-Process -FilePath 'cmd.exe' `
  -ArgumentList @('/c', 'npm run dev') `
  -WorkingDirectory $backendDir `
  -PassThru `
  -NoNewWindow

Write-Host '🚀   启动前端  (apps/web-ui) ...' -ForegroundColor Cyan
$pFrontend = Start-Process -FilePath 'cmd.exe' `
  -ArgumentList @('/c', 'npm run dev') `
  -WorkingDirectory $frontendDir `
  -PassThru `
  -NoNewWindow

Write-Host ''
Write-Host '🟢   服务已启动，按 Ctrl+C 退出' -ForegroundColor Green
Write-Host '     前端  →  http://localhost:5173'
Write-Host '     后端  →  http://127.0.0.1:18900'
Write-Host ''

$script:DevChildren = @($pBackend, $pFrontend)

function Stop-AllDev {
  Write-Host ''
  Write-Host '🛑   正在关闭服务...' -ForegroundColor Yellow
  foreach ($p in $script:DevChildren) {
    Stop-DevProcessTree -Proc $p
  }
  Write-Host '👋   已退出' -ForegroundColor Green
}

# Console Ctrl+C（PowerShell 中需通过反射挂接 CancelKeyPress）
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
  if ($stillRunning) {
    Stop-AllDev
  }
}
