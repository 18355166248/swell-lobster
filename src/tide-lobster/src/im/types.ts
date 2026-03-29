/** IM 通道统一类型定义 */

export type ChannelStatus = 'running' | 'stopped' | 'error';
export type ChannelType = 'telegram' | 'feishu' | 'dingtalk' | 'wework';

/** DB 中存储的通道配置行 */
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

/** 对外暴露的通道配置（parsed） */
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

/** channel-types 描述符（用于前端动态渲染表单） */
export interface ChannelFieldDef {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean';
  required?: boolean;
  hint?: string;
}

export interface ChannelTypeDef {
  type: ChannelType;
  label: string;
  fields: ChannelFieldDef[];
}

/** 统一消息格式 */
export interface UnifiedMessage {
  channel_type: ChannelType;
  channel_id: string;
  chat_id: string;
  user_id: string;
  message_id: string;
  text: string | null;
  /** base64 编码的图片，附带 mimeType */
  images?: Array<{ base64: string; mimeType: string }>;
  caption?: string;
  timestamp: Date;
}

/** 发送选项 */
export interface SendOptions {
  parseMode?: 'Markdown' | 'HTML' | 'plain';
  replyToMessageId?: string;
}
