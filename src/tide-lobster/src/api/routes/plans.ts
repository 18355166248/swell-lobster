import { Hono } from 'hono';
import { planStore } from '../../store/planStore.js';
import { recordEvent } from '../../observability/traceStore.js';

export const plansRouter = new Hono();

plansRouter.get('/api/plans/:id', (c) => {
  const plan = planStore.getById(c.req.param('id'));
  if (!plan) return c.json({ detail: 'plan not found' }, 404);
  return c.json(plan);
});

plansRouter.get('/api/sessions/:sessionId/plan', (c) => {
  const plan = planStore.getBySessionId(c.req.param('sessionId'));
  if (!plan) return c.json({ detail: 'no plan found for session' }, 404);
  return c.json(plan);
});

plansRouter.post('/api/plans/:id/cancel', (c) => {
  const plan = planStore.getById(c.req.param('id'));
  if (!plan) return c.json({ detail: 'plan not found' }, 404);
  if (plan.status !== 'running' && plan.status !== 'draft') {
    return c.json({ detail: 'plan is not cancellable' }, 400);
  }
  planStore.setPlanStatus(plan.id, 'cancelled');
  recordEvent({
    category: 'plan.created',
    status: 'error',
    sessionId: plan.session_id,
    meta: { planId: plan.id, action: 'cancelled', stepCount: plan.steps.length },
  });
  return c.json(planStore.getById(plan.id));
});

plansRouter.post('/api/plans/:id/retry-step', async (c) => {
  const rawBody: unknown = await c.req.json().catch(() => ({}));
  const stepId =
    rawBody != null && typeof rawBody === 'object' && 'stepId' in rawBody
      ? String((rawBody as { stepId: unknown }).stepId)
      : undefined;
  const plan = planStore.getById(c.req.param('id'));
  if (!plan) return c.json({ detail: 'plan not found' }, 404);

  const step = plan.steps.find((s) => s.id === stepId);
  if (!step) return c.json({ detail: 'step not found' }, 404);
  if (step.status !== 'failed') return c.json({ detail: 'only failed steps can be retried' }, 400);

  planStore.setStepStatus(step.id, 'pending');
  planStore.setPlanStatus(plan.id, 'running');

  return c.json(planStore.getById(plan.id));
});
