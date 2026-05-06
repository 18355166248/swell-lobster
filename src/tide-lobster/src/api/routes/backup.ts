import { Hono } from 'hono';
import { createBackup, listBackups, restoreBackup } from '../../db/backup.js';

export const backupRouter = new Hono();

/**
 * GET /api/backup/list — 列出所有备份
 */
backupRouter.get('/api/backup/list', (c) => {
  try {
    const backups = listBackups();
    return c.json({ backups });
  } catch (e) {
    return c.json({ detail: String((e as Error)?.message ?? e) }, 500);
  }
});

/**
 * POST /api/backup/create — 创建备份
 */
backupRouter.post('/api/backup/create', async (c) => {
  try {
    const entry = await createBackup();
    return c.json({ ok: true, backup: entry });
  } catch (e) {
    return c.json({ detail: String((e as Error)?.message ?? e) }, 500);
  }
});

/**
 * POST /api/backup/restore — 恢复备份
 * body: { name: string }
 */
backupRouter.post('/api/backup/restore', async (c) => {
  try {
    const body = await c.req.json<{ name?: string }>();
    if (!body.name) return c.json({ detail: 'name is required' }, 400);
    await restoreBackup(body.name);
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ detail: String((e as Error)?.message ?? e) }, 500);
  }
});
