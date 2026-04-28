import { Hono } from 'hono';
import { listTemplates, getTemplate } from '../../agent-templates/store.js';

export const agentTemplatesRouter = new Hono();

// GET /api/agent-templates?category=开发
agentTemplatesRouter.get('/api/agent-templates', (c) => {
  const category = c.req.query('category');
  const templates = listTemplates(category);
  return c.json({ templates });
});

// GET /api/agent-templates/:id
agentTemplatesRouter.get('/api/agent-templates/:id', (c) => {
  const template = getTemplate(c.req.param('id'));
  if (!template) return c.json({ detail: 'template not found' }, 404);
  return c.json({ template });
});
