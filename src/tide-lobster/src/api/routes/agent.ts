import { Hono } from 'hono';
import { delegateTask, getDelegatedSession } from '../../agents/delegateService.js';

export const agentRouter = new Hono();

agentRouter.post('/api/agent/delegate', async (c) => {
  try {
    const body = await c.req.json<{
      task?: string;
      template_id?: string;
      endpoint_name?: string;
      timeout_seconds?: number;
      parent_session_id?: string;
    }>();

    const result = await delegateTask({
      task: String(body.task ?? ''),
      templateId: body.template_id ?? null,
      endpointName: body.endpoint_name ?? null,
      timeoutSeconds: body.timeout_seconds,
      parentSessionId: body.parent_session_id,
    });
    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status =
      message.includes('required') || message.includes('timed out') ? 400 : 502;
    return c.json({ detail: message }, status);
  }
});

agentRouter.get('/api/agent/delegate/:sessionId', (c) => {
  const session = getDelegatedSession(c.req.param('sessionId'));
  if (!session) return c.json({ detail: 'session not found' }, 404);
  return c.json({ session });
});
