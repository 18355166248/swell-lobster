/**
 * LLM bridge: model-list fetching for Anthropic and OpenAI-compatible APIs
 *
 * 对应 Python: swell_lobster/llm/bridge.py
 *
 * 使用 Node.js 18+ 内置 fetch + AbortController，无需额外依赖。
 */

import { inferCapabilities, getProviderSlugFromBaseUrl } from "./capabilities.js";

const ANTHROPIC_DEFAULT_BASE = "https://api.anthropic.com";
const OPENAI_DEFAULT_BASE = "https://api.openai.com/v1";
const REQUEST_TIMEOUT_MS = 30_000;

// ── URL helpers ────────────────────────────────────────────────────────────────

function anthropicModelsUrl(baseUrl: string): string {
  const base = (baseUrl || ANTHROPIC_DEFAULT_BASE).replace(/\/+$/, "");
  if (base.endsWith("/v1")) return `${base}/models`;
  return `${base}/v1/models`;
}

function openaiModelsUrl(baseUrl: string): string {
  const base = (baseUrl || OPENAI_DEFAULT_BASE).replace(/\/+$/, "");
  return `${base}/models`;
}

// ── fetch with timeout ─────────────────────────────────────────────────────────

async function fetchWithTimeout(
  url: string,
  init: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
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
    if (!v || typeof v !== "object") return false;
    return Boolean((v as Record<string, unknown>).supported);
  };
  return {
    text: true,
    vision: s("image_input"),
    video: false,
    tools: true,
    thinking: s("thinking"),
    audio: false,
    pdf: s("pdf_input"),
  };
}

// ── Public bridge functions ────────────────────────────────────────────────────

export async function listModelsAnthropic(
  apiKey: string,
  baseUrl: string,
  providerSlug?: string | null
): Promise<Record<string, unknown>[]> {
  const effectiveSlug =
    providerSlug || getProviderSlugFromBaseUrl(baseUrl) || "anthropic";

  const url = anthropicModelsUrl(baseUrl);
  const headers: Record<string, string> = {
    "X-Api-Key": apiKey,
    "anthropic-version": "2023-06-01",
    Accept: "application/json",
  };

  const allModels: Record<string, unknown>[] = [];
  let afterId: string | null = null;

  while (true) {
    const params = new URLSearchParams({ limit: "1000" });
    if (afterId) params.set("after_id", afterId);

    const resp = await fetchWithTimeout(`${url}?${params}`, { headers });

    if (!resp.ok) {
      const snippet = (await resp.text()).slice(0, 300);
      throw new Error(`HTTP ${resp.status}: ${snippet}`);
    }

    const data = (await resp.json()) as Record<string, unknown>;
    const page = (data.data as Record<string, unknown>[]) ?? [];

    for (const m of page) {
      const modelId = (m.id as string) ?? "";
      const rawCaps = (m.capabilities as Record<string, unknown>) ?? {};
      const caps = Object.keys(rawCaps).length
        ? capsFromAnthropicApi(rawCaps, modelId)
        : inferCapabilities(modelId, effectiveSlug);

      allModels.push({
        id: modelId,
        display_name: (m.display_name as string) || modelId,
        created_at: (m.created_at as string) ?? "",
        max_input_tokens: m.max_input_tokens ?? null,
        max_tokens: m.max_tokens ?? null,
        type: (m.type as string) ?? "model",
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
  const effectiveSlug =
    providerSlug || getProviderSlugFromBaseUrl(baseUrl) || "openai";

  const url = openaiModelsUrl(baseUrl);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
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
      created_at: "",
      owned_by: (m.owned_by as string) ?? "",
      type: "model",
      capabilities: inferCapabilities(m.id as string, effectiveSlug),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  console.log(
    `[bridge] OpenAI-compatible models fetched from ${url} (slug=${effectiveSlug}): ${models.length}`
  );
  return models;
}
