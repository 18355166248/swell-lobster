/**
 * Config routes — 应用视图与 Skills 配置
 *
 * 对应 Python: swell_lobster/api/routes/config_views.py
 *
 * 接口：
 * - GET  /api/config/skills          读取 data/skills.json
 * - POST /api/config/skills          写入 data/skills.json
 * - GET  /api/config/disabled-views  读取隐藏模块视图列表
 * - POST /api/config/disabled-views  写入隐藏模块视图列表
 */

import { Hono } from 'hono';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { settings } from '../../config.js';

export const configViewsRouter = new Hono();

const dataDir = () => resolve(settings.projectRoot, 'data');

function writeJson(path: string, data: unknown): void {
  mkdirSync(resolve(path, '..'), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

// ── Skills ─────────────────────────────────────────────────────────────────────

configViewsRouter.get('/api/config/skills', (c) => {
  const path = resolve(dataDir(), 'skills.json');
  if (!existsSync(path)) return c.json({ skills: {} });
  try {
    return c.json({ skills: JSON.parse(readFileSync(path, 'utf-8')) });
  } catch (e) {
    return c.json({ error: String(e), skills: {} });
  }
});

configViewsRouter.post('/api/config/skills', async (c) => {
  const body = await c.req.json<{ content: Record<string, unknown> }>();
  writeJson(resolve(dataDir(), 'skills.json'), body.content);
  return c.json({ status: 'ok' });
});

// ── Disabled Views ─────────────────────────────────────────────────────────────

configViewsRouter.get('/api/config/disabled-views', (c) => {
  const path = resolve(dataDir(), 'disabled_views.json');
  if (!existsSync(path)) return c.json({ disabled_views: [] });
  try {
    const data = JSON.parse(readFileSync(path, 'utf-8'));
    return c.json({ disabled_views: data.disabled_views ?? [] });
  } catch (e) {
    return c.json({ error: String(e), disabled_views: [] });
  }
});

configViewsRouter.post('/api/config/disabled-views', async (c) => {
  const body = await c.req.json<{ views: string[] }>();
  writeJson(resolve(dataDir(), 'disabled_views.json'), {
    disabled_views: body.views,
  });
  return c.json({ status: 'ok', disabled_views: body.views });
});
