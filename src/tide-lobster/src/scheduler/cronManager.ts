/**
 * 基于 node-cron 的 Cron 调度：维护 taskId → job 映射，并在每次触发后刷新 `next_run_at`。
 * 时区固定为 Asia/Shanghai，与 `node-cron` 的 getNextRun 扩展字段兼容。
 */

import cron from 'node-cron';
import { taskExecutor } from './executor.js';
import { schedulerStore } from './store.js';
import type { ScheduledTask } from './types.js';

/** node-cron 任务对象上可能存在的下一跑时间查询（类型因版本略有差异） */
type JobWithNextRun = cron.ScheduledTask & {
  getNextRun?: () => Date | null;
  destroy?: () => void;
};

/** 将 Date 转为 ISO 字符串；无效则 undefined */
function toIso(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return value.toISOString();
  }
  return undefined;
}

export class CronManager {
  private readonly jobs = new Map<string, JobWithNextRun>();

  /** 注册或更新 Cron job；未启用 / 非 cron / 表达式非法时会取消调度并清空 next_run */
  scheduleTask(task: ScheduledTask): void {
    if (!task.enabled || task.trigger_type !== 'cron' || !task.cron_expr) {
      this.unscheduleTask(task.id);
      schedulerStore.update(task.id, { next_run_at: undefined });
      return;
    }
    if (!cron.validate(task.cron_expr)) {
      throw new Error(`无效的 Cron 表达式: ${task.cron_expr}`);
    }

    this.unscheduleTask(task.id);
    const taskId = task.id;
    const job = cron.schedule(
      task.cron_expr,
      async () => {
        // 与 POST /run「立即执行」一致：每次从库取最新 endpoint_name / task_prompt，避免闭包里的旧快照
        const latest = schedulerStore.get(taskId);
        if (!latest?.enabled || latest.trigger_type !== 'cron') return;

        await taskExecutor.run(latest, 'cron');
        const current = this.jobs.get(taskId);
        schedulerStore.update(taskId, {
          next_run_at: toIso(current?.getNextRun?.()),
        });
      },
      { timezone: 'Asia/Shanghai' }
    ) as JobWithNextRun;
    this.jobs.set(task.id, job);
    schedulerStore.update(task.id, {
      next_run_at: toIso(job.getNextRun?.()),
    });
  }

  /** 停止并销毁 job，从内存表移除 */
  unscheduleTask(taskId: string): void {
    const job = this.jobs.get(taskId);
    if (job) {
      job.stop();
      job.destroy?.();
      this.jobs.delete(taskId);
    }
  }

  /** 进程启动时：为所有 enabled 且 trigger 为 cron 的任务建表 */
  loadAll(): void {
    const tasks = schedulerStore
      .list()
      .filter((task) => task.enabled && task.trigger_type === 'cron');
    for (const task of tasks) {
      try {
        this.scheduleTask(task);
      } catch (error) {
        console.error(`[scheduler] failed to schedule ${task.name}:`, error);
      }
    }
  }

  /** 配置变更后：按 DB 最新行重新 schedule 或 unschedule */
  refreshTask(taskId: string): void {
    const task = schedulerStore.get(taskId);
    if (!task) {
      this.unscheduleTask(taskId);
      return;
    }
    this.scheduleTask(task);
  }

  /** 关闭进程前取消全部 Cron */
  shutdown(): void {
    for (const taskId of this.jobs.keys()) {
      this.unscheduleTask(taskId);
    }
  }
}

export const cronManager = new CronManager();
