export type PlanStatus = 'draft' | 'running' | 'completed' | 'failed' | 'cancelled';
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
export type StepMode = 'main_agent' | 'delegate_agent';

export interface PlanMetrics {
  planningDurationMs: number;
  executionDurationMs: number;
  totalDurationMs: number;
  delegateCount: number;
  approvalWaitCount: number;
  approvalWaitDurationMs: number;
  failedStepId?: string | null;
  failedStepTitle?: string | null;
  failedStepOrder?: number | null;
}

export interface ExecutionPlan {
  id: string;
  sessionId: string;
  goal: string;
  status: PlanStatus;
  metrics: PlanMetrics;
  steps: ExecutionStep[];
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionStep {
  id: string;
  planId: string;
  stepOrder: number;
  title: string;
  description: string;
  mode: StepMode;
  templateId?: string | null;
  status: StepStatus;
  dependsOn: string[];
  outputSummary?: string | null;
  errorMessage?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  durationMs?: number | null;
}

/** 计划生成的最小 JSON 结构（LLM 输出后校验用） */
export interface PlanDraft {
  goal: string;
  steps: Array<{
    title: string;
    description: string;
    mode: StepMode;
    templateId?: string;
    dependsOn?: string[];
  }>;
}

export type PlanEvent =
  | { type: 'plan_created'; plan: ExecutionPlan }
  | { type: 'plan_step_started'; planId: string; step: ExecutionStep }
  | { type: 'plan_step_completed'; planId: string; step: ExecutionStep }
  | { type: 'plan_step_failed'; planId: string; step: ExecutionStep }
  | { type: 'plan_completed'; plan: ExecutionPlan }
  | { type: 'plan_failed'; plan: ExecutionPlan };
