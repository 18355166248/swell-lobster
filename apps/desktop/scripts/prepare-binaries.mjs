/**
 * prepare-binaries.mjs
 *
 * 下载并放置桌面应用所需的外部二进制文件到 binaries/ 目录：
 *   - tide-lobster：Node.js SEA 打包的后端服务（各平台构建产物）
 *   - uv：Python 包管理器（从 GitHub Releases 下载）
 *
 * 运行：node scripts/prepare-binaries.mjs
 * 或：  npm run prepare:binaries
 *
 * Tauri 约定的文件名格式：{name}-{target-triple}[.exe]
 * 例如：
 *   binaries/tide-lobster-aarch64-apple-darwin
 *   binaries/tide-lobster-x86_64-pc-windows-msvc.exe
 *   binaries/uv-aarch64-apple-darwin
 */

import {
  createWriteStream,
  existsSync,
  mkdirSync,
  chmodSync,
  copyFileSync,
  mkdtempSync,
  rmSync,
  readdirSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { ProxyAgent, fetch as undiciFetch } from 'undici';

const __dirname = dirname(fileURLToPath(import.meta.url));
// 与 tauri.conf.json 中 externalBin（相对 src-tauri/）一致
const BINARIES_DIR = join(__dirname, '..', 'src-tauri', 'binaries');

// 代理：优先读环境变量，fallback 到本地 7897
const proxyUrl =
  process.env.HTTPS_PROXY ??
  process.env.https_proxy ??
  process.env.HTTP_PROXY ??
  process.env.http_proxy ??
  'http://127.0.0.1:7897';
const dispatcher = new ProxyAgent(proxyUrl);
console.log(`[prepare-binaries] Using proxy: ${proxyUrl}`);

mkdirSync(BINARIES_DIR, { recursive: true });

// ─────────────────────────────────────────────────────────────────────────────
// 平台 → Tauri target triple 映射
// ─────────────────────────────────────────────────────────────────────────────
const TARGET_MAP = {
  'darwin-arm64': 'aarch64-apple-darwin', // Apple Silicon Mac
  'darwin-x64': 'x86_64-apple-darwin', // Intel Mac
  'linux-x64': 'x86_64-unknown-linux-gnu', // Linux x64
  'linux-arm64': 'aarch64-unknown-linux-gnu', // Linux ARM64
  'win32-x64': 'x86_64-pc-windows-msvc',
}; // Windows x64

const platformKey = `${process.platform}-${process.arch}`;
const targetTriple = TARGET_MAP[platformKey];

if (!targetTriple) {
  console.error(`[prepare-binaries] Unsupported platform: ${platformKey}`);
  process.exit(1);
}

const isWindows = process.platform === 'win32';
const exeSuffix = isWindows ? '.exe' : '';

// ─────────────────────────────────────────────────────────────────────────────
// uv 下载（从 GitHub Releases）
// ─────────────────────────────────────────────────────────────────────────────
const UV_VERSION = '0.6.0';

const UV_ASSET_MAP = {
  'aarch64-apple-darwin': `uv-aarch64-apple-darwin.tar.gz`,
  'x86_64-apple-darwin': `uv-x86_64-apple-darwin.tar.gz`,
  'x86_64-unknown-linux-gnu': `uv-x86_64-unknown-linux-musl.tar.gz`,
  'aarch64-unknown-linux-gnu': `uv-aarch64-unknown-linux-musl.tar.gz`,
  'x86_64-pc-windows-msvc': `uv-x86_64-pc-windows-msvc.zip`,
};

const uvAsset = UV_ASSET_MAP[targetTriple];
const uvUrl = `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/${uvAsset}`;
const uvDest = join(BINARIES_DIR, `uv-${targetTriple}${exeSuffix}`);

// ─────────────────────────────────────────────────────────────────────────────
// tide-lobster SEA 构建说明
// ─────────────────────────────────────────────────────────────────────────────
// tide-lobster 需要先通过 @yao-pkg/pkg 打包（见 src/tide-lobster/scripts/build-pkg.mjs）
// 产物命名：tide-lobster-{target-triple}[.exe]
// 自动构建逻辑预留，目前仅检查文件是否存在。

const tidelobsterDest = join(BINARIES_DIR, `tide-lobster-${targetTriple}${exeSuffix}`);

console.log(`[prepare-binaries] Platform: ${platformKey} → ${targetTriple}`);
console.log(`[prepare-binaries] Binaries dir: ${BINARIES_DIR}`);

// ─────────────────────────────────────────────────────────────────────────────
// 下载辅助函数
// ─────────────────────────────────────────────────────────────────────────────
function download(url, destPath) {
  console.log(`[prepare-binaries] Downloading: ${url}`);
  return undiciFetch(url, { dispatcher }).then(async (res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const file = createWriteStream(destPath);
    await pipeline(res.body, file);
  });
}

function findFileRecursive(dir, targetName) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = findFileRecursive(fullPath, targetName);
      if (nested) return nested;
      continue;
    }
    if (entry.isFile() && entry.name === targetName) return fullPath;
  }
  return null;
}

function extractUvBinary(archivePath, destPath) {
  const tempDir = mkdtempSync(join(tmpdir(), 'swell-desktop-uv-'));
  try {
    if (archivePath.endsWith('.zip')) {
      const ps = spawnSync(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          `Expand-Archive -LiteralPath '${archivePath.replace(/'/g, "''")}' -DestinationPath '${tempDir.replace(/'/g, "''")}' -Force`,
        ],
        { stdio: 'pipe' }
      );
      if (ps.status !== 0) {
        throw new Error(ps.stderr.toString().trim() || 'failed to extract zip archive');
      }
    } else {
      const tar = spawnSync('tar', ['-xzf', archivePath, '-C', tempDir], { stdio: 'pipe' });
      if (tar.status !== 0) {
        throw new Error(tar.stderr.toString().trim() || 'failed to extract tar archive');
      }
    }

    const binaryName = `uv${exeSuffix}`;
    const extracted = findFileRecursive(tempDir, binaryName);
    if (!extracted) {
      throw new Error(`cannot find ${binaryName} in extracted archive`);
    }

    copyFileSync(extracted, destPath);
    if (!isWindows) chmodSync(destPath, 0o755);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 主流程
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  // 1. 下载 uv（如果不存在）
  if (existsSync(uvDest)) {
    console.log(`[prepare-binaries] uv already exists: ${uvDest}`);
  } else {
    const tmpArchive = uvDest + (uvAsset.endsWith('.zip') ? '.zip' : '.tar.gz');
    await download(uvUrl, tmpArchive);
    console.log(`[prepare-binaries] uv archive downloaded: ${tmpArchive}`);
    extractUvBinary(tmpArchive, uvDest);
    console.log(`[prepare-binaries] uv extracted: ${uvDest}`);
  }

  // 2. 检查 tide-lobster SEA 产物
  if (existsSync(tidelobsterDest)) {
    console.log(`[prepare-binaries] tide-lobster binary found: ${tidelobsterDest}`);
    if (!isWindows) chmodSync(tidelobsterDest, 0o755);
  } else {
    console.warn(
      `[prepare-binaries] tide-lobster binary not found: ${tidelobsterDest}\n` +
        `  Build it first: cd src/tide-lobster && npm run build:pkg`
    );
  }
}

main().catch((e) => {
  console.error('[prepare-binaries] Error:', e.message);
  process.exit(1);
});
