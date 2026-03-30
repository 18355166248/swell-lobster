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
import { listProviders, providerInfoToDict } from '../../llm/registries/index.js';
import { listModelsAnthropic, listModelsOpenAI } from '../../llm/bridge.js';

export const configEndpointsRouter = new Hono();
const store = new EndpointStore();

configEndpointsRouter.get('/api/config/endpoints', (c) => {
  const endpoints = store.listEndpoints();
  return c.json({ endpoints });
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
  }>();

  const apiType = (body.api_type ?? '').trim().toLowerCase();
  const baseUrl = (body.base_url ?? '').trim();
  let apiKey = (body.api_key ?? '').trim();
  const providerSlug = (body.provider_slug ?? '').trim() || undefined;

  if (!apiType) return c.json({ error: 'api_type 不能为空', models: [] });
  if (!baseUrl) return c.json({ error: 'base_url 不能为空', models: [] });
  if (!apiKey) apiKey = 'local'; // 本地服务商不需要 API Key

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
