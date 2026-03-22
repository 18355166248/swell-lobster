/**
 * Skills 列表接口（占位）
 *
 * 对应 Python: swell_lobster/api/routes/skills.py
 */

import { Hono } from 'hono';

export const skillsRouter = new Hono();

skillsRouter.get('/api/skills', (c) => {
  return c.json({ skills: [] });
});
