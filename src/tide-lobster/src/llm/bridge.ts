/**
 * LLM bridge: model-list fetching for Anthropic and OpenAI-compatible APIs
 *
 * 对应 Python: swell_lobster/llm/bridge.py
 *
 * 使用 Node.js 18+ 内置 fetch + AbortController，无需额外依赖。
 */

import { ProxyAgent } from 'undici';
import type { Dispatcher } from 'undici';

import { inferCapabilities, getProviderSlugFromBaseUrl } from './capabilities.js';

const ANTHROPIC_DEFAULT_BASE = 'https://api.anthropic.com';
const OPENAI_DEFAULT_BASE = 'https://api.openai.com/v1';
const REQUEST_TIMEOUT_MS = 30_000;

// ── HTTP(S) 代理（读 .env：HTTP_PROXY / HTTPS_PROXY / NO_PROXY，与常见工具一致）────────

function shouldBypassProxy(hostname: string, noProxyRaw: string): boolean {
  const h = hostname.toLowerCase();
  for (const part of noProxyRaw.split(',')) {
    const pat = part.trim().toLowerCase();
    if (!pat) continue;
    if (pat === '*') return true;
    if (pat.startsWith('.')) {
      const root = pat.slice(1);
      if (h === root || h.endsWith(pat)) return true;
    } else if (h === pat || h.endsWith(`.${pat}`)) return true;
  }
  return false;
}

function proxyUrlForTarget(targetUrl: string): string | undefined {
  let hostname: string;
  try {
    hostname = new URL(targetUrl).hostname;
  } catch {
    return undefined;
  }
  const noProxy = process.env.NO_PROXY ?? process.env.no_proxy ?? '';
  if (noProxy && shouldBypassProxy(hostname, noProxy)) return undefined;

  const isHttps = targetUrl.startsWith('https:');
  const raw = isHttps
    ? (process.env.HTTPS_PROXY ??
      process.env.https_proxy ??
      process.env.ALL_PROXY ??
      process.env.all_proxy)
    : (process.env.HTTP_PROXY ??
      process.env.http_proxy ??
      process.env.ALL_PROXY ??
      process.env.all_proxy);
  const trimmed = raw?.trim();
  return trimmed || undefined;
}

let cachedProxyUrl: string | undefined;
let cachedProxyAgent: ProxyAgent | undefined;

function dispatcherForUrl(url: string): Dispatcher | undefined {
  const proxyUrl = proxyUrlForTarget(url);
  if (!proxyUrl) return undefined;
  if (cachedProxyUrl === proxyUrl && cachedProxyAgent) return cachedProxyAgent;
  void cachedProxyAgent?.close();
  cachedProxyAgent = new ProxyAgent(proxyUrl);
  cachedProxyUrl = proxyUrl;
  return cachedProxyAgent;
}

// ── URL helpers ────────────────────────────────────────────────────────────────

function anthropicModelsUrl(baseUrl: string): string {
  const base = (baseUrl || ANTHROPIC_DEFAULT_BASE).replace(/\/+$/, '');
  // 已含版本路径段（/v1, /v2, /v1beta 等）直接拼 /models
  if (/\/v\d/.test(base)) return `${base}/models`;
  return `${base}/v1/models`;
}

function openaiModelsUrl(baseUrl: string): string {
  const base = (baseUrl || OPENAI_DEFAULT_BASE).replace(/\/+$/, '');
  return `${base}/models`;
}

// ── fetch with timeout ─────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const dispatcher = dispatcherForUrl(url);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      ...(dispatcher ? { dispatcher } : {}),
    });
  } finally {
    clearTimeout(timer);
  }
}

// ── Anthropic capabilities from API response ───────────────────────────────────

function capsFromAnthropicApi(
  rawCaps: Record<string, unknown>,
  _modelId: string
): Record<string, boolean> {
  const s = (key: string): boolean => {
    const v = rawCaps[key];
    if (!v || typeof v !== 'object') return false;
    return Boolean((v as Record<string, unknown>).supported);
  };
  return {
    text: true,
    vision: s('image_input'),
    video: false,
    tools: true,
    thinking: s('thinking'),
    audio: false,
    pdf: s('pdf_input'),
  };
}

// ── Public bridge functions ────────────────────────────────────────────────────

export async function listModelsAnthropic(
  apiKey: string,
  baseUrl: string,
  providerSlug?: string | null
): Promise<Record<string, unknown>[]> {
  const effectiveSlug = providerSlug || getProviderSlugFromBaseUrl(baseUrl) || 'anthropic';

  const url = anthropicModelsUrl(baseUrl);
  const headers: Record<string, string> = {
    'X-Api-Key': apiKey,
    'anthropic-version': '2023-06-01',
    Accept: 'application/json',
  };

  const allModels: Record<string, unknown>[] = [];
  let afterId: string | null = null;

  const isNativeAnthropic = (baseUrl || ANTHROPIC_DEFAULT_BASE).includes('anthropic.com');

  while (true) {
    const params = new URLSearchParams();
    if (isNativeAnthropic) params.set('limit', '1000');
    if (afterId) params.set('after_id', afterId);

    const queryString = params.toString();
    const resp = await fetchWithTimeout(queryString ? `${url}?${queryString}` : url, { headers });

    if (!resp.ok) {
      const snippet = (await resp.text()).slice(0, 300);
      throw new Error(`HTTP ${resp.status}: ${snippet}`);
    }

    const data = (await resp.json()) as Record<string, unknown>;
    const page = (data.data as Record<string, unknown>[]) ?? [];

    for (const m of page) {
      const modelId = (m.id as string) ?? '';
      const rawCaps = (m.capabilities as Record<string, unknown>) ?? {};
      const caps = Object.keys(rawCaps).length
        ? capsFromAnthropicApi(rawCaps, modelId)
        : inferCapabilities(modelId, effectiveSlug);

      allModels.push({
        id: modelId,
        display_name: (m.display_name as string) || modelId,
        created_at: (m.created_at as string) ?? '',
        max_input_tokens: m.max_input_tokens ?? null,
        max_tokens: m.max_tokens ?? null,
        type: (m.type as string) ?? 'model',
        capabilities: caps,
      });
    }

    if (!data.has_more) break;
    afterId = (data.last_id as string) ?? null;
    if (!afterId) break;
  }

  console.log(`[bridge] Anthropic models fetched: ${allModels.length}`);
  return allModels;
}

export async function listModelsOpenAI(
  apiKey: string,
  baseUrl: string,
  providerSlug?: string | null
): Promise<Record<string, unknown>[]> {
  const effectiveSlug = providerSlug || getProviderSlugFromBaseUrl(baseUrl) || 'openai';

  const url = openaiModelsUrl(baseUrl);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json',
  };

  const resp = await fetchWithTimeout(url, { headers });

  if (!resp.ok) {
    const snippet = (await resp.text()).slice(0, 300);
    throw new Error(`HTTP ${resp.status}: ${snippet}`);
  }

  const data = (await resp.json()) as Record<string, unknown>;
  const raw = (data.data as Record<string, unknown>[]) ?? [];

  const models = raw
    .filter((m) => m.id)
    .map((m) => ({
      id: m.id as string,
      display_name: m.id as string,
      created_at: '',
      owned_by: (m.owned_by as string) ?? '',
      type: 'model',
      capabilities: inferCapabilities(m.id as string, effectiveSlug),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  console.log(
    `[bridge] OpenAI-compatible models fetched from ${url} (slug=${effectiveSlug}): ${models.length}`
  );
  return models;
}
