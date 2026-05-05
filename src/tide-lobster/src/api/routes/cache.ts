import { Hono } from 'hono';
import { rmSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { settings } from '../../config.js';

export const cacheRouter = new Hono();

function dirStats(dir: string): { count: number; bytes: number } {
  try {
    const files = readdirSync(dir);
    const bytes = files.reduce((sum, f) => {
      try { return sum + statSync(join(dir, f)).size; } catch { return sum; }
    }, 0);
    return { count: files.length, bytes };
  } catch {
    return { count: 0, bytes: 0 };
  }
}

cacheRouter.get('/api/cache/info', (c) => {
  return c.json({
    tmp: dirStats(join(settings.dataDir, 'tmp', 'uploads')),
    outputs: dirStats(join(settings.dataDir, 'outputs')),
  });
});

cacheRouter.post('/api/cache/clear', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { targets?: string[] };
  const targets = body.targets ?? ['tmp'];
  const cleared: string[] = [];

  if (targets.includes('tmp')) {
    const dir = join(settings.dataDir, 'tmp', 'uploads');
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    cleared.push('tmp');
  }
  if (targets.includes('outputs')) {
    const dir = join(settings.dataDir, 'outputs');
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    cleared.push('outputs');
  }

  return c.json({ ok: true, cleared });
});
