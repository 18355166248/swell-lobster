import { Hono } from 'hono';
import { imStore } from '../../im/store.js';
import { imManager } from '../../im/manager.js';
import type { ChannelType } from '../../im/types.js';

export const imRouter = new Hono();

/** 支持的通道类型及配置字段说明（用于前端动态渲染表单） */
const CHANNEL_TYPES = [
  {
    type: 'telegram',
    label: 'Telegram',
    fields: [
      {
        key: 'bot_token_env',
        label: 'Bot Token 环境变量名',
        type: 'string',
        required: true,
        hint: '例如 TELEGRAM_BOT_TOKEN，Token 本身存入 .env 文件',
      },
      {
        key: 'allowed_user_ids',
        label: '允许的用户 ID（逗号分隔，为空不限制）',
        type: 'string',
        hint: '向 @userinfobot 发消息可获取自己的 user_id',
      },
    ],
  },
];

/** GET /api/im/channel-types */
imRouter.get('/api/im/channel-types', (c) => c.json(CHANNEL_TYPES));

/** GET /api/im/channels */
imRouter.get('/api/im/channels', (c) => {
  const channels = imStore.list().map((ch) => ({
    ...ch,
    // 用运行时实际状态覆盖 DB 中的状态
    status: ch.enabled ? imManager.getRunningStatus(ch.id) : 'stopped',
  }));
  return c.json({ channels });
});

/** POST /api/im/channels */
imRouter.post('/api/im/channels', async (c) => {
  const body = await c.req.json<{
    channel_type?: ChannelType;
    name?: string;
    config?: Record<string, unknown>;
    enabled?: boolean;
  }>();

  if (!body.channel_type) return c.json({ detail: 'channel_type is required' }, 400);
  if (!body.name?.trim()) return c.json({ detail: 'name is required' }, 400);

  const channel = imStore.create({
    channel_type: body.channel_type,
    name: body.name.trim(),
    config: body.config ?? {},
    enabled: body.enabled ?? false,
  });

  return c.json(channel, 201);
});

/** PATCH /api/im/channels/:id */
imRouter.patch('/api/im/channels/:id', async (c) => {
  const id = c.req.param('id');
  const channel = imStore.get(id);
  if (!channel) return c.json({ detail: 'channel not found' }, 404);

  const body = await c.req.json<{
    name?: string;
    config?: Record<string, unknown>;
    enabled?: boolean;
  }>();

  const updated = imStore.update(id, {
    name: body.name,
    config: body.config,
    enabled: body.enabled,
  });
  return c.json(updated);
});

/** DELETE /api/im/channels/:id */
imRouter.delete('/api/im/channels/:id', async (c) => {
  const id = c.req.param('id');
  const channel = imStore.get(id);
  if (!channel) return c.json({ detail: 'channel not found' }, 404);

  // 先停止再删除
  await imManager.stopChannel(id);
  imStore.delete(id);
  return c.json({ status: 'ok' });
});

/** POST /api/im/channels/:id/start */
imRouter.post('/api/im/channels/:id/start', async (c) => {
  const id = c.req.param('id');
  const channel = imStore.get(id);
  if (!channel) return c.json({ detail: 'channel not found' }, 404);

  try {
    await imManager.startChannel(channel);
    imStore.update(id, { enabled: true });
    return c.json({ status: 'running' });
  } catch (err: unknown) {
    const msg = String(err);
    imStore.setStatus(id, 'error', msg);
    return c.json({ detail: msg }, 502);
  }
});

/** POST /api/im/channels/:id/stop */
imRouter.post('/api/im/channels/:id/stop', async (c) => {
  const id = c.req.param('id');
  const channel = imStore.get(id);
  if (!channel) return c.json({ detail: 'channel not found' }, 404);

  await imManager.stopChannel(id);
  imStore.update(id, { enabled: false });
  return c.json({ status: 'stopped' });
});
