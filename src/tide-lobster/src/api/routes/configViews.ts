import { Hono } from 'hono';
import { KeyValueStore } from '../../store/keyValueStore.js';

export const configViewsRouter = new Hono();
const store = new KeyValueStore();

configViewsRouter.get('/api/config/views', (c) => {
  try {
    const value = store.getValue('views_config');
    if (!value) return c.json({});
    return c.json(JSON.parse(value));
  } catch (e) {
    return c.json({ detail: String((e as Error)?.message || e) }, 500);
  }
});

configViewsRouter.post('/api/config/views', async (c) => {
  try {
    const data = await c.req.json();
    store.setValue('views_config', JSON.stringify(data));
    return c.json({ status: 'ok' });
  } catch (e) {
    return c.json({ detail: String((e as Error)?.message || e) }, 500);
  }
});
