/**
 * 调度任务 Webhook：凭 `X-Webhook-Secret` 触发 `trigger_type === 'webhook'` 的任务（异步 202）。
 */

import { Hono } from 'hono';
import { taskExecutor } from '../../scheduler/executor.js';
import { schedulerStore } from '../../scheduler/store.js';

export const webhooksRouter = new Hono();

/**
 * 外部系统通过 HTTP POST 手动触发「Webhook 型」调度任务。
 *
 * - 路径参数 `taskId`：SQLite 中的任务 id；任务必须存在、已启用且 `trigger_type === 'webhook'`。
 * - 请求头 `X-Webhook-Secret`：须与任务里保存的 `webhook_secret` 一致，否则 401（防误触与未授权调用）。
 * - 校验通过后异步执行任务（不阻塞 HTTP）；立即返回 202 Accepted，实际执行结果见调度器/任务日志。
 */
webhooksRouter.post('/api/webhooks/:taskId/trigger', async (c) => {
  const task = schedulerStore.get(c.req.param('taskId'));
  if (!task || !task.enabled) return c.json({ detail: 'Not found' }, 404);
  if (task.trigger_type !== 'webhook') return c.json({ detail: 'Not found' }, 404);

  const secret = c.req.header('X-Webhook-Secret');
  if (!secret || secret !== task.webhook_secret) {
    return c.json({ detail: 'Unauthorized' }, 401);
  }

  taskExecutor.run(task, 'webhook').catch((error) => {
    console.error('[scheduler.webhook] task run failed:', error);
  });
  return c.json({ message: 'Accepted' }, 202);
});
