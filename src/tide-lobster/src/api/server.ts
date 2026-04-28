/**
 * Hono HTTP API server for Tide-Lobster
 *
 * 默认端口: 18900（与 OpenAkita 约定一致）。
 * Node 后端实现（原 Python 参考已移除）。
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
import { filesRouter } from './routes/files.js';
import { tokenStatsRouter } from './routes/tokenStats.js';
import { journalRouter } from './routes/journal.js';
import { logsRouter } from './routes/logs.js';
import { uploadRouter } from './routes/upload.js';
import { exportRouter } from './routes/export.js';
import { agentTemplatesRouter } from './routes/agentTemplates.js';

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

  // 优雅关闭（由桌面端在退出前调用）
  app.post('/api/shutdown', (c) => {
    setTimeout(() => process.kill(process.pid, 'SIGTERM'), 50);
    return c.json({ ok: true });
  });

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
  app.route('/', imRouter); // /api/im/* — 即时通讯通道配置与启停
  app.route('/', mcpRouter);
  app.route('/', memoryRouter);
  app.route('/', schedulerRouter);
  app.route('/', tokenStatsRouter);
  app.route('/', filesRouter);
  app.route('/', journalRouter);
  app.route('/', logsRouter);
  app.route('/', uploadRouter);
  app.route('/', exportRouter);
  app.route('/', agentTemplatesRouter); // /api/agent-templates/* — Agent 模板

  return app;
}
