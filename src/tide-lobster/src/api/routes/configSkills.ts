import { Hono } from 'hono';
import { KeyValueStore } from '../../store/keyValueStore.js';

export const configSkillsRouter = new Hono();
const store = new KeyValueStore();

configSkillsRouter.get('/api/config/skills', (c) => {
  try {
    const value = store.getValue('skills');
    if (!value) return c.json({ skills: [] });
    return c.json({ skills: JSON.parse(value) });
  } catch (e) {
    return c.json({ detail: String((e as Error)?.message || e) }, 500);
  }
});

configSkillsRouter.post('/api/config/skills', async (c) => {
  try {
    const body = await c.req.json<{ content: Record<string, unknown> }>();
    store.setValue('skills', JSON.stringify(body.content));
    return c.json({ status: 'ok' });
  } catch (e) {
    return c.json({ detail: String((e as Error)?.message || e) }, 500);
  }
});
