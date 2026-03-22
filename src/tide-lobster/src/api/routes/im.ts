/** IM Channels（占位）*/
import { Hono } from 'hono';
export const imRouter = new Hono();
imRouter.get('/api/im/channels', (c) => c.json({ channels: [] }));
