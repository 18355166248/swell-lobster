/**
 * 应用配置
 *
 * 配置与 SWELL_* 环境变量约定（原 Python/Pydantic 参考已移除）。
 *
 * 加载顺序：process.env > .env 文件 > 计算默认值
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
// src/tide-lobster/src/config.ts → 向上 3 层到仓库根
const REPO_ROOT = resolve(dirname(__filename), '..', '..', '..');

// 先加载仓库根 .env（与 Python 的 env_file=".env" 一致）
loadDotenv({ path: resolve(REPO_ROOT, '.env') });

function env(swellKey: string, fallback: string): string {
  return process.env[`SWELL_${swellKey}`] ?? process.env[swellKey] ?? fallback;
}

export const settings = {
  identityDir: env('IDENTITY_DIR', resolve(REPO_ROOT, 'identity')),
  projectRoot: env('PROJECT_ROOT', REPO_ROOT),
  agentName: env('AGENT_NAME', 'Swell-Lobster'),
  port: parseInt(process.env.API_PORT ?? '18900', 10),
  host: process.env.API_HOST ?? '127.0.0.1',
} as const;

export type Settings = typeof settings;
