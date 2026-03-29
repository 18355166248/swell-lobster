/**
 * 定时任务与执行记录类型（表 `scheduler_tasks` / `scheduled_task_runs`）。
 */

export type ScheduledTaskTriggerType = 'cron';
export type TaskRunStatus = 'success' | 'error' | 'timeout';
export type TaskTriggeredBy = 'cron' | 'manual';

/** 一条可调度任务（prompt 由 LLM 执行） */
export interface ScheduledTask {
  id: string;
  name: string;
  description?: string;
  cron_expr?: string;
  task_prompt: string;
  endpoint_name?: string;
  trigger_type: ScheduledTaskTriggerType;
  enabled: boolean;
  next_run_at?: string;
  created_at: string;
  updated_at: string;
}

/** 单次运行结果（成功 / 失败 / 超时） */
export interface TaskRun {
  id: string;
  task_id: string;
  triggered_by: TaskTriggeredBy;
  status: TaskRunStatus;
  result?: string;
  duration_ms?: number;
  created_at: string;
}

export interface ScheduledTaskCreateInput {
  name: string;
  description?: string;
  cron_expr?: string;
  task_prompt: string;
  endpoint_name?: string;
  trigger_type: ScheduledTaskTriggerType;
  enabled?: boolean;
  next_run_at?: string;
}
