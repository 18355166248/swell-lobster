import { existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const tauriConfigPath = join(root, 'src-tauri', 'tauri.conf.json');
const capabilityPath = join(root, 'src-tauri', 'capabilities', 'default.json');
const binariesDir = join(root, 'src-tauri', 'binaries');

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
  console.error(`[check-sidecar-layout] Unsupported platform: ${platformKey}`);
  process.exit(1);
}

const exe = process.platform === 'win32' ? '.exe' : '';
const expectedFiles = [
  `tide-lobster-${targetTriple}${exe}`,
  `uv-${targetTriple}${exe}`,
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function loadJson(path) {
  const fs = await import('node:fs/promises');
  return JSON.parse(await fs.readFile(path, 'utf-8'));
}

async function main() {
  const tauriConfig = await loadJson(tauriConfigPath);
  const capability = await loadJson(capabilityPath);

  const externalBin = tauriConfig?.bundle?.externalBin ?? [];
  assert(
    Array.isArray(externalBin) &&
      externalBin.includes('binaries/tide-lobster') &&
      externalBin.includes('binaries/uv'),
    'tauri.conf.json 的 bundle.externalBin 必须包含 binaries/tide-lobster 和 binaries/uv'
  );

  const shellPermissions = capability?.permissions?.filter(
    (item) => item && typeof item === 'object' && item.identifier === 'shell:allow-execute'
  );
  const sidecarNames = new Set(
    shellPermissions.flatMap((item) => item.allow?.map((entry) => entry.name).filter(Boolean) ?? [])
  );
  assert(
    sidecarNames.has('binaries/tide-lobster') && sidecarNames.has('binaries/uv'),
    'desktop capability 必须允许 binaries/tide-lobster 和 binaries/uv 执行'
  );

  for (const file of expectedFiles) {
    const filePath = join(binariesDir, file);
    assert(existsSync(filePath), `缺少 sidecar 文件：${filePath}`);
    const stats = statSync(filePath);
    assert(stats.isFile(), `sidecar 不是普通文件：${filePath}`);
    assert(stats.size > 0, `sidecar 文件为空：${filePath}`);
  }

  console.log(`[check-sidecar-layout] OK for ${platformKey} (${targetTriple})`);
}

void main().catch((error) => {
  console.error(
    `[check-sidecar-layout] ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
});
