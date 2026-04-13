import { Hono } from 'hono';
import { exportMarkdown, exportJson } from '../../export/sessionExporter.js';

export const exportRouter = new Hono();

exportRouter.get('/api/export/session/:id', (c) => {
  const sessionId = c.req.param('id');
  const format = (c.req.query('format') ?? 'md').toLowerCase();

  try {
    if (format === 'json') {
      const json = exportJson(sessionId);
      c.header('Content-Type', 'application/json; charset=utf-8');
      c.header('Content-Disposition', `attachment; filename="session-${sessionId}.json"`);
      return c.text(json);
    }

    const md = exportMarkdown(sessionId);
    c.header('Content-Type', 'text/markdown; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="session-${sessionId}.md"`);
    return c.text(md);
  } catch (e) {
    return c.json({ detail: String((e as Error)?.message || e || 'export failed') }, 404);
  }
});
