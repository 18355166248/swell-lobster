/**
 * 应用配置
 *
 * 配置与 SWELL_* 环境变量约定（原 Python/Pydantic 参考已移除）。
 *
 * 加载顺序：process.env > .env 文件 > 计算默认值
 */

import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { config as loadDotenv } from 'dotenv';

function findRepoRoot(): string {
  const envRoot = process.env.SWELL_PROJECT_ROOT ?? process.env.PROJECT_ROOT;
  if (envRoot) return resolve(envRoot);

  const candidates = [process.cwd(), dirname(process.execPath)];
  for (const start of candidates) {
    let current = resolve(start);
    for (let depth = 0; depth < 8; depth += 1) {
      if (
        existsSync(resolve(current, 'identity')) &&
        existsSync(resolve(current, 'src', 'tide-lobster'))
      ) {
        return current;
      }

      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }

  return resolve(process.cwd());
}

const REPO_ROOT = findRepoRoot();

// 先加载仓库根 .env（与 Python 的 env_file=".env" 一致）
loadDotenv({ path: resolve(REPO_ROOT, '.env') });

// 桌面打包版：追加加载用户数据目录的 .env（Local 优先，回退到 Roaming）
// Windows: AppData\Local\ai.swell.lobster 或 AppData\Roaming\ai.swell.lobster
// macOS:   ~/Library/Application Support/ai.swell.lobster
const localDataDir = process.env.SWELL_LOCAL_DATA_DIR;
const roamingDataDir = process.env.SWELL_DATA_DIR;
const dataEnvPath = (() => {
  if (localDataDir) {
    const p = resolve(localDataDir, '.env');
    if (existsSync(p)) return p;
  }
  if (roamingDataDir) {
    const p = resolve(roamingDataDir, '.env');
    if (existsSync(p)) return p;
  }
  return null;
})();
console.log('[config] SWELL_LOCAL_DATA_DIR =', localDataDir ?? '(not set)');
console.log('[config] SWELL_DATA_DIR =', roamingDataDir ?? '(not set)');
console.log('[config] data .env =', dataEnvPath ?? 'NOT FOUND (tried both Local and Roaming)');
if (dataEnvPath) {
  loadDotenv({ path: dataEnvPath, override: true });
}

function env(swellKey: string, fallback: string): string {
  return process.env[`SWELL_${swellKey}`] ?? process.env[swellKey] ?? fallback;
}

export const settings = {
  identityDir: env('IDENTITY_DIR', resolve(REPO_ROOT, 'identity')),
  projectRoot: env('PROJECT_ROOT', REPO_ROOT),
  dataDir: env('DATA_DIR', resolve(REPO_ROOT, 'data')),
  agentName: env('AGENT_NAME', 'Swell-Lobster'),
  port: parseInt(process.env.API_PORT ?? '18900', 10),
  host: process.env.API_HOST ?? '127.0.0.1',
} as const;

export type Settings = typeof settings;
