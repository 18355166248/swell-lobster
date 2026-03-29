/**
 * 定时任务 API：任务 CRUD、运行历史、启停、Webhook 信息、自然语言转 Cron。
 */

import cron from 'node-cron';
import { Hono } from 'hono';
import { settings } from '../../config.js';
import { ChatService } from '../../chat/service.js';
import { cronManager } from '../../scheduler/cronManager.js';
import { taskExecutor } from '../../scheduler/executor.js';
import { schedulerStore } from '../../scheduler/store.js';
import type { ScheduledTask } from '../../scheduler/types.js';

export const schedulerRouter = new Hono();
const chatService = new ChatService(settings.projectRoot);

/** API 响应中不附带 runs 字段（runs 由独立接口拉取） */
function serializeTask(task: ScheduledTask) {
  return {
    ...task,
    runs: undefined,
  };
}

/** 创建/更新前的字段校验（Cron 需合法表达式；endpoint 须存在） */
function validateTaskInput(input: {
  name?: string;
  description?: string;
  cron_expr?: string;
  task_prompt?: string;
  endpoint_name?: string;
  enabled?: boolean;
}) {
  const name = input.name?.trim();
  const taskPrompt = input.task_prompt?.trim();
  if (!name) throw new Error('name is required');
  if (!taskPrompt) throw new Error('task_prompt is required');
  if (!input.cron_expr?.trim()) throw new Error('cron_expr is required');
  if (!cron.validate(input.cron_expr.trim())) throw new Error('invalid cron_expr');
  if (input.endpoint_name && !chatService.getEndpointConfig(input.endpoint_name)) {
    throw new Error(`endpoint not found: ${input.endpoint_name}`);
  }
}

/** 写库后同步 node-cron 与 next_run_at */
function syncTask(taskId: string): ScheduledTask {
  cronManager.refreshTask(taskId);
  return schedulerStore.get(taskId)!;
}

schedulerRouter.get('/api/scheduler/tasks', (c) => {
  const tasks = schedulerStore.list().map(serializeTask);
  return c.json({ tasks });
});

schedulerRouter.post('/api/scheduler/tasks', async (c) => {
  try {
    const body = await c.req.json<{
      name?: string;
      description?: string;
      cron_expr?: string;
      task_prompt?: string;
      endpoint_name?: string;
      enabled?: boolean;
    }>();
    validateTaskInput(body);
    const task = schedulerStore.create({
      name: body.name!.trim(),
      description: body.description?.trim(),
      cron_expr: body.cron_expr?.trim(),
      task_prompt: body.task_prompt!.trim(),
      endpoint_name: body.endpoint_name?.trim(),
      trigger_type: 'cron',
      enabled: body.enabled !== false,
    });
    const synced = syncTask(task.id);
    return c.json({ task: serializeTask(synced) }, 201);
  } catch (error) {
    return c.json({ detail: error instanceof Error ? error.message : String(error) }, 400);
  }
});

schedulerRouter.patch('/api/scheduler/tasks/:id', async (c) => {
  const id = c.req.param('id');
  const existing = schedulerStore.get(id);
  if (!existing) return c.json({ detail: 'task not found' }, 404);

  try {
    const body = await c.req.json<{
      name?: string;
      description?: string;
      cron_expr?: string;
      task_prompt?: string;
      endpoint_name?: string;
      enabled?: boolean;
    }>();
    validateTaskInput({
      name: body.name ?? existing.name,
      description: body.description ?? existing.description,
      cron_expr: body.cron_expr ?? existing.cron_expr,
      task_prompt: body.task_prompt ?? existing.task_prompt,
      endpoint_name: body.endpoint_name ?? existing.endpoint_name,
      enabled: body.enabled ?? existing.enabled,
    });
    schedulerStore.update(id, {
      name: body.name,
      description: body.description,
      cron_expr: body.cron_expr ?? existing.cron_expr,
      task_prompt: body.task_prompt,
      endpoint_name: body.endpoint_name,
      enabled: body.enabled,
      next_run_at: undefined,
    });
    const synced = syncTask(id);
    return c.json({ task: serializeTask(synced) });
  } catch (error) {
    return c.json({ detail: error instanceof Error ? error.message : String(error) }, 400);
  }
});

schedulerRouter.delete('/api/scheduler/tasks/:id', (c) => {
  const id = c.req.param('id');
  const task = schedulerStore.get(id);
  if (!task) return c.json({ detail: 'task not found' }, 404);
  cronManager.unscheduleTask(id);
  schedulerStore.delete(id);
  return c.json({ status: 'ok', id });
});

schedulerRouter.get('/api/scheduler/tasks/:id/runs', (c) => {
  const id = c.req.param('id');
  const task = schedulerStore.get(id);
  if (!task) return c.json({ detail: 'task not found' }, 404);
  return c.json({ runs: schedulerStore.listRuns(id) });
});

schedulerRouter.post('/api/scheduler/tasks/:id/run', async (c) => {
  const task = schedulerStore.get(c.req.param('id'));
  if (!task) return c.json({ detail: 'task not found' }, 404);
  await taskExecutor.run(task, 'manual');
  const refreshed = schedulerStore.get(task.id)!;
  return c.json({ task: serializeTask(refreshed), runs: schedulerStore.listRuns(task.id) });
});

schedulerRouter.post('/api/scheduler/tasks/:id/enable', (c) => {
  const task = schedulerStore.get(c.req.param('id'));
  if (!task) return c.json({ detail: 'task not found' }, 404);
  schedulerStore.update(task.id, { enabled: true });
  const synced = syncTask(task.id);
  return c.json({ task: serializeTask(synced) });
});

schedulerRouter.post('/api/scheduler/tasks/:id/disable', (c) => {
  const task = schedulerStore.get(c.req.param('id'));
  if (!task) return c.json({ detail: 'task not found' }, 404);
  schedulerStore.update(task.id, { enabled: false, next_run_at: undefined });
  cronManager.unscheduleTask(task.id);
  return c.json({ task: serializeTask(schedulerStore.get(task.id)!) });
});


schedulerRouter.post('/api/scheduler/nl-to-cron', async (c) => {
  const body = await c.req.json<{ text?: string; endpoint_name?: string }>();
  const text = body.text?.trim();
  if (!text) return c.json({ detail: 'text is required' }, 400);

  const prompt = `将以下时间描述转换为 Cron 表达式（5位格式）。
    只返回 Cron 表达式本身，不要其他内容。

    示例：
    - "每天早上9点" -> "0 9 * * *"
    - "每周一到周五下午6点" -> "0 18 * * 1-5"
    - "每小时" -> "0 * * * *"

    时间描述：${text}`;

  try {
    const result = await chatService.chat({
      message: prompt,
      endpoint_name: body.endpoint_name ?? null,
    });
    const cronExpr = result.message.trim().split(/\s+/).slice(0, 5).join(' ');
    if (!cron.validate(cronExpr)) throw new Error('model returned invalid cron expression');
    return c.json({ cron_expr: cronExpr });
  } catch (error) {
    return c.json({ detail: error instanceof Error ? error.message : String(error) }, 400);
  }
});
