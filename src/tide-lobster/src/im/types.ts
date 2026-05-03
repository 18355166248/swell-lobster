/**
 * IM 通道统一类型定义。
 *
 * 与 `im_channels` 表、`/api/im/*` 路由及各类 `ChannelAdapter` 实现共享，
 * 保证持久化、HTTP API 与业务层使用同一套语义。
 */

/** 进程内通道状态：`error` 常伴随 `error_message` 写入 DB */
export type ChannelStatus = 'running' | 'stopped' | 'error';

/** 已规划的平台标识；未实现的类型在 `createAdapter` 中会抛错 */
export type ChannelType = 'telegram' | 'feishu' | 'dingtalk' | 'wework';

/** SQLite `im_channels` 行原始形态（config 为 JSON 字符串、enabled 为 0/1） */
export interface IMChannelRow {
  id: string;
  channel_type: ChannelType;
  name: string;
  config: string; // JSON string
  enabled: number; // SQLite boolean
  status: ChannelStatus;
  error_message: string | null;
  created_at: string;
}

/** API 与适配器使用的通道配置：`config` 已解析为对象，`enabled` 为布尔 */
export interface IMChannelConfig {
  id: string;
  channel_type: ChannelType;
  name: string;
  config: Record<string, unknown>;
  enabled: boolean;
  status: ChannelStatus;
  error_message: string | null;
  created_at: string;
}

/**
 * 单个表单字段定义，与 `GET /api/im/channel-types` 返回结构一致，
 * 供 Web UI 按类型动态生成配置项。
 */
export interface ChannelFieldDef {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean';
  required?: boolean;
  hint?: string;
}

/** 一种通道类型及其所需配置字段列表 */
export interface ChannelTypeDef {
  type: ChannelType;
  label: string;
  fields: ChannelFieldDef[];
}

/**
 * 跨平台统一入站消息。
 *
 * `chat_id` / `user_id` / `message_id` 均为字符串，便于与 SQLite、JSON 交互；
 * `chat_id` 表示平台侧会话标识，例如 Telegram chat id、钉钉 conversationId。
 * 图片类消息通过 `images` + 可选 `caption` 传入多模态聊天参数。
 */
export interface UnifiedMessage {
  channel_type: ChannelType;
  /** 本通道在系统中的配置 id（非 Telegram chat id） */
  channel_id: string;
  /** 平台侧会话 id，发送回复时使用；例如 Telegram chat id、钉钉 conversationId */
  chat_id: string;
  user_id: string;
  message_id: string;
  text: string | null;
  /** base64 编码的图片，附带 mimeType */
  images?: Array<{ base64: string; mimeType: string }>;
  caption?: string;
  timestamp: Date;
}

/** 出站消息的扩展参数（各适配器按需支持） */
export interface SendOptions {
  parseMode?: 'Markdown' | 'HTML' | 'plain';
  replyToMessageId?: string;
}

/**
 * webhook 入站请求的最小抽象。
 *
 * 路由层负责读取原始 body 与 query / headers，具体平台适配器再自行解析事件格式，
 * 这样飞书 / 钉钉都能复用同一条 `IMManager.handleWebhook` 入口。
 */
export interface WebhookRequest {
  headers: Headers;
  query: Record<string, string | undefined>;
  bodyText: string;
  contentType?: string;
}

/** webhook 处理结果；路由层直接按该结构回给第三方平台。 */
export interface WebhookResponse {
  status: 200 | 202 | 400 | 401 | 403 | 404 | 500;
  body: unknown;
}
