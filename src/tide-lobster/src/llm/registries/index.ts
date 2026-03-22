/**
 * 服务商注册表
 *
 * 对应 Python: swell_lobster/llm/registries/__init__.py
 *
 * 数据来源：
 *   1. 内置 registries/providers.json（repo 根，两端共用）
 *   2. 工作区 data/custom_providers.json（用户自定义，可选）
 *
 * 合并规则：内置列表为基础，工作区文件按 slug 覆盖或追加。
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { settings } from "../../config.js";
import {
  type ProviderInfo,
  type ModelInfo,
  providerInfoToDict,
} from "./base.js";

export type { ProviderInfo, ModelInfo };
export { providerInfoToDict };

// ── 内置 providers.json 路径（repo 根 registries/，两端共用）──────────────────
const _PROVIDERS_JSON_PATH = resolve(settings.projectRoot, "registries", "providers.json");

function _loadBuiltinEntries(): Record<string, unknown>[] {
  try {
    const raw = readFileSync(_PROVIDERS_JSON_PATH, "utf-8");
    return JSON.parse(raw) as Record<string, unknown>[];
  } catch {
    console.warn(
      `[tide-lobster] providers.json not found at ${_PROVIDERS_JSON_PATH}, using empty list`
    );
    return [];
  }
}

// ── 工作区自定义服务商 ──────────────────────────────────────────────────────────

function _customProvidersPath(): string {
  return resolve(settings.projectRoot, "data", "custom_providers.json");
}

export function loadCustomProviders(): Record<string, unknown>[] {
  const path = _customProvidersPath();
  if (!existsSync(path)) return [];
  try {
    const data = JSON.parse(readFileSync(path, "utf-8"));
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn(`[tide-lobster] Failed to load custom providers: ${e}`);
    return [];
  }
}

export function saveCustomProviders(entries: Record<string, unknown>[]): void {
  const path = _customProvidersPath();
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(entries, null, 2) + "\n", "utf-8");
}

// ── 合并 + 构建 ─────────────────────────────────────────────────────────────────

function _mergeProviderEntries(): Record<string, unknown>[] {
  const builtins = _loadBuiltinEntries();
  const custom = loadCustomProviders();

  const merged = new Map<string, Record<string, unknown>>();
  for (const entry of builtins) {
    merged.set(entry.slug as string, entry);
  }
  for (const entry of custom) {
    const slug = (entry.slug as string) || "";
    if (!slug) continue;
    if (merged.has(slug)) {
      merged.set(slug, { ...merged.get(slug), ...entry });
    } else {
      merged.set(slug, entry);
    }
  }
  return Array.from(merged.values());
}

function _entryToProviderInfo(entry: Record<string, unknown>): ProviderInfo {
  return {
    name: entry.name as string,
    slug: entry.slug as string,
    api_type: entry.api_type as string,
    default_base_url: (entry.default_base_url as string) ?? "",
    api_key_env_suggestion: (entry.api_key_env_suggestion as string) ?? "",
    supports_model_list: (entry.supports_model_list as boolean) ?? true,
    supports_capability_api: (entry.supports_capability_api as boolean) ?? false,
    requires_api_key: (entry.requires_api_key as boolean) ?? true,
    is_local: (entry.is_local as boolean) ?? false,
    coding_plan_base_url: entry.coding_plan_base_url as string | undefined,
    coding_plan_api_type: entry.coding_plan_api_type as string | undefined,
    note: entry.note as string | undefined,
  };
}

// ── 全局注册表 ──────────────────────────────────────────────────────────────────

let _allProviders: ProviderInfo[] = [];
let _bySlug = new Map<string, ProviderInfo>();

function _buildRegistries(): void {
  const entries = _mergeProviderEntries();
  _allProviders = [];
  _bySlug = new Map();
  for (const entry of entries) {
    try {
      const info = _entryToProviderInfo(entry);
      _allProviders.push(info);
      _bySlug.set(info.slug, info);
    } catch (e) {
      console.warn(
        `[tide-lobster] Failed to build provider '${entry.name}': ${e}`
      );
    }
  }
}

// 初始化加载
_buildRegistries();

// ── Public API ──────────────────────────────────────────────────────────────────

export function reloadRegistries(): number {
  _buildRegistries();
  return _allProviders.length;
}

export function getRegistry(slug: string): ProviderInfo {
  const info = _bySlug.get(slug);
  if (!info) throw new Error(`Unknown provider slug: ${JSON.stringify(slug)}`);
  return info;
}

export function listProviders(): ProviderInfo[] {
  return _allProviders;
}
