/**
 * 定时任务与运行历史的 SQLite 访问层（`scheduler_tasks` / `scheduled_task_runs`）。
 */

import { randomUUID } from 'node:crypto';
import { getDb } from '../db/index.js';
import type {
  ScheduledTask,
  ScheduledTaskCreateInput,
  TaskRun,
  TaskRunStatus,
  TaskTriggeredBy,
} from './types.js';

function nowIso(): string {
  return new Date().toISOString();
}

/** 任务表行 → ScheduledTask（兼容历史列名 prompt / task_prompt） */
function mapTaskRow(row: Record<string, unknown>): ScheduledTask {
  return {
    id: String(row.id),
    name: String(row.name),
    description: row.description ? String(row.description) : undefined,
    cron_expr: row.cron_expr ? String(row.cron_expr) : undefined,
    task_prompt: String(row.task_prompt ?? row.prompt ?? ''),
    endpoint_name: row.endpoint_name ? String(row.endpoint_name) : undefined,
    trigger_type: 'cron',
    enabled: Boolean(row.enabled),
    next_run_at: row.next_run_at ? String(row.next_run_at) : undefined,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at ?? row.created_at),
  };
}

/** 运行记录表行 → TaskRun */
function mapRunRow(row: Record<string, unknown>): TaskRun {
  return {
    id: String(row.id),
    task_id: String(row.task_id),
    triggered_by: row.triggered_by as TaskTriggeredBy,
    status: row.status as TaskRunStatus,
    result: row.result ? String(row.result) : undefined,
    duration_ms:
      typeof row.duration_ms === 'number' ? row.duration_ms : Number(row.duration_ms ?? 0) || 0,
    created_at: String(row.created_at),
  };
}

export class SchedulerStore {
  private readonly db = getDb();

  /** 全部任务，按创建时间倒序 */
  list(): ScheduledTask[] {
    const rows = this.db
      .prepare(`SELECT * FROM scheduler_tasks ORDER BY created_at DESC`)
      .all() as Record<string, unknown>[];
    return rows.map(mapTaskRow);
  }

  /** 按 id 查询单条任务 */
  get(id: string): ScheduledTask | undefined {
    const row = this.db.prepare(`SELECT * FROM scheduler_tasks WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? mapTaskRow(row) : undefined;
  }

  /** 插入任务；legacy 列 task_type / trigger_config / prompt 与新版字段同步写入 */
  create(input: ScheduledTaskCreateInput): ScheduledTask {
    const id = randomUUID();
    const now = nowIso();
    this.db
      .prepare(
        `INSERT INTO scheduler_tasks (
          id, name, description, cron_expr, task_prompt, endpoint_name, trigger_type,
          enabled, next_run_at, created_at, updated_at,
          task_type, trigger_config, prompt
        ) VALUES (?, ?, ?, ?, ?, ?, 'cron', ?, ?, ?, ?, 'task', '{}', ?)`
      )
      .run(
        id,
        input.name.trim(),
        input.description?.trim() || null,
        input.cron_expr ?? null,
        input.task_prompt.trim(),
        input.endpoint_name?.trim() || null,
        input.enabled === false ? 0 : 1,
        input.next_run_at ?? null,
        now,
        now,
        input.task_prompt.trim()
      );
    return this.get(id)!;
  }

  /** 部分更新；task_prompt 变更时同时写 prompt 列以兼容旧读路径 */
  update(
    id: string,
    patch: Partial<
      Pick<
        ScheduledTask,
        'name' | 'description' | 'cron_expr' | 'task_prompt' | 'endpoint_name' | 'enabled' | 'next_run_at'
      >
    >
  ): ScheduledTask {
    const existing = this.get(id);
    if (!existing) throw new Error(`scheduled task not found: ${id}`);

    const updates: string[] = [];
    const params: unknown[] = [];
    if (patch.name !== undefined) {
      updates.push('name = ?');
      params.push(patch.name.trim());
    }
    if (patch.description !== undefined) {
      updates.push('description = ?');
      params.push(patch.description?.trim() || null);
    }
    if (patch.cron_expr !== undefined) {
      updates.push('cron_expr = ?');
      params.push(patch.cron_expr || null);
    }
    if (patch.task_prompt !== undefined) {
      updates.push('task_prompt = ?');
      updates.push('prompt = ?');
      params.push(patch.task_prompt.trim(), patch.task_prompt.trim());
    }
    if (patch.endpoint_name !== undefined) {
      updates.push('endpoint_name = ?');
      params.push(patch.endpoint_name?.trim() || null);
    }
    if (patch.enabled !== undefined) {
      updates.push('enabled = ?');
      params.push(patch.enabled ? 1 : 0);
    }
    if (patch.next_run_at !== undefined) {
      updates.push('next_run_at = ?');
      params.push(patch.next_run_at || null);
    }
    if (updates.length === 0) return existing;

    updates.push('updated_at = ?');
    params.push(nowIso(), id);
    this.db.prepare(`UPDATE scheduler_tasks SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    return this.get(id)!;
  }

  /** 删除任务（外键会级联删除运行记录） */
  delete(id: string): void {
    this.db.prepare(`DELETE FROM scheduler_tasks WHERE id = ?`).run(id);
  }

  /**
   * 追加一条运行记录，并裁剪该任务超过 50 条的旧记录。
   */
  recordRun(taskId: string, run: Omit<TaskRun, 'id' | 'task_id' | 'created_at'>): void {
    const id = randomUUID();
    const createdAt = nowIso();
    this.db
      .prepare(
        `INSERT INTO scheduled_task_runs (
          id, task_id, triggered_by, status, result, duration_ms, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        taskId,
        run.triggered_by,
        run.status,
        run.result ?? null,
        run.duration_ms ?? null,
        createdAt
      );
    this.db
      .prepare(`UPDATE scheduler_tasks SET updated_at = ? WHERE id = ?`)
      .run(createdAt, taskId);
    this.db
      .prepare(
        `DELETE FROM scheduled_task_runs
       WHERE task_id = ?
         AND id NOT IN (
           SELECT id FROM scheduled_task_runs
           WHERE task_id = ?
           ORDER BY created_at DESC
           LIMIT 50
         )`
      )
      .run(taskId, taskId);
  }

  /** 某任务最近若干次运行记录 */
  listRuns(taskId: string, limit = 10): TaskRun[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM scheduled_task_runs
         WHERE task_id = ?
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(taskId, limit) as Record<string, unknown>[];
    return rows.map(mapRunRow);
  }

}

export const schedulerStore = new SchedulerStore();
