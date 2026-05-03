import { mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { DWClient, EventAck, TOPIC_ROBOT, type DWClientDownStream } from 'dingtalk-stream';
import { ChannelAdapter } from '../../base.js';
import type { ChannelStatus, SendOptions, UnifiedMessage } from '../../types.js';
import { getFetchDispatcherForUrl } from '../../../net/fetchDispatcher.js';

type DingtalkContent =
  | string
  | {
      content?: string;
      text?: string;
      recognition?: string;
      duration?: number;
      fileName?: string;
      downloadCode?: string;
      pictureDownloadCode?: string;
      richText?: Array<Record<string, unknown>>;
    };

export type DingtalkStreamPayload = {
  msgtype?: string;
  text?: { content?: string };
  content?: DingtalkContent;
  conversationId?: string;
  conversationType?: string;
  senderId?: string;
  senderStaffId?: string;
  senderNick?: string;
  msgId?: string;
  msg_id?: string;
  sessionWebhook?: string;
  sessionWebhookExpiredTime?: number;
  createAt?: number;
  atUsers?: Array<{ dingtalkId?: string }>;
  isInAtList?: boolean;
};

export interface DingtalkConfig {
  /** 钉钉 Client ID / AppKey 的环境变量名。 */
  client_id_env?: string;
  /** 钉钉 Client Secret / AppSecret 的环境变量名。 */
  client_secret_env?: string;
  /** 可选；发送 OpenAPI 消息时使用的 robotCode，缺省回落到 clientId。 */
  robot_code?: string;
}

type CachedWebhook = {
  expiresAtMs: number;
  url: string;
};

const API_BASE = 'https://oapi.dingtalk.com';
const API_NEW = 'https://api.dingtalk.com/v1.0';
const WEBHOOK_TTL_MS = 2 * 60 * 60 * 1000;

function normalizeText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  return value || null;
}

function parseContent(content: DingtalkContent | undefined): Record<string, unknown> {
  if (!content) return {};
  if (typeof content === 'string') {
    try {
      return JSON.parse(content) as Record<string, unknown>;
    } catch {
      return { content };
    }
  }
  return content;
}

function inferImageExtension(contentType: string | null): string {
  if (!contentType) return '.jpg';
  if (contentType.includes('png')) return '.png';
  if (contentType.includes('webp')) return '.webp';
  if (contentType.includes('gif')) return '.gif';
  return '.jpg';
}

function normalizeSenderId(raw: string | undefined): string | null {
  if (!raw) return null;
  const normalized = raw.replace(/^\$:[^:]+:\$/, '').trim();
  return normalized || null;
}

export class DingtalkChannel extends ChannelAdapter {
  readonly channelType = 'dingtalk' as const;

  private _status: ChannelStatus = 'stopped';
  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;
  private client: DWClient | null = null;
  private readonly conversationTypes = new Map<string, string>();
  private readonly sessionWebhooks = new Map<string, CachedWebhook>();
  private readonly conversationUsers = new Map<string, string>();
  private readonly mediaDir = join(tmpdir(), 'swell-lobster', 'dingtalk-media');

  private get cfg(): DingtalkConfig {
    return this.config as unknown as DingtalkConfig;
  }

  private get clientId(): string {
    const envName = this.cfg.client_id_env?.trim();
    if (!envName) throw new Error('未配置钉钉 Client ID 环境变量名');
    const value = this.readEnvVar(envName);
    if (!value) throw new Error(`环境变量 ${envName} 未设置`);
    return value;
  }

  private get clientSecret(): string {
    const envName = this.cfg.client_secret_env?.trim();
    if (!envName) throw new Error('未配置钉钉 Client Secret 环境变量名');
    const value = this.readEnvVar(envName);
    if (!value) throw new Error(`环境变量 ${envName} 未设置`);
    return value;
  }

  private get robotCode(): string {
    return this.cfg.robot_code?.trim() || this.clientId;
  }

  async start(): Promise<void> {
    await this.refreshAccessToken();
    const client = new DWClient({
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      debug: false,
      keepAlive: true,
    });

    client.registerAllEventListener((message) => {
      this.handleClientEvent(message);
      return { status: EventAck.SUCCESS };
    });

    await client.connect();
    this.client = client;
    this._status = 'running';
    mkdirSync(this.mediaDir, { recursive: true });
  }

  async stop(): Promise<void> {
    this.client?.disconnect();
    this.client = null;
    this._status = 'stopped';
    this.sessionWebhooks.clear();
    this.conversationTypes.clear();
    this.conversationUsers.clear();
  }

  getStatus(): ChannelStatus {
    return this._status;
  }

  async sendMessage(chatId: string, content: string, _options?: SendOptions): Promise<void> {
    const webhook = this.getValidSessionWebhook(chatId);
    if (webhook) {
      await this.sendViaWebhook(webhook, content);
      return;
    }

    if (this.isGroupConversation(chatId)) {
      await this.sendGroupMessage(chatId, content);
      return;
    }

    const userId = this.conversationUsers.get(chatId);
    if (!userId) {
      throw new Error('缺少可用于单聊回复的 senderStaffId，且 sessionWebhook 已失效');
    }
    await this.sendPrivateMessage(userId, content);
  }

  async handleStreamPayload(payload: DingtalkStreamPayload): Promise<void> {
    const conversationId = payload.conversationId?.trim();
    if (!conversationId) return;

    const conversationType = payload.conversationType?.trim() || '1';
    const senderStaffId = payload.senderStaffId?.trim() || '';
    const senderId = normalizeSenderId(payload.senderId);
    const userId = senderStaffId || senderId || `anon_${conversationId.slice(0, 12)}`;
    const messageId = payload.msgId || payload.msg_id || `${Date.now()}`;

    this.conversationTypes.set(conversationId, conversationType);
    if (senderStaffId) {
      this.conversationUsers.set(conversationId, senderStaffId);
    }
    if (payload.sessionWebhook?.trim()) {
      this.saveSessionWebhook(
        conversationId,
        payload.sessionWebhook.trim(),
        payload.sessionWebhookExpiredTime
      );
    }

    const message = await this.buildUnifiedMessage(payload, conversationId, userId, messageId);
    if (!message) return;
    await this.onMessage?.(message);
  }

  private handleClientEvent(message: DWClientDownStream): void {
    if (message.headers.topic !== TOPIC_ROBOT) return;
    let payload: DingtalkStreamPayload;
    try {
      payload = JSON.parse(message.data) as DingtalkStreamPayload;
    } catch (error) {
      console.error('[DingTalk] invalid stream payload:', error);
      return;
    }

    void this.handleStreamPayload(payload).catch((error) => {
      console.error('[DingTalk] handle stream payload failed:', error);
    });
  }

  private async buildUnifiedMessage(
    payload: DingtalkStreamPayload,
    conversationId: string,
    userId: string,
    messageId: string
  ): Promise<UnifiedMessage | null> {
    const msgType = payload.msgtype?.trim() || 'text';
    const content = parseContent(payload.content);

    if (msgType === 'text') {
      const text = normalizeText(payload.text?.content ?? content.content ?? content.text);
      if (!text) return null;
      return {
        channel_type: 'dingtalk',
        channel_id: this.channelId,
        chat_id: conversationId,
        user_id: userId,
        message_id: messageId,
        text,
        timestamp: new Date(),
      };
    }

    if (msgType === 'picture') {
      const downloadCode = String(content.downloadCode || content.pictureDownloadCode || '').trim();
      if (!downloadCode) {
        return this.buildPlaceholderMessage(conversationId, userId, messageId, '[收到一张图片，但未拿到下载码]');
      }
      const image = await this.downloadImage(downloadCode, `dingtalk_image_${downloadCode.slice(0, 8)}`);
      return {
        channel_type: 'dingtalk',
        channel_id: this.channelId,
        chat_id: conversationId,
        user_id: userId,
        message_id: messageId,
        text: payload.text?.content?.trim() || '请描述这张图片',
        images: [image],
        timestamp: new Date(),
      };
    }

    if (msgType === 'richText') {
      const richText = Array.isArray(content.richText) ? content.richText : [];
      const textParts: string[] = [];
      const images: UnifiedMessage['images'] = [];
      for (const item of richText) {
        const text = normalizeText(item.text);
        if (text) textParts.push(text);
        const downloadCode = normalizeText(item.downloadCode ?? item.pictureDownloadCode);
        if (downloadCode) {
          images?.push(
            await this.downloadImage(downloadCode, `dingtalk_rich_image_${downloadCode.slice(0, 8)}`)
          );
        }
      }

      return {
        channel_type: 'dingtalk',
        channel_id: this.channelId,
        chat_id: conversationId,
        user_id: userId,
        message_id: messageId,
        text: textParts.join('\n') || (images?.length ? '请描述图片内容' : '[空富文本消息]'),
        images: images?.length ? images : undefined,
        timestamp: new Date(),
      };
    }

    if (msgType === 'audio') {
      const recognition = normalizeText(content.recognition);
      const text = recognition || '[收到一条语音消息，当前未启用钉钉语音转写]';
      return this.buildPlaceholderMessage(conversationId, userId, messageId, text);
    }

    if (msgType === 'video') {
      const text = normalizeText(content.fileName) || '[收到一段视频消息]';
      return this.buildPlaceholderMessage(conversationId, userId, messageId, text);
    }

    if (msgType === 'file') {
      const fileName = normalizeText(content.fileName) || '未命名文件';
      return this.buildPlaceholderMessage(conversationId, userId, messageId, `[收到文件] ${fileName}`);
    }

    return this.buildPlaceholderMessage(
      conversationId,
      userId,
      messageId,
      `[当前暂不支持处理钉钉 ${msgType} 消息]`
    );
  }

  private buildPlaceholderMessage(
    conversationId: string,
    userId: string,
    messageId: string,
    text: string
  ): UnifiedMessage {
    return {
      channel_type: 'dingtalk',
      channel_id: this.channelId,
      chat_id: conversationId,
      user_id: userId,
      message_id: messageId,
      text,
      timestamp: new Date(),
    };
  }

  private saveSessionWebhook(
    conversationId: string,
    url: string,
    expiresAtMs?: number
  ): void {
    this.sessionWebhooks.set(conversationId, {
      expiresAtMs: expiresAtMs ?? Date.now() + WEBHOOK_TTL_MS,
      url,
    });
  }

  private getValidSessionWebhook(conversationId: string): string | null {
    const cached = this.sessionWebhooks.get(conversationId);
    if (!cached) return null;
    if (cached.expiresAtMs <= Date.now()) {
      this.sessionWebhooks.delete(conversationId);
      return null;
    }
    return cached.url;
  }

  private isGroupConversation(conversationId: string): boolean {
    return this.conversationTypes.get(conversationId) === '2';
  }

  private async sendViaWebhook(webhookUrl: string, content: string): Promise<void> {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msgtype: 'text',
        text: { content },
      }),
      // @ts-expect-error undici dispatcher
      dispatcher: getFetchDispatcherForUrl(webhookUrl),
    });
    if (!response.ok) {
      throw new Error(`钉钉 sessionWebhook 回复失败: HTTP ${response.status}`);
    }
    const result = (await response.json()) as { errcode?: number; errmsg?: string };
    if ((result.errcode ?? 0) !== 0) {
      throw new Error(`钉钉 sessionWebhook 回复失败: ${result.errmsg ?? result.errcode}`);
    }
  }

  private async sendGroupMessage(conversationId: string, content: string): Promise<void> {
    const token = await this.refreshAccessToken();
    const url = `${API_NEW}/robot/groupMessages/send`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-acs-dingtalk-access-token': token,
      },
      body: JSON.stringify({
        msgKey: 'sampleText',
        msgParam: JSON.stringify({ content }),
        openConversationId: conversationId,
        robotCode: this.robotCode,
      }),
      // @ts-expect-error undici dispatcher
      dispatcher: getFetchDispatcherForUrl(url),
    });
    if (!response.ok) {
      throw new Error(`钉钉群聊回复失败: HTTP ${response.status}`);
    }
  }

  private async sendPrivateMessage(userId: string, content: string): Promise<void> {
    const token = await this.refreshAccessToken();
    const url = `${API_NEW}/robot/oToMessages/batchSend`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-acs-dingtalk-access-token': token,
      },
      body: JSON.stringify({
        msgKey: 'sampleText',
        msgParam: JSON.stringify({ content }),
        robotCode: this.robotCode,
        userIds: [userId],
      }),
      // @ts-expect-error undici dispatcher
      dispatcher: getFetchDispatcherForUrl(url),
    });
    if (!response.ok) {
      throw new Error(`钉钉单聊回复失败: HTTP ${response.status}`);
    }
  }

  private async refreshAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.accessTokenExpiresAt) {
      return this.accessToken;
    }

    const url = `${API_NEW}/oauth2/accessToken`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appKey: this.clientId,
        appSecret: this.clientSecret,
      }),
      // @ts-expect-error undici dispatcher
      dispatcher: getFetchDispatcherForUrl(url),
    });
    if (!response.ok) {
      throw new Error(`获取钉钉 accessToken 失败: HTTP ${response.status}`);
    }

    const data = (await response.json()) as { accessToken?: string; expireIn?: number; message?: string };
    if (!data.accessToken) {
      throw new Error(`获取钉钉 accessToken 失败: ${data.message ?? 'missing accessToken'}`);
    }

    this.accessToken = data.accessToken;
    this.accessTokenExpiresAt = Date.now() + ((data.expireIn ?? 7200) - 300) * 1000;
    return data.accessToken;
  }

  private async downloadImage(
    downloadCode: string,
    baseName: string
  ): Promise<{ base64: string; mimeType: string }> {
    const token = await this.refreshAccessToken();
    const url = `${API_NEW}/robot/messageFiles/download`;
    const metaResponse = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-acs-dingtalk-access-token': token,
      },
      body: JSON.stringify({
        downloadCode,
        robotCode: this.robotCode,
      }),
      // @ts-expect-error undici dispatcher
      dispatcher: getFetchDispatcherForUrl(url),
    });
    if (!metaResponse.ok) {
      throw new Error(`获取钉钉图片下载地址失败: HTTP ${metaResponse.status}`);
    }
    const meta = (await metaResponse.json()) as { downloadUrl?: string; message?: string };
    if (!meta.downloadUrl) {
      throw new Error(`获取钉钉图片下载地址失败: ${meta.message ?? 'missing downloadUrl'}`);
    }

    const fileResponse = await fetch(meta.downloadUrl, {
      // @ts-expect-error undici dispatcher
      dispatcher: getFetchDispatcherForUrl(meta.downloadUrl),
    });
    if (!fileResponse.ok) {
      throw new Error(`下载钉钉图片失败: HTTP ${fileResponse.status}`);
    }

    const mimeType = fileResponse.headers.get('content-type') || 'image/jpeg';
    const bytes = Buffer.from(await fileResponse.arrayBuffer());
    const extension = extname(new URL(meta.downloadUrl).pathname) || inferImageExtension(mimeType);
    const localPath = join(this.mediaDir, `${baseName}${extension}`);
    await writeFile(localPath, bytes);

    return {
      base64: bytes.toString('base64'),
      mimeType,
    };
  }
}
