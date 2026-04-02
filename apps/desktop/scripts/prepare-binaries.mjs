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

import { createWriteStream, existsSync, mkdirSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import https from 'node:https';

const __dirname = dirname(fileURLToPath(import.meta.url));
// 与 tauri.conf.json 中 externalBin（相对 src-tauri/）一致
const BINARIES_DIR = join(__dirname, '..', 'src-tauri', 'binaries');

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
// tide-lobster 需要先通过 Node.js SEA 打包（见 src/tide-lobster/scripts/build-sea.mjs）
// 产物命名：tide-lobster-{target-triple}[.exe]
// 自动构建逻辑预留，目前仅检查文件是否存在。

const tidelobsterDest = join(BINARIES_DIR, `tide-lobster-${targetTriple}${exeSuffix}`);

console.log(`[prepare-binaries] Platform: ${platformKey} → ${targetTriple}`);
console.log(`[prepare-binaries] Binaries dir: ${BINARIES_DIR}`);

// ─────────────────────────────────────────────────────────────────────────────
// 下载辅助函数
// ─────────────────────────────────────────────────────────────────────────────
function download(url, destPath) {
  return new Promise((resolve, reject) => {
    console.log(`[prepare-binaries] Downloading: ${url}`);
    https.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        return download(res.headers.location, destPath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const file = createWriteStream(destPath);
      pipeline(res, file).then(resolve).catch(reject);
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 主流程
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  // 1. 下载 uv（如果不存在）
  if (existsSync(uvDest)) {
    console.log(`[prepare-binaries] uv already exists: ${uvDest}`);
  } else {
    // 下载压缩包到临时文件，解压后提取 uv 二进制
    // 此处为简化示例，直接下载预编译 tarball 并使用 tar/unzip 解压
    // 生产中可使用 node-tar 或 yauzl npm 包
    const tmpArchive = uvDest + (uvAsset.endsWith('.zip') ? '.zip' : '.tar.gz');
    await download(uvUrl, tmpArchive);
    console.log(`[prepare-binaries] uv archive downloaded: ${tmpArchive}`);
    console.log(`[prepare-binaries] TODO: extract uv binary from ${tmpArchive} to ${uvDest}`);
    // 解压逻辑留给 CI 或构建脚本补全
    // 参考：tar -xzf uv-*.tar.gz --strip-components=1 uv/uv -C binaries/
  }

  // 2. 检查 tide-lobster SEA 产物
  if (existsSync(tidelobsterDest)) {
    console.log(`[prepare-binaries] tide-lobster binary found: ${tidelobsterDest}`);
    if (!isWindows) chmodSync(tidelobsterDest, 0o755);
  } else {
    console.warn(
      `[prepare-binaries] tide-lobster binary not found: ${tidelobsterDest}\n` +
        `  Build it first: cd src/tide-lobster && npm run build:sea`
    );
  }
}

main().catch((e) => {
  console.error('[prepare-binaries] Error:', e.message);
  process.exit(1);
});
