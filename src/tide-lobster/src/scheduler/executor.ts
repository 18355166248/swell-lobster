/**
 * 执行调度任务：用 ChatService 跑 `task_prompt`，带超时，结果写入 `scheduled_task_runs`。
 */

import { settings } from '../config.js';
import { ChatService } from '../chat/service.js';
import { schedulerStore } from './store.js';
import type { ScheduledTask, TaskTriggeredBy } from './types.js';

/** 单次任务最大执行时长（毫秒），超时记为 timeout */
export const TASK_TIMEOUT_MS = 5 * 60 * 1000;

/** 展开 fetch / TLS 等嵌套 cause，便于日志与 scheduled_task_runs 可读 */
function formatErrorChain(err: unknown): string {
  const parts: string[] = [];
  let cur: unknown = err;
  for (let depth = 0; depth < 8 && cur; depth++) {
    if (cur instanceof Error) {
      let line = cur.message;
      const code = (cur as NodeJS.ErrnoException).code;
      if (typeof code === 'string') line += ` (${code})`;
      parts.push(line);
      cur = cur.cause;
    } else {
      parts.push(String(cur));
      break;
    }
  }
  return parts.join(' → ');
}

export class TaskExecutor {
  private readonly chatService = new ChatService(settings.projectRoot);

  /** 非流式单次 chat，成功或失败均 recordRun */
  async run(task: ScheduledTask, triggeredBy: TaskTriggeredBy = 'cron'): Promise<void> {
    const startTime = Date.now();
    try {
      const result = await Promise.race([
        this.chatService.chat({
          message: task.task_prompt,
          endpoint_name: task.endpoint_name ?? null,
        }),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('任务执行超时')), TASK_TIMEOUT_MS);
        }),
      ]);

      schedulerStore.recordRun(task.id, {
        triggered_by: triggeredBy,
        status: 'success',
        result: result.message,
        duration_ms: Date.now() - startTime,
      });
    } catch (error) {
      const message = formatErrorChain(error);
      const ep = task.endpoint_name?.trim() ? task.endpoint_name : 'default';
      console.error(
        `[scheduler] task ${task.id} "${task.name}" endpoint=${ep} failed:`,
        message
      );

      schedulerStore.recordRun(task.id, {
        triggered_by: triggeredBy,
        status: message === '任务执行超时' ? 'timeout' : 'error',
        result: message,
        duration_ms: Date.now() - startTime,
      });
    }
  }
}

export const taskExecutor = new TaskExecutor();
