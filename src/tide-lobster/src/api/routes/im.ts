/**
 * IM（即时通讯）通道的 HTTP API。
 *
 * 配置存 SQLite `im_channels`；启停由 `imManager` 操作内存中的适配器。
 * 列表中 `status` 在 `enabled` 为真时用进程内运行态覆盖 DB，避免显示「stopped」但实际仍在轮询。
 *
 * Telegram 配对码管理端点（`/api/im/channels/:id/pairing/*`）：
 * - GET  pending          — 获取待审配对请求列表
 * - POST approve          — 通过 userId 或 code 批准用户
 * - GET  approved         — 获取已批准用户列表
 * - DELETE approved/:uid  — 撤销已批准用户的访问权限
 */
import { Hono } from 'hono';
import { imStore } from '../../im/store.js';
import { imManager } from '../../im/manager.js';
import type { ChannelType } from '../../im/types.js';
import {
  getPendingRequests,
  getApprovedUsers,
  approveUser,
  revokeUser,
} from '../../im/channels/telegram/pairing.js';

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
        key: 'dm_policy',
        label: 'DM 访问策略',
        type: 'select',
        options: [
          { value: 'pairing', label: '配对码（默认）— 未知用户需管理员审批' },
          { value: 'allowlist', label: '白名单 — 仅允许指定用户 ID' },
        ],
        hint: '推荐使用配对码策略，安全性更高',
      },
      {
        key: 'allowed_user_ids',
        label: '白名单用户 ID（逗号分隔）',
        type: 'string',
        hint: '配对码策略下白名单用户直接放行；白名单策略下为唯一准入来源。向 @userinfobot 发消息可获取 user_id',
      },
      {
        key: 'rpm_limit',
        label: '每分钟请求数上限（RPM）',
        type: 'number',
        hint: '留空表示不限制；建议先设置为 10~30',
      },
      {
        key: 'rpd_limit',
        label: '每日请求数上限（RPD）',
        type: 'number',
        hint: '留空表示不限制；适合控制外部 IM 渠道总配额',
      },
      {
        key: 'limit_message',
        label: '限流提示文案',
        type: 'string',
        hint: '超过频率限制时返回给用户的消息',
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

// ──────────────────────────────────────────────
// Telegram 配对码管理（仅 Telegram 通道有效）
// ──────────────────────────────────────────────

/** 获取待审批的配对请求列表 */
imRouter.get('/api/im/channels/:id/pairing/pending', (c) => {
  const id = c.req.param('id');
  const channel = imStore.get(id);
  if (!channel) return c.json({ detail: 'channel not found' }, 404);
  if (channel.channel_type !== 'telegram') {
    return c.json({ detail: '仅 Telegram 通道支持配对码功能' }, 400);
  }

  const pending = getPendingRequests(id);
  return c.json({ pending });
});

/**
 * 批准用户。请求体支持两种方式：
 * - `{ "user_id": 123456789 }` — 按用户 ID 批准
 * - `{ "code": "ABCD12" }` — 按配对码批准
 */
imRouter.post('/api/im/channels/:id/pairing/approve', async (c) => {
  const id = c.req.param('id');
  const channel = imStore.get(id);
  if (!channel) return c.json({ detail: 'channel not found' }, 404);
  if (channel.channel_type !== 'telegram') {
    return c.json({ detail: '仅 Telegram 通道支持配对码功能' }, 400);
  }

  const body = await c.req.json<{ user_id?: number; code?: string }>();
  if (body.user_id === undefined && !body.code) {
    return c.json({ detail: '需提供 user_id 或 code' }, 400);
  }

  const approvedId = approveUser(id, { userId: body.user_id, code: body.code });
  if (approvedId === null) {
    return c.json({ detail: '未找到匹配的待审请求' }, 404);
  }

  return c.json({ approved_user_id: approvedId });
});

/** 获取已批准用户列表 */
imRouter.get('/api/im/channels/:id/pairing/approved', (c) => {
  const id = c.req.param('id');
  const channel = imStore.get(id);
  if (!channel) return c.json({ detail: 'channel not found' }, 404);
  if (channel.channel_type !== 'telegram') {
    return c.json({ detail: '仅 Telegram 通道支持配对码功能' }, 400);
  }

  const approved = getApprovedUsers(id);
  return c.json({ approved });
});

/** 撤销已批准用户的访问权限 */
imRouter.delete('/api/im/channels/:id/pairing/approved/:userId', (c) => {
  const id = c.req.param('id');
  const userId = Number(c.req.param('userId'));
  const channel = imStore.get(id);
  if (!channel) return c.json({ detail: 'channel not found' }, 404);
  if (channel.channel_type !== 'telegram') {
    return c.json({ detail: '仅 Telegram 通道支持配对码功能' }, 400);
  }
  if (isNaN(userId)) return c.json({ detail: '无效的 user_id' }, 400);

  revokeUser(id, userId);
  return c.json({ status: 'ok' });
});
