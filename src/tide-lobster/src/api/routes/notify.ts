import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { notifyBus } from '../../notify/bus.js';

export const notifyRouter = new Hono();

notifyRouter.get('/api/notify/stream', (c) => {
  return streamSSE(c, async (stream) => {
    const handler = (payload: unknown) =>
      void stream.writeSSE({ event: 'notify', data: JSON.stringify(payload) });
    notifyBus.on('event', handler);
    await new Promise<void>((resolve) => stream.onAbort(resolve));
    notifyBus.off('event', handler);
  });
});
