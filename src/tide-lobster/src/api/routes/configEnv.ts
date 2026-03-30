/**
 * Config routes — .env 环境变量管理
 *
 * Node 后端实现（原 Python 参考已移除）。
 *
 * 接口：
 * - GET  /api/config/env   读取 .env（敏感值脱敏）
 * - POST /api/config/env   更新 .env 键值（合并，保留注释）
 */

import { Hono } from 'hono';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { settings } from '../../config.js';
import { parseEnv, updateEnvContent } from '../../utils/envUtils.js';

export const configEnvRouter = new Hono();

// 敏感键名匹配
const SENSITIVE = /(TOKEN|SECRET|PASSWORD|KEY|APIKEY)/i;
// 合法环境变量键名
const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function envPath(): string {
  return resolve(settings.projectRoot, '.env');
}

function maskValue(key: string, value: string): string {
  if (SENSITIVE.test(key) && value) {
    return value.length > 6 ? value.slice(0, 4) + '***' + value.slice(-2) : '***';
  }
  return value;
}

// ── GET /api/config/env ────────────────────────────────────────────────────────

configEnvRouter.get('/api/config/env', (c) => {
  const path = envPath();
  if (!existsSync(path)) return c.json({ env: {}, raw: '' });

  const content = readFileSync(path, 'utf-8');
  const env = parseEnv(content);
  const masked = Object.fromEntries(Object.entries(env).map(([k, v]) => [k, maskValue(k, v)]));
  return c.json({ env: masked, masked, raw: '' });
});

// ── POST /api/config/env ───────────────────────────────────────────────────────

configEnvRouter.post('/api/config/env', async (c) => {
  const body = await c.req.json<{ entries: Record<string, string> }>();
  const entries = body.entries ?? {};

  for (const key of Object.keys(entries)) {
    if (!KEY_PATTERN.test(key)) {
      return c.json({ error: `Invalid env key: ${JSON.stringify(key)}` }, 400);
    }
  }

  const path = envPath();
  const existing = existsSync(path) ? readFileSync(path, 'utf-8') : '';
  const newContent = updateEnvContent(existing, entries);

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, newContent, 'utf-8');

  return c.json({ status: 'ok', updated_keys: Object.keys(entries) });
});
