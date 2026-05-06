import { Hono } from 'hono';
import { approvalStore, type ApprovalGrantScope } from '../../store/approvalStore.js';
import { ExtensionSource } from '../../extensions/types.js';
import { executionAuditService } from '../../tools/executionAudit.js';
import { recordEvent } from '../../observability/traceStore.js';

export const approvalsRouter = new Hono();

type ApprovalResolutionBody = {
  resolved_by?: string;
  resolution_note?: string;
  grant_scope?: ApprovalGrantScope;
};

approvalsRouter.get('/api/approvals', (c) => {
  const status = (c.req.query('status') ?? 'pending').trim().toLowerCase();
  const sessionId = (c.req.query('sessionId') ?? '').trim() || undefined;
  const limit = Number.parseInt(c.req.query('limit') ?? '100', 10);

  if (status === 'pending') {
    return c.json({ requests: approvalStore.listPending(sessionId) });
  }
  return c.json({ requests: approvalStore.listHistory(sessionId, limit) });
});

approvalsRouter.get('/api/approvals/history', (c) => {
  const sessionId = (c.req.query('sessionId') ?? '').trim() || undefined;
  const limit = Number.parseInt(c.req.query('limit') ?? '100', 10);
  return c.json({ requests: approvalStore.listHistory(sessionId, limit) });
});

approvalsRouter.post('/api/approvals/:id/approve', async (c) => {
  const body: ApprovalResolutionBody = await c.req.json<ApprovalResolutionBody>().catch(() => ({}));
  const request = approvalStore.approve(c.req.param('id'), body.resolved_by, body.resolution_note);
  if (!request) return c.json({ detail: 'approval request not found' }, 404);
  const grant =
    body.grant_scope === 'session'
      ? approvalStore.grantSessionApproval(request.session_id, request.tool_name, body.resolved_by)
      : undefined;
  recordEvent({
    category: 'tool.approval',
    status: 'ok',
    sessionId: request.session_id,
    meta: { toolName: request.tool_name, decision: 'approved', grantScope: body.grant_scope },
  });
  return c.json({ request, grant });
});

approvalsRouter.post('/api/approvals/:id/deny', async (c) => {
  const body: ApprovalResolutionBody = await c.req.json<ApprovalResolutionBody>().catch(() => ({}));
  const request = approvalStore.deny(c.req.param('id'), body.resolved_by, body.resolution_note);
  if (!request) return c.json({ detail: 'approval request not found' }, 404);
  recordEvent({
    category: 'tool.approval',
    status: 'error',
    sessionId: request.session_id,
    meta: { toolName: request.tool_name, decision: 'denied' },
  });
  return c.json({ request });
});

const VALID_AUDIT_SOURCES: ReadonlySet<string> = new Set<ExtensionSource>([
  ExtensionSource.builtin,
  ExtensionSource.skill,
  ExtensionSource.mcp,
]);

approvalsRouter.get('/api/approvals/audit', (c) => {
  const sessionId = (c.req.query('sessionId') ?? '').trim() || undefined;
  const limit = Number.parseInt(c.req.query('limit') ?? '50', 10);
  const sourceRaw = (c.req.query('source') ?? '').trim();
  if (sourceRaw && !VALID_AUDIT_SOURCES.has(sourceRaw)) {
    return c.json({ detail: `invalid source: ${sourceRaw}` }, 400);
  }
  const source = sourceRaw ? (sourceRaw as ExtensionSource) : undefined;
  return c.json({ records: executionAuditService.listRecent({ sessionId, limit, source }) });
});
