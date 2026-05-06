import { randomUUID } from 'node:crypto';
import { getDb } from '../db/index.js';
import { ExtensionSource } from '../extensions/types.js';
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
  // 阶段 13：审计补来源字段，旧记录可能为 null
  extension_source: ExtensionSource | null;
  extension_id: string | null;
  created_at: string;
}

const MAX_SUMMARY_CHARS = 500;

const VALID_EXTENSION_SOURCES: ReadonlySet<string> = new Set<ExtensionSource>([
  ExtensionSource.builtin,
  ExtensionSource.skill,
  ExtensionSource.mcp,
]);

function normalizeExtensionSource(raw: unknown): ExtensionSource | null {
  if (typeof raw !== 'string' || !VALID_EXTENSION_SOURCES.has(raw)) return null;
  return raw as ExtensionSource;
}

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
    extension_source: normalizeExtensionSource(row.extension_source),
    extension_id: row.extension_id ? String(row.extension_id) : null,
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
    extensionSource?: ExtensionSource | null;
    extensionId?: string | null;
  }): void {
    const summary =
      input.outputSummary.length > MAX_SUMMARY_CHARS
        ? input.outputSummary.slice(0, MAX_SUMMARY_CHARS) + '...'
        : input.outputSummary;

    this.db
      .prepare(
        `INSERT INTO tool_execution_audit (
          id, session_id, tool_name, approval_request_id,
          risk_level, decision, duration_ms, status, output_summary,
          extension_source, extension_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        input.extensionSource ?? null,
        input.extensionId ?? null,
        new Date().toISOString()
      );
  }

  listRecent(options?: {
    sessionId?: string;
    limit?: number;
    source?: ExtensionSource;
  }): ToolExecutionAuditRecord[] {
    const limit = Math.min(Math.max(Math.floor(options?.limit ?? 50), 1), 200);
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (options?.sessionId) {
      conditions.push('session_id = ?');
      params.push(options.sessionId);
    }
    if (options?.source) {
      conditions.push('extension_source = ?');
      params.push(options.source);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT * FROM tool_execution_audit ${where} ORDER BY created_at DESC LIMIT ?`;
    const rows = this.db.prepare(sql).all(...params, limit) as Record<string, unknown>[];
    return rows.map(normalizeRow);
  }
}

export const executionAuditService = new ExecutionAuditService();
