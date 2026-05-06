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
 *
 * 飞书机器人扫码安装端点（`/api/im/feishu/install/*`）：
 * - POST qrcode  — 获取二维码 URL 与设备码
 * - POST poll    — 轮询扫码结果，成功后返回 appId / appSecret
 * - POST verify  — 验证已有 App ID + Secret 是否有效
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
          { value: 'open', label: '开放 — 任何用户均可访问（适合个人自用）' },
          { value: 'pairing', label: '配对码 — 未知用户需管理员审批' },
          { value: 'allowlist', label: '白名单 — 仅允许指定用户 ID' },
        ],
        hint: '个人自用推荐"开放"；对外开放时推荐"配对码"或"白名单"',
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
      {
        key: 'auto_approve_tools',
        label: '自动审批工具执行',
        type: 'boolean',
        hint: '开启后 IM 会话中的工具调用（如搜索、脚本）无需手动审批，适合个人自用场景',
      },
    ],
  },
  {
    type: 'dingtalk',
    label: 'DingTalk',
    fields: [
      {
        key: 'client_id_env',
        label: 'Client ID 环境变量名',
        type: 'string',
        required: true,
        hint: '例如 DINGTALK_CLIENT_ID，对应钉钉应用的 Client ID / AppKey',
      },
      {
        key: 'client_secret_env',
        label: 'Client Secret 环境变量名',
        type: 'string',
        required: true,
        hint: '例如 DINGTALK_CLIENT_SECRET，对应钉钉应用的 Client Secret / AppSecret',
      },
      {
        key: 'robot_code',
        label: 'robotCode',
        type: 'string',
        hint: '可选；默认使用 Client ID。若开发者后台显示的机器人编码不同，可在这里显式填写',
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
      {
        key: 'auto_approve_tools',
        label: '自动审批工具执行',
        type: 'boolean',
        hint: '开启后 IM 会话中的工具调用（如搜索、脚本）无需手动审批，适合个人自用场景',
      },
    ],
  },
  {
    type: 'feishu',
    label: '飞书',
    fields: [
      {
        key: 'app_id_env',
        label: 'App ID 环境变量名',
        type: 'string',
        required: true,
        hint: '例如 FEISHU_APP_ID，对应飞书应用的 App ID',
      },
      {
        key: 'app_secret_env',
        label: 'App Secret 环境变量名',
        type: 'string',
        required: true,
        hint: '例如 FEISHU_APP_SECRET，对应飞书应用的 App Secret',
      },
      {
        key: 'domain',
        label: '版本',
        type: 'select',
        options: [
          { value: 'feishu', label: '飞书（国内）' },
          { value: 'lark', label: 'Lark（国际版）' },
        ],
        hint: '默认飞书；海外部署或使用 Lark 时选"Lark（国际版）"',
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
      {
        key: 'auto_approve_tools',
        label: '自动审批工具执行',
        type: 'boolean',
        hint: '开启后 IM 会话中的工具调用（如搜索、脚本）无需手动审批，适合个人自用场景',
      },
    ],
  },
];

function decorateChannel(
  _c: { req: { url: string } },
  channel: ReturnType<typeof imStore.list>[number]
) {
  const status = channel.enabled ? imManager.getRunningStatus(channel.id) : 'stopped';
  // 掩码敏感字段，避免明文 Secret 在 API 响应中暴露
  const config = { ...channel.config };
  if (config.app_secret) config.app_secret = '***';
  return { ...channel, config, status };
}

/** 返回可用的通道类型元数据，供前端渲染「添加通道」表单 */
imRouter.get('/api/im/channel-types', (c) => c.json(CHANNEL_TYPES));

/** 列出所有通道；`enabled` 时 `status` 取 `imManager.getRunningStatus` */
imRouter.get('/api/im/channels', (c) => {
  const channels = imStore.list().map((ch) => decorateChannel(c, ch));
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

  return c.json(decorateChannel(c, channel), 201);
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
  return c.json(updated ? decorateChannel(c, updated) : updated);
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

/**
 * 为 HTTP webhook 型通道预留的事件接收端点。
 *
 * 当前飞书通道使用 WSClient 长连接，无需此路由。
 * 若未来接入其他 webhook 型平台，可实现 `handleWebhook` 并通过此端点接收推送。
 */
imRouter.post('/api/im/channels/:id/webhook', async (c) => {
  const id = c.req.param('id');
  const channel = imStore.get(id);
  if (!channel) return c.json({ detail: 'channel not found' }, 404);

  const bodyText = await c.req.text();
  const request = {
    headers: c.req.raw.headers,
    query: Object.fromEntries(new URL(c.req.url).searchParams.entries()),
    bodyText,
    contentType: c.req.header('content-type'),
  };

  try {
    const result = await imManager.handleWebhook(id, request);
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    // 适配器未启动时，尝试处理飞书 URL 验证 challenge（无需凭证）
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(bodyText) as Record<string, unknown>;
    } catch {
      return c.json({ detail: 'channel not running' }, 503);
    }
    const header = parsed.header as Record<string, unknown> | undefined;
    const event = parsed.event as Record<string, unknown> | undefined;
    if (header?.event_type === 'url_verification' && event?.challenge) {
      return c.json({ challenge: event.challenge });
    }
    if (parsed.type === 'url_verification' && parsed.challenge) {
      return c.json({ challenge: parsed.challenge });
    }
    return c.json({ detail: 'channel not running' }, 503);
  }
});

// ──────────────────────────────────────────────
// 飞书机器人扫码安装（Device Code OAuth 流）
// ──────────────────────────────────────────────

/** 动态导入的 feishu-auth 与包内类型不完全一致，此处仅描述本路由实际调用的方法 */
type FeishuAuthInstance = {
  setDomain(isLark: boolean): void;
  init(): Promise<unknown>;
  begin(): Promise<{
    verification_uri_complete: string;
    device_code: string;
    interval?: number;
    expire_in?: number;
  }>;
  poll(deviceCode: string): Promise<{
    error?: string;
    error_description?: string;
    client_id?: string;
    client_secret?: string;
    user_info?: { tenant_brand?: string };
  }>;
};

type FeishuAuthModule = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  FeishuAuth: new (...args: any[]) => FeishuAuthInstance;
};

async function loadFeishuAuthModule(): Promise<FeishuAuthModule> {
  try {
    const dynamicImport = new Function('s', 'return import(s)') as (specifier: string) => Promise<
      unknown
    >;
    return (await dynamicImport(
      '@larksuite/openclaw-lark-tools/dist/utils/feishu-auth.js'
    )) as FeishuAuthModule;
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `飞书扫码安装依赖未就绪：@larksuite/openclaw-lark-tools (${detail})`
    );
  }
}

/** deviceCode → { isLark, expireAt } 的短暂会话状态，仅内存 */
const feishuQrSessions = new Map<string, { isLark: boolean; expireAt: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of feishuQrSessions) {
    if (now > v.expireAt) feishuQrSessions.delete(k);
  }
}, 60_000);

/** 获取飞书 QR 码：返回供前端渲染的 verification_uri_complete 与 deviceCode */
imRouter.post('/api/im/feishu/install/qrcode', async (c) => {
  const body = await c
    .req.json<{ isLark?: boolean }>()
    .catch((): { isLark?: boolean } => ({}));
  const isLark = body.isLark === true;
  try {
    const { FeishuAuth } = await loadFeishuAuthModule();
    const auth = new FeishuAuth();
    auth.setDomain(isLark);
    await auth.init();
    const resp = await auth.begin();
    const expireIn = resp.expire_in ?? 300;
    feishuQrSessions.set(resp.device_code, { isLark, expireAt: Date.now() + expireIn * 1000 });
    return c.json({
      url: resp.verification_uri_complete,
      deviceCode: resp.device_code,
      interval: resp.interval ?? 5,
      expireIn,
    });
  } catch (err: unknown) {
    return c.json({ detail: String(err) }, 502);
  }
});

/** 轮询扫码结果；`done: true` 时返回 appId / appSecret */
imRouter.post('/api/im/feishu/install/poll', async (c) => {
  const body = await c.req.json<{ deviceCode: string }>().catch(() => ({ deviceCode: '' }));
  const { deviceCode } = body;
  if (!deviceCode) return c.json({ detail: 'deviceCode required' }, 400);
  const session = feishuQrSessions.get(deviceCode);
  if (!session) return c.json({ detail: 'session expired or not found' }, 404);
  try {
    const { FeishuAuth } = await loadFeishuAuthModule();
    const auth = new FeishuAuth();
    auth.setDomain(session.isLark);
    const resp = await auth.poll(deviceCode);
    if (resp.error) {
      if (resp.error === 'authorization_pending' || resp.error === 'slow_down') {
        return c.json({ done: false });
      }
      feishuQrSessions.delete(deviceCode);
      return c.json({ done: false, error: resp.error_description ?? resp.error });
    }
    if (resp.client_id && resp.client_secret) {
      const domain = resp.user_info?.tenant_brand === 'lark' ? 'lark' : 'feishu';
      feishuQrSessions.delete(deviceCode);
      return c.json({ done: true, appId: resp.client_id, appSecret: resp.client_secret, domain });
    }
    return c.json({ done: false });
  } catch (err: unknown) {
    return c.json({ detail: String(err) }, 502);
  }
});

/** 验证已有 App ID + Secret 是否能正常鉴权（调用 /open-apis/bot/v3/info） */
imRouter.post('/api/im/feishu/install/verify', async (c) => {
  const body = await c
    .req.json<{ appId: string; appSecret: string; domain?: string }>()
    .catch((): { appId: string; appSecret: string; domain?: string } => ({
      appId: '',
      appSecret: '',
    }));
  const { appId, appSecret, domain } = body;
  if (!appId || !appSecret) return c.json({ detail: 'appId and appSecret required' }, 400);
  try {
    const Lark = await import('@larksuiteoapi/node-sdk');
    const larkDomain = domain === 'lark' ? Lark.Domain.Lark : Lark.Domain.Feishu;
    const client = new Lark.Client({
      appId,
      appSecret,
      appType: Lark.AppType.SelfBuild,
      domain: larkDomain as unknown as string,
    });
    const result = await client.request({ method: 'GET', url: '/open-apis/bot/v3/info' });
    if (result.code === 0) {
      const botData = result.data as Record<string, unknown> | undefined;
      const bot = botData?.bot as Record<string, unknown> | undefined;
      return c.json({ success: true, botName: bot?.app_name ?? bot?.name });
    }
    return c.json({ success: false, error: result.msg ?? 'auth failed' });
  } catch (err: unknown) {
    return c.json({ success: false, error: String(err) });
  }
});
