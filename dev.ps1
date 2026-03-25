# dev.ps1 — 一键切换 Node 版本并启动前后端开发服务（Windows）
# 行为对齐仓库根目录的 dev.sh；需 PowerShell 5.1+（建议 PowerShell 7+）

$ErrorActionPreference = 'Stop'

$RepoRoot = $PSScriptRoot
if (-not $RepoRoot) {
  $RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
}

$nvmrcPath = Join-Path $RepoRoot '.nvmrc'
if (-not (Test-Path -LiteralPath $nvmrcPath)) {
  Write-Error "未找到 .nvmrc：$nvmrcPath"
  exit 1
}

$NvmVersion = (Get-Content -LiteralPath $nvmrcPath -Raw).Trim()

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

# ── 1. 切换 Node 版本（nvm-windows → fnm → 仅校验） ─────────────────────────
if ($env:DEV_SKIP_NVM -eq '1') {
  Write-Host '⏭️   已设置 DEV_SKIP_NVM=1，跳过 nvm/fnm。' -ForegroundColor DarkYellow
} else {
  $switched = $false

  if (Test-CommandAvailable 'nvm') {
    Write-Host "⚙️   切换 Node.js → v$NvmVersion （nvm-windows）..." -ForegroundColor Cyan
    & nvm use $NvmVersion
    if ($LASTEXITCODE -ne 0) {
      Write-Host "📦   v$NvmVersion 未安装或切换失败，尝试 nvm install..." -ForegroundColor Yellow
      & nvm install $NvmVersion
      if ($LASTEXITCODE -ne 0) {
        Write-Error "nvm install $NvmVersion 失败，请检查 nvm-windows 是否已正确安装。"
        exit 1
      }
      & nvm use $NvmVersion
      if ($LASTEXITCODE -ne 0) {
        Write-Error "nvm use $NvmVersion 失败。"
        exit 1
      }
    }
    $switched = $true
  } elseif (Test-CommandAvailable 'fnm') {
    Write-Host "⚙️   使用 fnm 按 .nvmrc 切换 Node..." -ForegroundColor Cyan
    Push-Location $RepoRoot
    try {
      fnm use
      if ($LASTEXITCODE -ne 0) {
        Write-Error 'fnm use 失败，请先在仓库根目录安装对应 Node 版本。'
        exit 1
      }
    } finally {
      Pop-Location
    }
    $switched = $true
  }

  if (-not $switched) {
    Write-Host '⚠️   未检测到 nvm-windows（nvm）或 fnm，将使用当前 PATH 中的 node。' -ForegroundColor Yellow
    Write-Host '    建议安装其一，或设置 DEV_SKIP_NVM=1 并自行保证 Node >= 20.20.0。' -ForegroundColor DarkYellow
  }
}

if (-not (Test-CommandAvailable 'node') -or -not (Test-CommandAvailable 'npm')) {
  Write-Error '未找到 node 或 npm，请先安装 Node.js。'
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

# ── 2. 启动后端 / 前端（同一控制台，Ctrl+C 时尽量结束子进程树） ─────────────
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
