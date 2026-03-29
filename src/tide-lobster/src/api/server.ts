/**
 * Hono HTTP API server for Tide-Lobster
 *
 * 对应 Python: swell_lobster/api/server.py
 * 默认端口: 18900（与 OpenAkita / swell_lobster 一致）
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { configRouter } from './routes/config.js';
import { configEndpointsRouter } from './routes/configEndpoints.js';
import { configEnvRouter } from './routes/configEnv.js';
import { configViewsRouter } from './routes/configViews.js';
import { configSkillsRouter } from './routes/configSkills.js';
import { identityRouter } from './routes/identity.js';
import { skillsRouter } from './routes/skills.js';
import { chatRouter } from './routes/chat.js';
import { imRouter } from './routes/im.js';
import { mcpRouter } from './routes/mcp.js';
import { memoryRouter } from './routes/memory.js';
import { schedulerRouter } from './routes/scheduler.js';
import { tokenStatsRouter } from './routes/tokenStats.js';
import { webhooksRouter } from './routes/webhooks.js';

export function createApp(): Hono {
  const app = new Hono();

  // CORS — 与 Python 的 allow_origins=["*"] 一致
  app.use(
    '*',
    cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
    })
  );

  // 健康检查
  app.get('/api/health', (c) => c.json({ status: 'healthy', service: 'tide-lobster' }));

  // Config 路由组
  app.route('/', configRouter);
  app.route('/', configEndpointsRouter);
  app.route('/', configEnvRouter);
  app.route('/', configViewsRouter);
  app.route('/', configSkillsRouter);

  // 其他路由
  app.route('/', identityRouter);
  app.route('/', skillsRouter);
  app.route('/', chatRouter);
  app.route('/', imRouter);
  app.route('/', mcpRouter);
  app.route('/', memoryRouter);
  app.route('/', schedulerRouter);
  app.route('/', tokenStatsRouter);
  // Webhook 触发调度任务（与 scheduler 任务配置配合，见 webhooksRouter）
  app.route('/', webhooksRouter);

  return app;
}
