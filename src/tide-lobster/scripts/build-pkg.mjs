/**
 * build-pkg.mjs — @yao-pkg/pkg 打包脚本
 *
 * 将 tide-lobster 打包为单个可执行文件，用作 Tauri desktop sidecar。
 *
 * 流水线：
 *   1. esbuild：TypeScript → 单文件 CJS bundle（dist/bundle.cjs）
 *   2. @yao-pkg/pkg：CJS bundle → 独立二进制（内嵌 Node.js 运行时 + better-sqlite3 native addon）
 *
 * 输出：../../apps/desktop/src-tauri/binaries/tide-lobster-{target-triple}[.exe]
 *
 * 参考：https://tauri.app/learn/sidecar-nodejs/
 */

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MONO_ROOT = join(__dirname, '..', '..', '..');
const BINARIES_DIR = join(MONO_ROOT, 'apps', 'desktop', 'src-tauri', 'binaries');

const PKG_BIN = join(
  MONO_ROOT,
  'node_modules',
  '.bin',
  `pkg${process.platform === 'win32' ? '.cmd' : ''}`
);

// 平台 → Tauri target triple
const TARGET_MAP = {
  'darwin-arm64': 'aarch64-apple-darwin',
  'darwin-x64': 'x86_64-apple-darwin',
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'linux-arm64': 'aarch64-unknown-linux-gnu',
  'win32-x64': 'x86_64-pc-windows-msvc',
};

// 平台 → @yao-pkg/pkg target
const PKG_TARGET_MAP = {
  'darwin-arm64': 'node20-mac-arm64',
  'darwin-x64': 'node20-mac-x64',
  'linux-x64': 'node20-linux-x64',
  'linux-arm64': 'node20-linux-arm64',
  'win32-x64': 'node20-win-x64',
};

const platformKey = `${process.platform}-${process.arch}`;
const targetTriple = TARGET_MAP[platformKey];
const pkgTarget = PKG_TARGET_MAP[platformKey];

if (!targetTriple) {
  console.error(`[build-pkg] Unsupported platform: ${platformKey}`);
  process.exit(1);
}

const ext = process.platform === 'win32' ? '.exe' : '';
const outPath = join(BINARIES_DIR, `tide-lobster-${targetTriple}${ext}`);

mkdirSync(BINARIES_DIR, { recursive: true });

// ─── Step 1: esbuild → CJS bundle ────────────────────────────────────────────
// CJS 格式彻底规避 ESM/CJS 互操作问题；
// nativeModulePlugin 将 bindings/node-gyp-build 替换为 dlopen shim，
// better-sqlite3 完全内联到 bundle 中，不再依赖 pkg.assets 内嵌 .node。

/** node:sqlite 是 Node.js v22.5+ 内置模块，pkg 的 node20 target 不认识它，
 *  会把它当文件路径处理导致打包失败。
 *  @modelcontextprotocol/sdk 引入了该模块但在本项目的执行路径里不会用到，
 *  stub 成空模块即可。 */
const nodeSqliteStubPlugin = {
  name: 'node-sqlite-stub',
  setup(build) {
    build.onResolve({ filter: /^node:sqlite$/ }, () => ({
      path: 'node-sqlite-stub',
      namespace: 'stub',
    }));
    build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: `module.exports = {};`,
      loader: 'js',
    }));
  },
};

/** better-sqlite3 用 bindings / node-gyp-build 定位 .node 文件，
 *  在 pkg snapshot 中这些路径不存在。
 *  替换为从 BETTER_SQLITE3_BINDING 环境变量读取路径，用 process.dlopen 直接加载。 */
const nativeModulePlugin = {
  name: 'native-module',
  setup(build) {
    build.onResolve({ filter: /^(bindings|node-gyp-build)$/ }, (args) => ({
      path: args.path,
      namespace: 'native-stub',
    }));
    build.onLoad({ filter: /.*/, namespace: 'native-stub' }, () => ({
      contents: `
module.exports = function() {
  var p = process.env.BETTER_SQLITE3_BINDING;
  if (!p) throw new Error('BETTER_SQLITE3_BINDING env not set');
  var m = { exports: {} };
  process.dlopen(m, p);
  return m.exports;
};`,
      loader: 'js',
    }));
  },
};

console.log('[build-pkg] Bundling with esbuild...');
await esbuild({
  entryPoints: [join(ROOT, 'src', 'index.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: join(ROOT, 'dist', 'bundle.cjs'),
  plugins: [nativeModulePlugin, nodeSqliteStubPlugin],
  tsconfig: join(ROOT, 'tsconfig.json'),
  logLevel: 'warning',
});
console.log('[build-pkg] esbuild bundle complete → dist/bundle.cjs');

// 复制 better_sqlite3.node 到 binaries/ 供 Tauri 打包为 resource
const prebuildsNode = join(
  MONO_ROOT, 'node_modules', 'better-sqlite3', 'prebuilds',
  `${process.platform}-${process.arch}`, 'node.napi.node'
);
const buildNode = join(
  MONO_ROOT, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node'
);
const nodeFile = existsSync(prebuildsNode) ? prebuildsNode
  : existsSync(buildNode) ? buildNode
  : null;
if (!nodeFile) {
  console.error('[build-pkg] better_sqlite3.node not found. Run: npm install in tide-lobster');
  process.exit(1);
}
copyFileSync(nodeFile, join(BINARIES_DIR, 'better_sqlite3.node'));
console.log(`[build-pkg] Copied better_sqlite3.node → binaries/`);

// ─── Step 2: pkg → standalone binary ─────────────────────────────────────────
// pkg 从 dist/bundle.cjs 向上查找 package.json，读取 pkg.assets 配置，
// 自动内嵌 better-sqlite3 的 .node 文件；运行时解压到 temp 目录透明加载。
if (!existsSync(PKG_BIN)) {
  console.error(`[build-pkg] pkg not found at ${PKG_BIN}. Run: npm install`);
  process.exit(1);
}

console.log(`[build-pkg] Packaging with @yao-pkg/pkg → ${outPath}`);

// pkg 下载 Node.js base binary 时需要走代理
const proxyUrl =
  process.env.HTTPS_PROXY ??
  process.env.https_proxy ??
  process.env.HTTP_PROXY ??
  process.env.http_proxy ??
  'http://127.0.0.1:7897';

execFileSync(
  PKG_BIN,
  [
    join(ROOT, 'dist', 'bundle.cjs'),
    '--targets',
    pkgTarget,
    '--output',
    outPath,
  ],
  {
    stdio: 'inherit',
    cwd: ROOT,
    shell: process.platform === 'win32',
    env: { ...process.env, HTTPS_PROXY: proxyUrl, HTTP_PROXY: proxyUrl },
  }
);

console.log(`[build-pkg] ✓ Sidecar ready: ${outPath}`);
