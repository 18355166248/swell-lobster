/**
 * MCP 内置市场目录：JSON 位于同目录；可选 SWELL_MCP_MARKETPLACE_URL 拉取远程覆盖。
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { settings } from '../config.js';

export type MarketplaceCategory = {
  id: string;
  name_zh: string;
  name_en: string;
};

export type MarketplaceServerEntry = {
  id: string;
  name: string;
  description_zh?: string;
  description_en?: string;
  category: string;
  transportType: string;
  command: string;
  defaultArgs: string[];
  requiredEnvKeys?: string[];
  optionalEnvKeys?: string[];
};

export type MarketplaceCatalog = {
  categories: MarketplaceCategory[];
  servers: MarketplaceServerEntry[];
};

const BUNDLED_PATH = join(
  settings.projectRoot,
  'src/tide-lobster/src/mcp/marketplace.json'
);

function parseCatalog(raw: unknown): MarketplaceCatalog {
  if (!raw || typeof raw !== 'object') throw new Error('invalid marketplace: not an object');
  const o = raw as Record<string, unknown>;
  const categories = o.categories;
  const servers = o.servers;
  if (!Array.isArray(categories) || !Array.isArray(servers)) {
    throw new Error('invalid marketplace: categories/servers must be arrays');
  }
  return { categories: categories as MarketplaceCategory[], servers: servers as MarketplaceServerEntry[] };
}

function loadBundled(): MarketplaceCatalog {
  const text = readFileSync(BUNDLED_PATH, 'utf8');
  return parseCatalog(JSON.parse(text) as unknown);
}

let remoteCache: { catalog: MarketplaceCatalog; fetchedAt: number } | null = null;
const REMOTE_TTL_MS = 60_000;

async function fetchRemote(url: string): Promise<MarketplaceCatalog> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as unknown;
    return parseCatalog(json);
  } finally {
    clearTimeout(t);
  }
}

/**
 * 返回市场目录：优先 SWELL_MCP_MARKETPLACE_URL（带短缓存），失败则使用内置 JSON。
 */
export async function getMarketplace(): Promise<MarketplaceCatalog> {
  const url = process.env.SWELL_MCP_MARKETPLACE_URL?.trim() || process.env.MCP_MARKETPLACE_URL?.trim();
  if (!url) {
    return loadBundled();
  }
  const now = Date.now();
  if (remoteCache && now - remoteCache.fetchedAt < REMOTE_TTL_MS) {
    return remoteCache.catalog;
  }
  try {
    const catalog = await fetchRemote(url);
    remoteCache = { catalog, fetchedAt: now };
    return catalog;
  } catch (e) {
    console.warn('[mcp] marketplace URL fetch failed, using bundled:', e);
    return loadBundled();
  }
}

/** 同步读取内置目录（校验 registry 安装时用，避免依赖远程） */
export function getBundledMarketplace(): MarketplaceCatalog {
  return loadBundled();
}

export function findMarketplaceEntry(
  catalog: MarketplaceCatalog,
  id: string
): MarketplaceServerEntry | undefined {
  return catalog.servers.find((s) => s.id === id);
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

/**
 * 校验「从市场安装」的请求是否与目录模板一致，且 env 含全部 requiredEnvKeys。
 */
export function assertMarketplaceInstall(
  entry: MarketplaceServerEntry,
  command: string,
  args: string[],
  env: Record<string, string>
): void {
  if (entry.transportType !== 'stdio') {
    throw new Error('marketplace entry must use stdio transport');
  }
  if (command.trim() !== entry.command.trim()) {
    throw new Error('command does not match marketplace template');
  }
  if (!arraysEqual(args, entry.defaultArgs)) {
    throw new Error('args do not match marketplace template');
  }
  const required = entry.requiredEnvKeys ?? [];
  for (const key of required) {
    const v = env[key];
    if (v === undefined || String(v).trim() === '') {
      throw new Error(`missing required env: ${key}`);
    }
  }
}
