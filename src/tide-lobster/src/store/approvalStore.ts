import { randomUUID } from 'node:crypto';
import { getDb } from '../db/index.js';
import type { ToolRiskLevel } from '../tools/types.js';

export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired';

export interface ToolApprovalRequest {
  id: string;
  session_id: string;
  tool_name: string;
  risk_level: ToolRiskLevel;
  arguments_json: string;
  summary: string;
  status: ApprovalStatus;
  created_at: string;
  resolved_at?: string | null;
  resolved_by?: string | null;
  resolution_note?: string | null;
}

type ApprovalDecision = Extract<ApprovalStatus, 'approved' | 'denied' | 'expired'>;

type Waiter = {
  resolve: (request: ToolApprovalRequest) => void;
  reject: (error: unknown) => void;
};

function normalizeRow(row: Record<string, unknown>): ToolApprovalRequest {
  return {
    id: String(row.id ?? ''),
    session_id: String(row.session_id ?? ''),
    tool_name: String(row.tool_name ?? ''),
    risk_level: String(row.risk_level ?? 'readonly') as ToolRiskLevel,
    arguments_json: String(row.arguments_json ?? '{}'),
    summary: String(row.summary ?? ''),
    status: String(row.status ?? 'pending') as ApprovalStatus,
    created_at: String(row.created_at ?? ''),
    resolved_at: row.resolved_at ? String(row.resolved_at) : null,
    resolved_by: row.resolved_by ? String(row.resolved_by) : null,
    resolution_note: row.resolution_note ? String(row.resolution_note) : null,
  };
}

export class ApprovalStore {
  private readonly db = getDb();
  private readonly waiters = new Map<string, Set<Waiter>>();

  createRequest(input: {
    sessionId: string;
    toolName: string;
    riskLevel: ToolRiskLevel;
    arguments: Record<string, unknown>;
    summary: string;
  }): ToolApprovalRequest {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO tool_approval_requests (
          id, session_id, tool_name, risk_level, arguments_json, summary, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`
      )
      .run(
        id,
        input.sessionId,
        input.toolName,
        input.riskLevel,
        JSON.stringify(input.arguments ?? {}),
        input.summary,
        createdAt
      );
    return this.getById(id)!;
  }

  getById(id: string): ToolApprovalRequest | undefined {
    const row = this.db
      .prepare(`SELECT * FROM tool_approval_requests WHERE id = ?`)
      .get(id) as Record<string, unknown> | undefined;
    return row ? normalizeRow(row) : undefined;
  }

  listPending(sessionId?: string): ToolApprovalRequest[] {
    const rows = sessionId
      ? (this.db
          .prepare(
            `SELECT * FROM tool_approval_requests
             WHERE status = 'pending' AND session_id = ?
             ORDER BY created_at DESC`
          )
          .all(sessionId) as Record<string, unknown>[])
      : (this.db
          .prepare(
            `SELECT * FROM tool_approval_requests
             WHERE status = 'pending'
             ORDER BY created_at DESC`
          )
          .all() as Record<string, unknown>[]);
    return rows.map(normalizeRow);
  }

  listHistory(sessionId?: string, limit = 100): ToolApprovalRequest[] {
    const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 500);
    const rows = sessionId
      ? (this.db
          .prepare(
            `SELECT * FROM tool_approval_requests
             WHERE session_id = ?
             ORDER BY created_at DESC
             LIMIT ?`
          )
          .all(sessionId, safeLimit) as Record<string, unknown>[])
      : (this.db
          .prepare(
            `SELECT * FROM tool_approval_requests
             ORDER BY created_at DESC
             LIMIT ?`
          )
          .all(safeLimit) as Record<string, unknown>[]);
    return rows.map(normalizeRow);
  }

  approve(id: string, resolvedBy?: string, resolutionNote?: string): ToolApprovalRequest | undefined {
    return this.resolveRequest(id, 'approved', resolvedBy, resolutionNote);
  }

  deny(id: string, resolvedBy?: string, resolutionNote?: string): ToolApprovalRequest | undefined {
    return this.resolveRequest(id, 'denied', resolvedBy, resolutionNote);
  }

  expire(id: string, resolutionNote?: string): ToolApprovalRequest | undefined {
    return this.resolveRequest(id, 'expired', undefined, resolutionNote);
  }

  async waitForDecision(
    id: string,
    options?: { signal?: AbortSignal; timeoutMs?: number }
  ): Promise<ToolApprovalRequest> {
    const existing = this.getById(id);
    if (!existing) throw new Error(`approval request ${id} not found`);
    if (existing.status !== 'pending') return existing;

    return await new Promise<ToolApprovalRequest>((resolve, reject) => {
      const waiters = this.waiters.get(id) ?? new Set<Waiter>();
      this.waiters.set(id, waiters);

      let settled = false;
      let timer: NodeJS.Timeout | undefined;

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        if (options?.signal) {
          options.signal.removeEventListener('abort', onAbort);
        }
        waiters.delete(waiter);
        if (waiters.size === 0) {
          this.waiters.delete(id);
        }
      };

      const settle = (request: ToolApprovalRequest) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(request);
      };

      const waiter: Waiter = {
        resolve: settle,
        reject: (error) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(error);
        },
      };

      const onAbort = () => {
        waiter.reject(new DOMException('Aborted', 'AbortError'));
      };

      waiters.add(waiter);

      if (options?.signal) {
        if (options.signal.aborted) {
          onAbort();
          return;
        }
        options.signal.addEventListener('abort', onAbort, { once: true });
      }

      if (options?.timeoutMs && options.timeoutMs > 0) {
        timer = setTimeout(() => {
          const expired = this.expire(id, 'approval timed out');
          settle(expired ?? this.getById(id)!);
        }, options.timeoutMs);
      }
    });
  }

  private resolveRequest(
    id: string,
    decision: ApprovalDecision,
    resolvedBy?: string,
    resolutionNote?: string
  ): ToolApprovalRequest | undefined {
    const existing = this.getById(id);
    if (!existing) return undefined;
    if (existing.status !== 'pending') return existing;

    const resolvedAt = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE tool_approval_requests
         SET status = ?, resolved_at = ?, resolved_by = ?, resolution_note = ?
         WHERE id = ?`
      )
      .run(decision, resolvedAt, resolvedBy ?? null, resolutionNote ?? null, id);

    const updated = this.getById(id)!;
    const waiters = this.waiters.get(id);
    if (waiters) {
      for (const waiter of [...waiters]) {
        waiter.resolve(updated);
      }
    }
    return updated;
  }
}

export const approvalStore = new ApprovalStore();
