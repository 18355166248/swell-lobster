/**
 * 应用配置
 *
 * 配置与 SWELL_* 环境变量约定（原 Python/Pydantic 参考已移除）。
 *
 * 加载顺序：process.env > 用户全局 .env > 仓库根 .env > 计算默认值
 */

import { resolve, dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { config as loadDotenv } from 'dotenv';
import { readFileSync } from 'node:fs';
import { parseEnv } from './utils/envUtils.js';

function findRepoRoot(): string {
  const envRoot = process.env.SWELL_PROJECT_ROOT ?? process.env.PROJECT_ROOT;
  if (envRoot) return resolve(envRoot);

  const candidates = [process.cwd(), dirname(process.execPath)];
  for (const start of candidates) {
    let current = resolve(start);
    for (let depth = 0; depth < 8; depth += 1) {
      // 打包版：只有 identity 目录（无 src/tide-lobster）
      // 开发版：同时有 identity 和 src/tide-lobster
      if (existsSync(resolve(current, 'identity'))) {
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
console.log('[config] REPO_ROOT =', REPO_ROOT);
console.log('[config] identityDir candidate =', resolve(REPO_ROOT, 'identity'));
console.log('[config] identity exists =', existsSync(resolve(REPO_ROOT, 'identity')));

export function globalEnvPath(): string | null {
  const explicitDir = process.env.SWELL_GLOBAL_ENV_DIR?.trim();
  if (explicitDir) return resolve(explicitDir, '.env');

  const home = homedir().trim();
  if (!home) return null;
  return join(home, '.swell-lobster', '.env');
}

const repoEnvPath = resolve(REPO_ROOT, '.env');
const packagedDesktop = Boolean(process.env.SWELL_GLOBAL_ENV_DIR?.trim());
const globalDesktopEnvPath = globalEnvPath();

if (!packagedDesktop && existsSync(repoEnvPath)) {
  loadDotenv({ path: repoEnvPath });
}

console.log('[config] SWELL_GLOBAL_ENV_DIR =', process.env.SWELL_GLOBAL_ENV_DIR ?? '(not set)');
console.log('[config] global .env =', globalDesktopEnvPath ?? 'NOT AVAILABLE');
if (globalDesktopEnvPath && existsSync(globalDesktopEnvPath)) {
  // 设备级配置优先于仓库根 .env；shell 显式传入的 process.env 仍然最高优先级。
  loadDotenv({ path: globalDesktopEnvPath, override: true });
} else if (packagedDesktop) {
  console.log('[config] global .env status = NOT FOUND');
}

export function resolveAppEnvPath(): string {
  return globalEnvPath() ?? repoEnvPath;
}

export function readAppEnvFile(): Record<string, string> {
  const path = resolveAppEnvPath();
  if (!existsSync(path)) return {};
  try {
    return parseEnv(readFileSync(path, 'utf-8'));
  } catch {
    return {};
  }
}

/**
 * 读取桌面端用户可编辑的全局环境变量。
 *
 * 与运行参数不同，这类配置统一来自应用实际使用的 `.env` 文件，
 * 例如 `~/.swell-lobster/.env`。这里不再优先读取 `process.env`，避免桌面端
 * “文件已修改但当前进程环境未同步” 导致的配置错乱。
 */
export function readConfiguredEnvValue(envName: string): string {
  if (!envName) return '';
  return readAppEnvFile()[envName]?.trim() ?? '';
}

/** 按顺序读取多个候选键，返回第一个非空值。 */
export function readConfiguredEnvValueAny(envNames: string[]): string {
  const env = readAppEnvFile();
  for (const envName of envNames) {
    const value = env[envName]?.trim();
    if (value) return value;
  }
  return '';
}

function env(swellKey: string, fallback: string): string {
  return process.env[`SWELL_${swellKey}`] ?? process.env[swellKey] ?? fallback;
}

function envNumber(swellKey: string, fallback: number): number {
  const raw = readConfiguredEnvValueAny([`SWELL_${swellKey}`, swellKey]);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envEnum<T extends readonly string[]>(
  swellKey: string,
  allowed: T,
  fallback: T[number]
): T[number] {
  const raw = readConfiguredEnvValueAny([`SWELL_${swellKey}`, swellKey]).trim();
  if (allowed.includes(raw)) return raw as T[number];
  return fallback;
}

const SEARCH_PROVIDERS = ['auto', 'brave', 'tavily', 'duckduckgo'] as const;
export type SearchProvider = typeof SEARCH_PROVIDERS[number];

export const settings = {
  identityDir: env('IDENTITY_DIR', resolve(REPO_ROOT, 'identity')),
  projectRoot: env('PROJECT_ROOT', REPO_ROOT),
  dataDir: env('DATA_DIR', resolve(REPO_ROOT, 'data')),
  agentName: env('AGENT_NAME', 'Swell-Lobster'),
  port: parseInt(process.env.API_PORT ?? '18900', 10),
  host: process.env.API_HOST ?? '127.0.0.1',
  // 向量 embedding 配置（可选，未配置时降级为 LIKE 检索）
  embeddingBaseUrl: readConfiguredEnvValue('SWELL_EMBEDDING_BASE_URL'),
  embeddingModel: readConfiguredEnvValue('SWELL_EMBEDDING_MODEL') || 'text-embedding-3-small',
  embeddingApiKeyEnv: readConfiguredEnvValue('SWELL_EMBEDDING_API_KEY_ENV'),
  memorySemanticMinScore: envNumber('MEMORY_SEMANTIC_MIN_SCORE', 0.75),
  // 网络搜索配置（可选）
  searchProvider: envEnum('SEARCH_PROVIDER', SEARCH_PROVIDERS, 'auto'),
  braveSearchApiKeyEnv:
    readConfiguredEnvValue('SWELL_BRAVE_SEARCH_API_KEY_ENV') || 'BRAVE_SEARCH_API_KEY',
  tavilyApiKeyEnv: readConfiguredEnvValue('SWELL_TAVILY_API_KEY_ENV') || 'TAVILY_API_KEY',
} as const;

export type Settings = typeof settings;
