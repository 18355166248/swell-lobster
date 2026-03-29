/**
 * 定时任务与执行记录类型（表 `scheduler_tasks` / `scheduled_task_runs`）。
 */

/** 触发方式：Cron 表达式或 HTTP Webhook */
export type ScheduledTaskTriggerType = 'cron' | 'webhook';
export type TaskRunStatus = 'success' | 'error' | 'timeout';
/** 实际触发来源（含手动「立即运行」） */
export type TaskTriggeredBy = 'cron' | 'webhook' | 'manual';

/** 一条可调度任务（prompt 由 LLM 执行） */
export interface ScheduledTask {
  id: string;
  name: string;
  description?: string;
  cron_expr?: string;
  task_prompt: string;
  endpoint_name?: string;
  trigger_type: ScheduledTaskTriggerType;
  webhook_secret?: string;
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

/** 创建任务时的输入（webhook 密钥由 store 生成） */
export interface ScheduledTaskCreateInput {
  name: string;
  description?: string;
  cron_expr?: string;
  task_prompt: string;
  endpoint_name?: string;
  trigger_type: ScheduledTaskTriggerType;
  webhook_secret?: string;
  enabled?: boolean;
  next_run_at?: string;
}
