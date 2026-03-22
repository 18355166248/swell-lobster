/** Scheduler（占位）*/
import { Hono } from 'hono';
export const schedulerRouter = new Hono();
schedulerRouter.get('/api/scheduler/tasks', (c) => c.json({ tasks: [] }));
