import { randomUUID } from 'node:crypto';
import { getDb } from '../db/index.js';
import type {
  ExecutionPlan,
  ExecutionStep,
  PlanStatus,
  StepMode,
  StepStatus,
} from '../planner/planSchema.js';

function normalizeStepRow(row: Record<string, unknown>): ExecutionStep {
  return {
    id: String(row.id ?? ''),
    planId: String(row.plan_id ?? ''),
    stepOrder: Number(row.step_order ?? 0),
    title: String(row.title ?? ''),
    description: String(row.description ?? ''),
    mode: String(row.mode ?? 'main_agent') as StepMode,
    templateId: row.template_id ? String(row.template_id) : null,
    status: String(row.status ?? 'pending') as StepStatus,
    dependsOn: row.depends_on_json ? (JSON.parse(String(row.depends_on_json)) as string[]) : [],
    outputSummary: row.output_summary ? String(row.output_summary) : null,
    errorMessage: row.error_message ? String(row.error_message) : null,
    startedAt: row.started_at ? String(row.started_at) : null,
    completedAt: row.completed_at ? String(row.completed_at) : null,
  };
}

function normalizePlanRow(row: Record<string, unknown>, steps: ExecutionStep[]): ExecutionPlan {
  return {
    id: String(row.id ?? ''),
    sessionId: String(row.session_id ?? ''),
    goal: String(row.goal ?? ''),
    status: String(row.status ?? 'draft') as PlanStatus,
    steps,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

class PlanStore {
  private readonly db = getDb();

  createPlan(input: {
    sessionId: string;
    goal: string;
    steps: Array<{
      title: string;
      description: string;
      mode: StepMode;
      templateId?: string | null;
      dependsOn?: string[];
    }>;
  }): ExecutionPlan {
    const planId = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO execution_plans (id, session_id, goal, status, created_at, updated_at)
         VALUES (?, ?, ?, 'draft', ?, ?)`
      )
      .run(planId, input.sessionId, input.goal, now, now);

    for (let i = 0; i < input.steps.length; i++) {
      const s = input.steps[i];
      const stepId = randomUUID();
      this.db
        .prepare(
          `INSERT INTO execution_plan_steps
             (id, plan_id, step_order, title, description, mode, template_id, status, depends_on_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
        )
        .run(
          stepId,
          planId,
          i,
          s.title,
          s.description,
          s.mode,
          s.templateId ?? null,
          JSON.stringify(s.dependsOn ?? [])
        );
    }

    return this.getById(planId)!;
  }

  getById(id: string): ExecutionPlan | undefined {
    const row = this.db
      .prepare(`SELECT * FROM execution_plans WHERE id = ?`)
      .get(id) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    const stepRows = this.db
      .prepare(`SELECT * FROM execution_plan_steps WHERE plan_id = ? ORDER BY step_order ASC`)
      .all(id) as Record<string, unknown>[];
    return normalizePlanRow(row, stepRows.map(normalizeStepRow));
  }

  getBySessionId(sessionId: string): ExecutionPlan | undefined {
    const row = this.db
      .prepare(
        `SELECT * FROM execution_plans WHERE session_id = ? ORDER BY created_at DESC LIMIT 1`
      )
      .get(sessionId) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return this.getById(String(row.id));
  }

  setPlanStatus(id: string, status: PlanStatus): void {
    this.db
      .prepare(`UPDATE execution_plans SET status = ?, updated_at = ? WHERE id = ?`)
      .run(status, new Date().toISOString(), id);
  }

  setStepStatus(
    stepId: string,
    status: StepStatus,
    extra?: { outputSummary?: string; errorMessage?: string }
  ): ExecutionStep | undefined {
    const now = new Date().toISOString();
    if (status === 'running') {
      this.db
        .prepare(`UPDATE execution_plan_steps SET status = ?, started_at = ? WHERE id = ?`)
        .run(status, now, stepId);
    } else if (status === 'completed' || status === 'failed' || status === 'skipped') {
      this.db
        .prepare(
          `UPDATE execution_plan_steps
           SET status = ?, completed_at = ?,
               output_summary = COALESCE(?, output_summary),
               error_message = COALESCE(?, error_message)
           WHERE id = ?`
        )
        .run(status, now, extra?.outputSummary ?? null, extra?.errorMessage ?? null, stepId);
    }
    const row = this.db
      .prepare(`SELECT * FROM execution_plan_steps WHERE id = ?`)
      .get(stepId) as Record<string, unknown> | undefined;
    return row ? normalizeStepRow(row) : undefined;
  }
}

export const planStore = new PlanStore();
