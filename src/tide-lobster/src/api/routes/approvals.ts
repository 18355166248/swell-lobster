import { Hono } from 'hono';
import { approvalStore, type ApprovalGrantScope } from '../../store/approvalStore.js';

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
  const body: ApprovalResolutionBody = await c.req
    .json<ApprovalResolutionBody>()
    .catch(() => ({}));
  const request = approvalStore.approve(
    c.req.param('id'),
    body.resolved_by,
    body.resolution_note
  );
  if (!request) return c.json({ detail: 'approval request not found' }, 404);
  const grant =
    body.grant_scope === 'session'
      ? approvalStore.grantSessionApproval(request.session_id, request.tool_name, body.resolved_by)
      : undefined;
  return c.json({ request, grant });
});

approvalsRouter.post('/api/approvals/:id/deny', async (c) => {
  const body: ApprovalResolutionBody = await c.req
    .json<ApprovalResolutionBody>()
    .catch(() => ({}));
  const request = approvalStore.deny(
    c.req.param('id'),
    body.resolved_by,
    body.resolution_note
  );
  if (!request) return c.json({ detail: 'approval request not found' }, 404);
  return c.json({ request });
});
