/**
 * Config routes — LLM 端点管理
 *
 * 对应 Python: swell_lobster/api/routes/config_endpoints.py
 *
 * 接口：
 * - GET  /api/config/endpoints    读取 data/llm_endpoints.json
 * - POST /api/config/endpoints    写入 data/llm_endpoints.json
 * - GET  /api/config/providers    服务商列表
 * - POST /api/config/list-models  拉取模型列表
 */

import { Hono } from 'hono';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { settings } from '../../config.js';
import { listProviders, providerInfoToDict } from '../../llm/registries/index.js';
import { listModelsAnthropic, listModelsOpenAI } from '../../llm/bridge.js';

export const configEndpointsRouter = new Hono();

const dataDir = () => resolve(settings.projectRoot, 'data');

// ── GET /api/config/endpoints ──────────────────────────────────────────────────

configEndpointsRouter.get('/api/config/endpoints', (c) => {
  const epPath = resolve(dataDir(), 'llm_endpoints.json');
  if (!existsSync(epPath)) return c.json({ endpoints: [], raw: {} });
  try {
    const data = JSON.parse(readFileSync(epPath, 'utf-8'));
    return c.json({ endpoints: data.endpoints ?? [], raw: data });
  } catch (e) {
    return c.json({ error: String(e), endpoints: [], raw: {} });
  }
});

// ── POST /api/config/endpoints ─────────────────────────────────────────────────

configEndpointsRouter.post('/api/config/endpoints', async (c) => {
  const body = await c.req.json<{ content: Record<string, unknown> }>();
  const dir = dataDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    resolve(dir, 'llm_endpoints.json'),
    JSON.stringify(body.content, null, 2) + '\n',
    'utf-8'
  );
  return c.json({ status: 'ok' });
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
