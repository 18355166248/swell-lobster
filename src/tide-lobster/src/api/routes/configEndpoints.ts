/**
 * Config routes — LLM 端点管理
 *
 * Node 后端实现（原 Python 参考已移除）。
 *
 * 接口：
 * - GET  /api/config/endpoints    读取 data/llm_endpoints.json
 * - POST /api/config/endpoints    写入 data/llm_endpoints.json
 * - GET  /api/config/providers    服务商列表
 * - POST /api/config/list-models  拉取模型列表
 */

import { Hono } from 'hono';
import { EndpointStore } from '../../store/endpointStore.js';
import { getDb } from '../../db/index.js';
import { KeyValueStore } from '../../store/keyValueStore.js';
import { listProviders, providerInfoToDict } from '../../llm/registries/index.js';
import { listModelsAnthropic, listModelsOpenAI } from '../../llm/bridge.js';
import { randomUUID } from 'node:crypto';
import { readAppEnvFile } from '../../config.js';
import { requestChatCompletion } from '../../chat/llmClient.js';

export const configEndpointsRouter = new Hono();
const store = new EndpointStore();
const kvStore = new KeyValueStore();

const COMPILER_ENDPOINT_KEY = 'llm:compiler_endpoint';
const STT_ENDPOINTS_KEY = 'llm:stt_endpoints';

function readJsonValue<T>(key: string, fallback: T): T {
  const raw = kvStore.getValue(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJsonValue(key: string, value: unknown): void {
  kvStore.setValue(key, JSON.stringify(value));
}

function readEnvFile(): Record<string, string> {
  return readAppEnvFile();
}

function resolveApiKeyValue(
  apiKeyValue: string | undefined,
  apiKeyEnv: string | undefined,
  providerSlug?: string | null
): string {
  const explicit = apiKeyValue?.trim() ?? '';
  if (explicit) return explicit;

  const envKey = apiKeyEnv?.trim() ?? '';
  if (envKey) {
    const fileValue = readEnvFile()[envKey]?.trim();
    if (fileValue) return fileValue;
  }

  if (providerSlug === 'ollama' || providerSlug === 'lmstudio') return 'local';
  return '';
}

configEndpointsRouter.get('/api/config/endpoints', (c) => {
  const endpoints = store.listEndpoints();
  return c.json({ endpoints });
});

configEndpointsRouter.get('/api/config/compiler-endpoint', (c) => {
  const value = readJsonValue<{ endpoint_id?: string | null }>(COMPILER_ENDPOINT_KEY, {
    endpoint_id: null,
  });
  return c.json(value);
});

configEndpointsRouter.post('/api/config/compiler-endpoint', async (c) => {
  try {
    const body = await c.req.json<{ endpoint_id?: string | null }>();
    const endpointId = body.endpoint_id ?? null;
    if (endpointId) {
      const exists = store.getEndpointById(endpointId);
      if (!exists) return c.json({ detail: 'endpoint not found' }, 404);
    }
    writeJsonValue(COMPILER_ENDPOINT_KEY, { endpoint_id: endpointId });
    return c.json({ status: 'ok', endpoint_id: endpointId });
  } catch (e) {
    return c.json({ detail: String((e as Error)?.message || e) }, 500);
  }
});

configEndpointsRouter.get('/api/config/stt-endpoints', (c) => {
  const endpoints = readJsonValue<Record<string, unknown>[]>(STT_ENDPOINTS_KEY, []);
  return c.json({ endpoints });
});

configEndpointsRouter.post('/api/config/stt-endpoints/item', async (c) => {
  try {
    const body = await c.req.json<{ endpoint: Record<string, unknown> }>();
    const endpoint = body.endpoint;
    if (!endpoint || typeof endpoint !== 'object') {
      return c.json({ detail: 'endpoint is required' }, 400);
    }
    const endpoints = readJsonValue<Record<string, unknown>[]>(STT_ENDPOINTS_KEY, []);
    const created = { ...endpoint, id: String(endpoint.id ?? randomUUID()) };
    endpoints.push(created);
    writeJsonValue(STT_ENDPOINTS_KEY, endpoints);
    return c.json({ endpoint: created }, 201);
  } catch (e) {
    return c.json({ detail: String((e as Error)?.message || e) }, 500);
  }
});

configEndpointsRouter.patch('/api/config/stt-endpoints/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<{ endpoint: Record<string, unknown> }>();
    const endpoint = body.endpoint;
    if (!endpoint || typeof endpoint !== 'object') {
      return c.json({ detail: 'endpoint is required' }, 400);
    }
    const endpoints = readJsonValue<Record<string, unknown>[]>(STT_ENDPOINTS_KEY, []);
    const index = endpoints.findIndex((item) => String(item.id ?? '') === id);
    if (index === -1) return c.json({ detail: 'endpoint not found' }, 404);
    const updated = { ...endpoint, id };
    endpoints[index] = updated;
    writeJsonValue(STT_ENDPOINTS_KEY, endpoints);
    return c.json({ endpoint: updated });
  } catch (e) {
    return c.json({ detail: String((e as Error)?.message || e) }, 500);
  }
});

configEndpointsRouter.delete('/api/config/stt-endpoints/:id', (c) => {
  const id = c.req.param('id');
  const endpoints = readJsonValue<Record<string, unknown>[]>(STT_ENDPOINTS_KEY, []);
  const next = endpoints.filter((item) => String(item.id ?? '') !== id);
  if (next.length === endpoints.length) {
    return c.json({ detail: 'endpoint not found' }, 404);
  }
  writeJsonValue(STT_ENDPOINTS_KEY, next);
  return c.json({ status: 'ok', id });
});

configEndpointsRouter.post('/api/config/endpoints/item', async (c) => {
  try {
    const body = await c.req.json<{ endpoint: Record<string, unknown> }>();
    const endpoint = body.endpoint;
    if (!endpoint || typeof endpoint !== 'object') {
      return c.json({ detail: 'endpoint is required' }, 400);
    }
    const created = store.createEndpoint(endpoint);
    return c.json({ endpoint: created }, 201);
  } catch (e) {
    return c.json({ detail: String((e as Error)?.message || e) }, 500);
  }
});

configEndpointsRouter.patch('/api/config/endpoints/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<{ endpoint: Record<string, unknown> }>();
    const endpoint = body.endpoint;
    if (!endpoint || typeof endpoint !== 'object') {
      return c.json({ detail: 'endpoint is required' }, 400);
    }
    const updated = store.updateEndpoint(id, endpoint);
    if (!updated) return c.json({ detail: 'endpoint not found' }, 404);
    return c.json({ endpoint: updated });
  } catch (e) {
    return c.json({ detail: String((e as Error)?.message || e) }, 500);
  }
});

configEndpointsRouter.delete('/api/config/endpoints/:id', (c) => {
  const id = c.req.param('id');
  const ok = store.deleteEndpoint(id);
  if (!ok) return c.json({ detail: 'endpoint not found' }, 404);
  return c.json({ status: 'ok', id });
});

// 1. 获取 endpoint id
// 2. 获取 body 中的 fallback_endpoint_id
// 3. 如果 fallback_endpoint_id 存在，则更新 endpoint 的 fallback_endpoint_id
// 4. 如果 fallback_endpoint_id 不存在，则删除 endpoint 的 fallback_endpoint_id
// 5. 返回更新后的 endpoint
// 6. 如果更新失败，则返回 500 错误
// 7. 如果更新成功，则返回 200 成功
// 8. 如果更新失败，则返回 500 错误
configEndpointsRouter.patch('/api/config/endpoints/:id/fallback', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ fallback_endpoint_id?: string | null }>();
  const db = getDb();
  const exists = db.prepare(`SELECT id FROM llm_endpoints WHERE id = ?`).get(id);
  if (!exists) return c.json({ detail: 'endpoint not found' }, 404);

  const fallbackId = body.fallback_endpoint_id ?? null;
  if (fallbackId) {
    const fallback = db.prepare(`SELECT id FROM llm_endpoints WHERE id = ?`).get(fallbackId);
    if (!fallback) return c.json({ detail: 'fallback endpoint not found' }, 404);
    if (fallbackId === id) return c.json({ detail: 'fallback endpoint cannot be self' }, 400);
  }

  db.prepare(`UPDATE llm_endpoints SET fallback_endpoint_id = ? WHERE id = ?`).run(fallbackId, id);
  const endpoint = db.prepare(`SELECT * FROM llm_endpoints WHERE id = ?`).get(id);
  return c.json({ endpoint });
});

// ── POST /api/config/endpoints ─────────────────────────────────────────────────

configEndpointsRouter.post('/api/config/endpoints', async (c) => {
  try {
    const body = await c.req.json<{ content: { endpoints: any[] } }>();
    const endpoints = Array.isArray(body.content?.endpoints) ? body.content.endpoints : [];
    store.updateEndpoints(endpoints);
    return c.json({ status: 'ok' });
  } catch (e) {
    return c.json({ detail: String((e as Error)?.message || e) }, 500);
  }
});

// ── GET /api/config/providers ──────────────────────────────────────────────────

configEndpointsRouter.get('/api/config/providers', (c) => {
  try {
    const providers = listProviders();
    return c.json({ providers: providers.map(providerInfoToDict) });
  } catch (e) {
    return c.json({ providers: [], error: String(e) });
  }
});

// ── POST /api/config/list-models ───────────────────────────────────────────────

configEndpointsRouter.post('/api/config/list-models', async (c) => {
  const body = await c.req.json<{
    api_type?: string;
    base_url?: string;
    provider_slug?: string;
    api_key?: string;
    api_key_env?: string;
  }>();

  const apiType = (body.api_type ?? '').trim().toLowerCase();
  const baseUrl = (body.base_url ?? '').trim();
  const providerSlug = (body.provider_slug ?? '').trim() || undefined;
  const apiKey = resolveApiKeyValue(body.api_key, body.api_key_env, providerSlug);

  if (!apiType) return c.json({ error: 'api_type 不能为空', models: [] });
  if (!baseUrl) return c.json({ error: 'base_url 不能为空', models: [] });
  if (!apiKey) return c.json({ error: '未找到可用 API Key，请输入 API Key 或检查环境变量配置', models: [] });

  try {
    let models: Record<string, unknown>[];
    if (apiType === 'openai') {
      models = await listModelsOpenAI(apiKey, baseUrl, providerSlug);
    } else if (apiType === 'anthropic') {
      models = await listModelsAnthropic(apiKey, baseUrl, providerSlug);
    } else {
      return c.json({ error: `不支持的 api_type: ${JSON.stringify(apiType)}`, models: [] });
    }
    return c.json({ models });
  } catch (e) {
    const raw = String(e).toLowerCase();
    let friendly = String(e);
    if (raw.includes('errno 2') || raw.includes('no such file')) {
      friendly = 'SSL 证书文件缺失，请重新安装或更新应用';
    } else if (
      raw.includes('connect') ||
      raw.includes('connection refused') ||
      raw.includes('no route') ||
      raw.includes('unreachable')
    ) {
      friendly = '无法连接到服务商，请检查 API 地址和网络连接';
    } else if (
      raw.includes('401') ||
      raw.includes('unauthorized') ||
      raw.includes('invalid api key') ||
      raw.includes('authentication')
    ) {
      friendly = 'API Key 无效或已过期，请检查后重试';
    } else if (raw.includes('403') || raw.includes('forbidden') || raw.includes('permission')) {
      friendly = 'API Key 权限不足，请确认已开通模型访问权限';
    } else if (raw.includes('404') || raw.includes('not found')) {
      friendly = 'API 地址有误，服务商未返回模型列表接口';
    } else if (raw.includes('timeout') || raw.includes('timed out') || raw.includes('abort')) {
      friendly = '请求超时，请检查网络或稍后重试';
    } else if (friendly.length > 150) {
      friendly = friendly.slice(0, 150) + '…';
    }
    return c.json({ error: friendly, models: [] });
  }
});

configEndpointsRouter.post('/api/config/test-endpoint', async (c) => {
  const body = await c.req.json<{
    api_type?: string;
    base_url?: string;
    provider_slug?: string;
    api_key?: string;
    api_key_env?: string;
    model?: string;
    timeout?: number;
    max_tokens?: number;
    endpoint_name?: string;
  }>();

  const apiType = (body.api_type ?? '').trim().toLowerCase();
  const baseUrl = (body.base_url ?? '').trim();
  const providerSlug = (body.provider_slug ?? '').trim() || undefined;
  const model = (body.model ?? '').trim();
  const endpointName = (body.endpoint_name ?? '').trim() || 'test-endpoint';

  if (!apiType) return c.json({ error: 'api_type 不能为空' }, 400);
  if (!baseUrl) return c.json({ error: 'base_url 不能为空' }, 400);
  if (!model) return c.json({ error: 'model 不能为空' }, 400);

  const apiKey = resolveApiKeyValue(body.api_key, body.api_key_env, providerSlug);
  if (!apiKey) {
    return c.json({ error: '未找到可用 API Key，请输入 API Key 或检查环境变量配置' }, 400);
  }

  const endpoint = {
    name: endpointName,
    model,
    api_type: apiType,
    base_url: baseUrl,
    api_key_env: body.api_key_env ?? '',
    timeout: Math.max(10, Number(body.timeout ?? 30)),
    max_tokens: Math.max(1, Math.min(Number(body.max_tokens ?? 8), 16)),
  };

  const startedAt = performance.now();
  try {
    const result = await requestChatCompletion({
      endpoint,
      apiKey,
      systemPrompt: 'Reply with exactly OK.',
      messages: [{ role: 'user', content: 'ping' }],
    });
    return c.json({
      ok: true,
      latency_ms: Math.round(performance.now() - startedAt),
      preview: result.content.slice(0, 120),
    });
  } catch (e) {
    const raw = String(e).toLowerCase();
    let friendly = String(e);
    if (
      raw.includes('connect') ||
      raw.includes('connection refused') ||
      raw.includes('no route') ||
      raw.includes('unreachable')
    ) {
      friendly = '无法连接到服务商，请检查 API 地址和网络连接';
    } else if (
      raw.includes('401') ||
      raw.includes('unauthorized') ||
      raw.includes('invalid api key') ||
      raw.includes('authentication')
    ) {
      friendly = 'API Key 无效或已过期，请检查后重试';
    } else if (raw.includes('403') || raw.includes('forbidden') || raw.includes('permission')) {
      friendly = 'API Key 权限不足，请确认已开通模型访问权限';
    } else if (raw.includes('404') || raw.includes('not found')) {
      friendly = 'API 地址或模型有误，服务商未返回有效响应';
    } else if (raw.includes('timeout') || raw.includes('timed out') || raw.includes('abort')) {
      friendly = '请求超时，请检查网络、代理或服务商响应速度';
    } else if (friendly.length > 150) {
      friendly = friendly.slice(0, 150) + '…';
    }
    return c.json(
      {
        ok: false,
        latency_ms: Math.round(performance.now() - startedAt),
        error: friendly,
      },
      200
    );
  }
});
