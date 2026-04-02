/**
 * Tauri 在编译期要求 externalBin 对应文件存在。
 * 开发模式下 lib.rs 不启动 sidecar（假定本机已 `npm run dev` 跑 tide-lobster），
 * 若尚未构建 SEA 产物，用系统占位可执行文件占位以便 `tauri dev` 能通过编译。
 * 若目标文件已存在则跳过，不会覆盖正式构建产物。
 */
import { copyFileSync, existsSync, mkdirSync, chmodSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN = join(__dirname, '..', 'src-tauri', 'binaries');

const TARGET_MAP = {
  'darwin-arm64': 'aarch64-apple-darwin',
  'darwin-x64': 'x86_64-apple-darwin',
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'linux-arm64': 'aarch64-unknown-linux-gnu',
  'win32-x64': 'x86_64-pc-windows-msvc',
};

const platformKey = `${process.platform}-${process.arch}`;
const triple = TARGET_MAP[platformKey];
if (!triple) {
  console.error(`[ensure-dev-sidecar-stubs] Unsupported platform: ${platformKey}`);
  process.exit(1);
}

const isWin = process.platform === 'win32';
const exe = isWin ? '.exe' : '';

/** @type {string | undefined} */
let stubSource;
if (isWin) {
  stubSource = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe');
} else {
  for (const p of ['/bin/true', '/usr/bin/true']) {
    if (existsSync(p)) {
      stubSource = p;
      break;
    }
  }
}

mkdirSync(BIN, { recursive: true });
for (const name of ['tide-lobster', 'uv']) {
  const dest = join(BIN, `${name}-${triple}${exe}`);
  if (existsSync(dest)) continue;

  if (stubSource && existsSync(stubSource)) {
    copyFileSync(stubSource, dest);
    if (!isWin) chmodSync(dest, 0o755);
    console.log(`[ensure-dev-sidecar-stubs] Created stub: ${dest}`);
    continue;
  }

  if (isWin) {
    console.error('[ensure-dev-sidecar-stubs] 找不到 cmd.exe，无法创建占位文件。');
    process.exit(1);
  }

  // 无 /bin/true 时（如受限环境）：写入最小 shell 脚本，满足「文件存在」；release 打包前须换成真实二进制
  writeFileSync(dest, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  chmodSync(dest, 0o755);
  console.log(`[ensure-dev-sidecar-stubs] Created shell stub: ${dest}`);
}
