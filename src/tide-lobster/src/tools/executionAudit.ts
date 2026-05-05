import { randomUUID } from 'node:crypto';
import { getDb } from '../db/index.js';
import type { ToolRiskLevel } from './types.js';

export type AuditDecision = 'approved' | 'denied' | 'expired' | 'skipped';
export type AuditStatus = 'success' | 'failed';

export interface ToolExecutionAuditRecord {
  id: string;
  session_id: string;
  tool_name: string;
  approval_request_id: string | null;
  risk_level: ToolRiskLevel;
  decision: AuditDecision;
  duration_ms: number;
  status: AuditStatus;
  output_summary: string;
  created_at: string;
}

const MAX_SUMMARY_CHARS = 500;

function normalizeRow(row: Record<string, unknown>): ToolExecutionAuditRecord {
  return {
    id: String(row.id ?? ''),
    session_id: String(row.session_id ?? ''),
    tool_name: String(row.tool_name ?? ''),
    approval_request_id: row.approval_request_id ? String(row.approval_request_id) : null,
    risk_level: String(row.risk_level ?? 'readonly') as ToolRiskLevel,
    decision: String(row.decision ?? 'skipped') as AuditDecision,
    duration_ms: Number(row.duration_ms ?? 0),
    status: String(row.status ?? 'success') as AuditStatus,
    output_summary: String(row.output_summary ?? ''),
    created_at: String(row.created_at ?? ''),
  };
}

class ExecutionAuditService {
  private readonly db = getDb();

  record(input: {
    sessionId: string;
    toolName: string;
    approvalRequestId?: string | null;
    riskLevel: ToolRiskLevel;
    decision: AuditDecision;
    durationMs: number;
    status: AuditStatus;
    outputSummary: string;
  }): void {
    const summary =
      input.outputSummary.length > MAX_SUMMARY_CHARS
        ? input.outputSummary.slice(0, MAX_SUMMARY_CHARS) + '...'
        : input.outputSummary;

    this.db
      .prepare(
        `INSERT INTO tool_execution_audit (
          id, session_id, tool_name, approval_request_id,
          risk_level, decision, duration_ms, status, output_summary, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        randomUUID(),
        input.sessionId,
        input.toolName,
        input.approvalRequestId ?? null,
        input.riskLevel,
        input.decision,
        input.durationMs,
        input.status,
        summary,
        new Date().toISOString()
      );
  }

  listRecent(options?: { sessionId?: string; limit?: number }): ToolExecutionAuditRecord[] {
    const limit = Math.min(Math.max(Math.floor(options?.limit ?? 50), 1), 200);
    const rows = options?.sessionId
      ? (this.db
          .prepare(
            `SELECT * FROM tool_execution_audit
             WHERE session_id = ?
             ORDER BY created_at DESC LIMIT ?`
          )
          .all(options.sessionId, limit) as Record<string, unknown>[])
      : (this.db
          .prepare(
            `SELECT * FROM tool_execution_audit
             ORDER BY created_at DESC LIMIT ?`
          )
          .all(limit) as Record<string, unknown>[]);
    return rows.map(normalizeRow);
  }
}

export const executionAuditService = new ExecutionAuditService();
