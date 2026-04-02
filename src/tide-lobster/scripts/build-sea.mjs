/**
 * build-sea.mjs — Node.js Single Executable Application (SEA) 打包脚本
 *
 * 将 tide-lobster 打包为单个可执行文件，用作 Tauri desktop sidecar。
 *
 * 前置条件：
 *   - Node.js >= 20（SEA 从 v20 开始稳定支持）
 *   - 先运行 npm run build（tsc → dist/index.js）
 *
 * 输出：../../apps/desktop/src-tauri/binaries/tide-lobster-{target-triple}[.exe]
 *
 * 参考文档：https://nodejs.org/api/single-executable-applications.html
 */

import { execFileSync, execSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BINARIES_DIR = join(__dirname, '..', '..', '..', 'apps', 'desktop', 'src-tauri', 'binaries');
const POSTJECT_BIN = join(
  __dirname,
  '..',
  '..',
  '..',
  'node_modules',
  '.bin',
  `postject${process.platform === 'win32' ? '.cmd' : ''}`
);

const nodeMajor = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);
if (Number.isNaN(nodeMajor) || nodeMajor < 20) {
  console.error(`[build-sea] Node.js >= 20 is required, current: ${process.versions.node}`);
  process.exit(1);
}

const TARGET_MAP = {
  'darwin-arm64': 'aarch64-apple-darwin',
  'darwin-x64': 'x86_64-apple-darwin',
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'linux-arm64': 'aarch64-unknown-linux-gnu',
  'win32-x64': 'x86_64-pc-windows-msvc',
};

const platformKey = `${process.platform}-${process.arch}`;
const targetTriple = TARGET_MAP[platformKey];
if (!targetTriple) {
  console.error(`Unsupported platform: ${platformKey}`);
  process.exit(1);
}

const isWindows = process.platform === 'win32';
const outName = `tide-lobster-${targetTriple}${isWindows ? '.exe' : ''}`;
const outPath = join(BINARIES_DIR, outName);

mkdirSync(BINARIES_DIR, { recursive: true });

const distEntry = join(ROOT, 'dist', 'index.js');
if (!existsSync(distEntry)) {
  console.error(`dist/index.js not found. Run "npm run build" first.`);
  process.exit(1);
}

// 1. 生成 SEA 配置文件
const seaConfig = {
  main: distEntry,
  /** 与 package.json `"type": "module"` + tsc 输出一致；默认 commonjs 会导致 import 报 SyntaxError */
  mainFormat: 'module',
  output: join(ROOT, 'dist', 'sea-prep.blob'),
  disableExperimentalSEAWarning: true,
  useSnapshot: false,
  // ESM 入口在部分 Node 版本上开启 code cache 时仍会按 CJS 解析主脚本 → import 报 SyntaxError；
  // 且 code cache 与跨平台分发不兼容，见 https://github.com/nodejs/node/issues/52420
  useCodeCache: false,
};
const seaConfigPath = join(ROOT, 'dist', 'sea-config.json');
writeFileSync(seaConfigPath, JSON.stringify(seaConfig, null, 2));
console.log('[build-sea] sea-config.json written');

// 2. 生成 blob
execFileSync(process.execPath, ['--experimental-sea-config', seaConfigPath], {
  stdio: 'inherit',
  cwd: ROOT,
});
console.log('[build-sea] SEA blob generated');

// 3. 复制 node 可执行文件作为基础
const nodeBin = process.execPath;
copyFileSync(nodeBin, outPath);
console.log(`[build-sea] Copied node binary → ${outPath}`);

// 4. 移除代码签名（macOS）
if (process.platform === 'darwin') {
  execSync(`codesign --remove-signature "${outPath}"`, { stdio: 'inherit' });
}

// 5. 注入 blob
const blobPath = join(ROOT, 'dist', 'sea-prep.blob');
if (!existsSync(POSTJECT_BIN)) {
  console.error(
    `[build-sea] postject not found at ${POSTJECT_BIN}.\n` +
      'Install dependencies first, then rerun: npm install'
  );
  process.exit(1);
}

const postjectArgs = [
  outPath,
  'NODE_SEA_BLOB',
  blobPath,
  '--sentinel-fuse',
  'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
];
if (process.platform === 'darwin') {
  postjectArgs.push('--macho-segment-name', 'NODE_SEA');
}
execFileSync(POSTJECT_BIN, postjectArgs, { stdio: 'inherit', cwd: ROOT, shell: true });
console.log('[build-sea] Blob injected');

// 6. 重新签名（macOS）
if (process.platform === 'darwin') {
  execSync(`codesign --sign - "${outPath}"`, { stdio: 'inherit' });
}

console.log(`[build-sea] ✓ Sidecar ready: ${outPath}`);
