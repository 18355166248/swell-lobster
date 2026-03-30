/**
 * IM（即时通讯）通道的 HTTP API。
 *
 * 配置存 SQLite `im_channels`；启停由 `imManager` 操作内存中的适配器。
 * 列表中 `status` 在 `enabled` 为真时用进程内运行态覆盖 DB，避免显示「stopped」但实际仍在轮询。
 */
import { Hono } from 'hono';
import { imStore } from '../../im/store.js';
import { imManager } from '../../im/manager.js';
import type { ChannelType } from '../../im/types.js';

export const imRouter = new Hono();

/** 与前端约定：每种 `ChannelType` 的展示名与可编辑字段（含 `hint` 提示） */
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

/** 返回可用的通道类型元数据，供前端渲染「添加通道」表单 */
imRouter.get('/api/im/channel-types', (c) => c.json(CHANNEL_TYPES));

/** 列出所有通道；`enabled` 时 `status` 取 `imManager.getRunningStatus` */
imRouter.get('/api/im/channels', (c) => {
  const channels = imStore.list().map((ch) => ({
    ...ch,
    // 用运行时实际状态覆盖 DB 中的状态
    status: ch.enabled ? imManager.getRunningStatus(ch.id) : 'stopped',
  }));
  return c.json({ channels });
});

/** 仅创建 DB 记录，不自动启动；需再调 `.../start` 或依赖进程 `loadAll` */
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

/** 更新名称、config、enabled；不隐式启停适配器 */
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

/** 先 `stopChannel` 再删库，避免残留轮询 */
imRouter.delete('/api/im/channels/:id', async (c) => {
  const id = c.req.param('id');
  const channel = imStore.get(id);
  if (!channel) return c.json({ detail: 'channel not found' }, 404);

  // 先停止再删除
  await imManager.stopChannel(id);
  imStore.delete(id);
  return c.json({ status: 'ok' });
});

/** 启动适配器并置 `enabled: true`；失败时 502 且写 `error_message` */
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

/** 停止适配器并置 `enabled: false` */
imRouter.post('/api/im/channels/:id/stop', async (c) => {
  const id = c.req.param('id');
  const channel = imStore.get(id);
  if (!channel) return c.json({ detail: 'channel not found' }, 404);

  await imManager.stopChannel(id);
  imStore.update(id, { enabled: false });
  return c.json({ status: 'stopped' });
});
