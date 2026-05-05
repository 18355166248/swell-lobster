import { mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ChannelAdapter } from '../../base.js';
import type { ChannelStatus, SendOptions, UnifiedMessage } from '../../types.js';
import type { Client, WSClient, EventDispatcher } from '@larksuiteoapi/node-sdk';

export interface FeishuConfig {
  /** 飞书 App ID 的环境变量名，例如 FEISHU_APP_ID（与 app_id 二选一） */
  app_id_env?: string;
  /** 飞书 App Secret 的环境变量名，例如 FEISHU_APP_SECRET（与 app_secret 二选一） */
  app_secret_env?: string;
  /** 直接存储的 App ID（扫码安装后自动写入，优先级高于 app_id_env） */
  app_id?: string;
  /** 直接存储的 App Secret（扫码安装后自动写入，优先级高于 app_secret_env） */
  app_secret?: string;
  /** 飞书或 Lark 国际版，默认 feishu */
  domain?: 'feishu' | 'lark';
  rpm_limit?: number;
  rpd_limit?: number;
  limit_message?: string;
  auto_approve_tools?: boolean;
}

type LarkModule = typeof import('@larksuiteoapi/node-sdk');

type FeishuMessageEvent = {
  message: {
    message_id: string;
    chat_id: string;
    chat_type: string;
    message_type: string;
    content: string;
    root_id?: string;
    parent_id?: string;
    mentions?: Array<{ id: { open_id: string }; name: string; key: string }>;
  };
  sender: {
    sender_id: { open_id?: string; user_id?: string };
    sender_type: string;
  };
};

/** 消息去重 TTL（5分钟） */
const DEDUP_TTL_MS = 5 * 60 * 1000;
const processedMessages = new Map<string, number>();

function isMessageProcessed(messageId: string): boolean {
  const now = Date.now();
  for (const [id, ts] of processedMessages) {
    if (now - ts > DEDUP_TTL_MS) processedMessages.delete(id);
  }
  if (processedMessages.has(messageId)) return true;
  processedMessages.set(messageId, now);
  return false;
}

function resolveReceiveIdType(target: string): string {
  if (target.startsWith('ou_')) return 'open_id';
  return 'chat_id';
}

function parsePostContent(content: string): string {
  try {
    const parsed = JSON.parse(content) as {
      title?: string;
      content?: Array<Array<{ tag: string; text?: string; href?: string; user_name?: string }>>;
    };
    let text = parsed.title ? `${parsed.title}\n\n` : '';
    for (const paragraph of parsed.content ?? []) {
      for (const el of paragraph) {
        if (el.tag === 'text') text += el.text ?? '';
        else if (el.tag === 'a') text += el.text ?? el.href ?? '';
        else if (el.tag === 'at') text += `@${el.user_name ?? ''}`;
      }
      text += '\n';
    }
    return text.trim() || '[富文本消息]';
  } catch {
    return '[富文本消息]';
  }
}

export class FeishuChannel extends ChannelAdapter {
  readonly channelType = 'feishu' as const;

  private _status: ChannelStatus = 'stopped';
  private wsClient: WSClient | null = null;
  private restClient: Client | null = null;
  private botOpenId: string | null = null;
  private readonly mediaDir = join(tmpdir(), 'swell-lobster', 'feishu-media');

  private get cfg(): FeishuConfig {
    return this.config as unknown as FeishuConfig;
  }

  private get appId(): string {
    if (this.cfg.app_id?.trim()) return this.cfg.app_id.trim();
    const envName = this.cfg.app_id_env?.trim();
    if (!envName) throw new Error('未配置飞书 App ID（app_id 或 app_id_env）');
    const value = this.readEnvVar(envName);
    if (!value) throw new Error(`环境变量 ${envName} 未设置`);
    return value;
  }

  private get appSecret(): string {
    if (this.cfg.app_secret?.trim()) return this.cfg.app_secret.trim();
    const envName = this.cfg.app_secret_env?.trim();
    if (!envName) throw new Error('未配置飞书 App Secret（app_secret 或 app_secret_env）');
    const value = this.readEnvVar(envName);
    if (!value) throw new Error(`环境变量 ${envName} 未设置`);
    return value;
  }

  async start(): Promise<void> {
    const Lark: LarkModule = await import('@larksuiteoapi/node-sdk');
    const appId = this.appId;
    const appSecret = this.appSecret;
    const domain = this.cfg.domain === 'lark' ? Lark.Domain.Lark : Lark.Domain.Feishu;

    const restClient = new Lark.Client({
      appId,
      appSecret,
      appType: Lark.AppType.SelfBuild,
      domain,
    });

    const botProbe = await restClient.request({ method: 'GET', url: '/open-apis/bot/v3/info' });
    if (botProbe.code !== 0) {
      throw new Error(`飞书凭证验证失败: ${botProbe.msg ?? botProbe.code}`);
    }
    this.botOpenId =
      (botProbe.data?.open_id as string | undefined) ??
      ((botProbe.data?.bot as Record<string, unknown> | undefined)?.open_id as string | undefined) ??
      null;

    const wsClient = new Lark.WSClient({ appId, appSecret, domain });
    const eventDispatcher = new Lark.EventDispatcher({});

    eventDispatcher.register({
      'im.message.receive_v1': async (data: FeishuMessageEvent) => {
        try {
          await this.handleInboundMessage(data);
        } catch (err: unknown) {
          console.error('[Feishu] handleInboundMessage error:', err);
        }
      },
      'im.message.message_read_v1': async () => {},
    });

    wsClient.start({ eventDispatcher });
    this.wsClient = wsClient;
    this.restClient = restClient;
    this._status = 'running';
    mkdirSync(this.mediaDir, { recursive: true });
  }

  async stop(): Promise<void> {
    this.wsClient = null;
    this.restClient = null;
    this.botOpenId = null;
    this._status = 'stopped';
  }

  getStatus(): ChannelStatus {
    return this._status;
  }

  async sendMessage(chatId: string, content: string, _options?: SendOptions): Promise<void> {
    if (!this.restClient) throw new Error('飞书通道未启动');
    const receiveIdType = resolveReceiveIdType(chatId);
    const response = await this.restClient.im.message.create({
      params: { receive_id_type: receiveIdType },
      data: {
        receive_id: chatId,
        msg_type: 'text',
        content: JSON.stringify({ text: content }),
      },
    });
    if (response.code !== 0) {
      throw new Error(`飞书发送消息失败: ${response.msg ?? response.code}`);
    }
  }

  private async handleInboundMessage(event: FeishuMessageEvent): Promise<void> {
    const messageId = event.message.message_id;
    if (isMessageProcessed(messageId)) return;

    const chatId = event.message.chat_id?.trim();
    if (!chatId) return;

    const userId =
      event.sender.sender_id.open_id?.trim() ??
      event.sender.sender_id.user_id?.trim() ??
      `feishu_anon_${chatId.slice(-8)}`;
    const messageType = event.message.message_type;

    const unified = await this.buildUnifiedMessage({
      messageId,
      chatId,
      userId,
      messageType,
      content: event.message.content ?? '{}',
      mentions: event.message.mentions,
    });

    if (unified) {
      await this.onMessage?.(unified);
    }
  }

  private async buildUnifiedMessage(params: {
    messageId: string;
    chatId: string;
    userId: string;
    messageType: string;
    content: string;
    mentions?: Array<{ id: { open_id: string }; name: string; key: string }>;
  }): Promise<UnifiedMessage | null> {
    const { messageId, chatId, userId, messageType, content } = params;

    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(content) as Record<string, unknown>;
    } catch {}

    if (messageType === 'text') {
      let text = String(parsed.text ?? '').trim();
      if (params.mentions?.length) {
        for (const m of params.mentions) {
          if (m.id.open_id !== this.botOpenId) continue;
          text = text.replace(new RegExp(`@${m.name}\\s*`, 'g'), '').trim();
          text = text.replace(new RegExp(m.key, 'g'), '').trim();
        }
      }
      if (!text) return null;
      return this.buildMsg(chatId, userId, messageId, text);
    }

    if (messageType === 'post') {
      const text = parsePostContent(content).trim();
      return text ? this.buildMsg(chatId, userId, messageId, text) : null;
    }

    if (messageType === 'image') {
      const imageKey = String(parsed.image_key ?? '').trim();
      if (!imageKey) {
        return this.buildMsg(chatId, userId, messageId, '[收到一张图片，但未拿到 image_key]');
      }
      try {
        const image = await this.downloadMedia(messageId, imageKey, 'image');
        return {
          channel_type: 'feishu',
          channel_id: this.channelId,
          chat_id: chatId,
          user_id: userId,
          message_id: messageId,
          text: '请描述这张图片',
          images: [image],
          timestamp: new Date(),
        };
      } catch {
        return this.buildMsg(chatId, userId, messageId, '[收到一张图片，下载失败]');
      }
    }

    return this.buildMsg(chatId, userId, messageId, `[当前暂不支持处理飞书 ${messageType} 消息]`);
  }

  private buildMsg(chatId: string, userId: string, messageId: string, text: string): UnifiedMessage {
    return {
      channel_type: 'feishu',
      channel_id: this.channelId,
      chat_id: chatId,
      user_id: userId,
      message_id: messageId,
      text,
      timestamp: new Date(),
    };
  }

  private async downloadMedia(
    messageId: string,
    fileKey: string,
    type: 'image' | 'file'
  ): Promise<{ base64: string; mimeType: string }> {
    if (!this.restClient) throw new Error('restClient not ready');
    const localPath = join(this.mediaDir, `feishu_${type}_${fileKey.slice(0, 12)}.jpg`);
    await this.restClient.im.messageResource
      .get({ path: { message_id: messageId, file_key: fileKey }, params: { type } })
      .then((r) => r.writeFile(localPath));
    const { readFile } = await import('node:fs/promises');
    const bytes = await readFile(localPath);
    await writeFile(localPath, bytes);
    return { base64: bytes.toString('base64'), mimeType: 'image/jpeg' };
  }
}
