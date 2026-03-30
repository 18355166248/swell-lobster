/**
 * Config routes — 核心（工作区信息、热重载、服务重启）
 *
 * Node 后端实现（原 Python 参考已移除）。
 */

import { Hono } from 'hono';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { settings } from '../../config.js';

export const configRouter = new Hono();

configRouter.get('/api/config/workspace-info', (c) => {
  const root = settings.projectRoot;
  return c.json({
    workspace_path: root,
    workspace_name: root.split('/').pop() ?? root,
    env_exists: existsSync(resolve(root, '.env')),
    endpoints_exists: existsSync(resolve(root, 'data', 'llm_endpoints.json')),
  });
});

configRouter.post('/api/config/reload', (c) => {
  return c.json({ status: 'ok', reloaded: false, reason: 'agent not initialized' });
});

configRouter.post('/api/config/restart', (c) => {
  return c.json({ status: 'ok', message: 'restart not available in this mode' });
});
