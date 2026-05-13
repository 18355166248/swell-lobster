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
import { configEmailRouter } from './routes/configEmail.js';
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
import { agentRouter } from './routes/agent.js';
import { approvalsRouter } from './routes/approvals.js';
import { plansRouter } from './routes/plans.js';
import { cacheRouter } from './routes/cache.js';
import { notifyRouter } from './routes/notify.js';
import { extensionsRouter } from './routes/extensions.js';
import { observabilityRouter } from './routes/observability.js';
import { backupRouter } from './routes/backup.js';
import { authRouter } from './routes/auth.js';
import { requireAuthToken, DEFAULT_AUTH_EXEMPT_PATHS } from '../auth/middleware.js';
import { isRemoteRuntimeActive, readRemoteFlag } from '../auth/remoteMode.js';
import { getCorsOptions, createCorsOriginCheck } from './corsConfig.js';
import { resolveAppEnvPath, settings } from '../config.js';
import { AppError } from '../types/errors.js';

export function createApp(): Hono {
  const app = new Hono();

  // CORS（阶段 15a-3）：origin 白名单（默认 + SWELL_CORS_ORIGINS env），
  // null origin 拒绝；credentials 仅远程模式开启；allowHeaders 含 X-Auth-Token。
  const corsOpts = getCorsOptions();
  app.use(
    '*',
    cors({
      origin: createCorsOriginCheck(corsOpts.allowedOrigins),
      credentials: corsOpts.credentials,
      allowMethods: corsOpts.allowMethods,
      allowHeaders: corsOpts.allowHeaders,
    })
  );

  // 鉴权中间件（阶段 15a-2）：所有 /api/* 强制 X-Auth-Token / ?token= 校验，
  // 仅 health 与 shutdown 豁免；OPTIONS preflight 由 cors 中间件处理。
  // 测试运行时（VITEST）自动 bypass，避免破坏现有 19 个 route 测试。
  app.use('/api/*', requireAuthToken({ exempt: DEFAULT_AUTH_EXEMPT_PATHS }));

  // 全局错误处理：AppError 序列化为 { detail, code }，其余 fallback 为 { detail }
  app.onError((err, c) => {
    if (err instanceof AppError) {
      const status = err.httpStatus as 400 | 401 | 403 | 404 | 500 | 502 | 503 | 504;
      return c.json({ detail: err.detail, code: err.code }, status);
    }
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ detail: msg }, 500);
  });

  // 健康检查
  app.get('/api/health', (c) =>
    c.json({
      status: 'healthy',
      service: 'tide-lobster',
      pid: process.pid,
      project_root: settings.projectRoot,
      data_dir: settings.dataDir,
      env_path: resolveAppEnvPath(),
      runtime_mode: process.env.SWELL_DESKTOP_RUNTIME?.trim() || 'server',
      listen_host: settings.host,
      listen_port: settings.port,
      remote_mode_desired: readRemoteFlag(),
      remote_mode_active: isRemoteRuntimeActive(),
      exec_path: process.execPath,
    })
  );

  // 优雅关闭（由桌面端在退出前调用）
  app.post('/api/shutdown', (c) => {
    setTimeout(() => process.kill(process.pid, 'SIGTERM'), 50);
    return c.json({ ok: true });
  });

  // Config 路由组
  app.route('/', configRouter);
  app.route('/', configEndpointsRouter);
  app.route('/', configEnvRouter);
  app.route('/', configEmailRouter);
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
  app.route('/', agentRouter); // /api/agent/* — 子 Agent 委托
  app.route('/', approvalsRouter); // /api/approvals/* — 工具审批请求
  app.route('/', plansRouter); // /api/plans/* — 执行计划
  app.route('/', cacheRouter); // /api/cache/* — 缓存管理
  app.route('/', notifyRouter); // /api/notify/* — 实时通知（SSE）
  app.route('/', extensionsRouter); // /api/extensions/* — 统一扩展目录与生命周期
  app.route('/', observabilityRouter); // /api/observability/* — 观测事件与指标
  app.route('/', backupRouter); // /api/backup/* — 备份与恢复
  app.route('/', authRouter); // /api/auth/* — 远程访问令牌（阶段 15a-1）

  return app;
}
