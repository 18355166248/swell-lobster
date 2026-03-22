/** Token Statistics（占位）*/
import { Hono } from 'hono';
export const tokenStatsRouter = new Hono();
tokenStatsRouter.get('/api/stats/tokens', (c) => c.json({ stats: {} }));
