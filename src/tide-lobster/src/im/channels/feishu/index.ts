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

/** 将非 ASCII 字符转为 \uXXXX，避免飞书 API 对编码的潜在问题（参考 LobsterAI stringifyAsciiJson） */
function asciiJson(value: unknown): string {
  return JSON.stringify(value).replace(
    /[^\x00-\x7F]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`
  );
}

/**
 * 是否包含需要走卡片渲染的 Markdown 结构。
 * v2 卡片 markdown 元素已原生支持下列全部语法，命中任意一项即用卡片，
 * 否则当作纯文本（短回复、emoji ack 等）走 text 消息以减小负载。
 */
function hasMarkdownSyntax(text: string): boolean {
  return (
    /^#{1,6}\s/m.test(text) || // 标题
    /\*\*[^*\n]+\*\*/.test(text) || // 粗体 **
    /__[^_\n]+__/.test(text) || // 粗体 __
    /```[\s\S]*?```/.test(text) || // 代码块
    /`[^`\n]+`/.test(text) || // 行内代码
    /\[[^\]\n]+\]\([^)\n]+\)/.test(text) || // 链接
    /^\s*(?:[-*+]|\d+\.)\s+/m.test(text) || // 有序/无序列表
    /^\s{0,3}>\s+/m.test(text) || // 引用块
    /^\s{0,3}\|.+\|\s*$/m.test(text) || // 表格
    /^\s{0,3}-{3,}\s*$/m.test(text) // 分隔线
  );
}

/**
 * 构造飞书卡片 v2 (schema 2.0) JSON：markdown 元素原生支持标题/列表/表格/
 * 引用块/代码块/行内代码/分隔线，无需手工预处理。
 *
 * 文档参考：
 * https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-json-v2-components/content-components/rich-text
 *
 * 注意：必须显式声明 `schema: "2.0"`，否则飞书会按 v1 解析（v1 不支持标题/表格/引用块）。
 */
function buildMarkdownCard(content: string): string {
  return asciiJson({
    schema: '2.0',
    body: {
      elements: [{ tag: 'markdown', content }],
    },
  });
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
    const preferredDomain = (this.cfg.domain === 'lark'
      ? Lark.Domain.Lark
      : Lark.Domain.Feishu) as unknown as number;

    // 凭证 / 域名探针：失败时把飞书返回的 code+msg 暴露出来；
    // 若域名错配（feishu vs lark）首次会拿到 99991663 之类的鉴权错误，
    // 再用另一个域名重试一次，避免用户在扫码时选错版本就直接卡住。
    const probe = await this.probeBotIdentity(Lark, appId, appSecret, preferredDomain);
    const restClient = probe.client;
    this.botOpenId = probe.openId;

    const wsClient = new Lark.WSClient({
      appId,
      appSecret,
      domain: probe.domain as unknown as ConstructorParameters<LarkModule['WSClient']>[0]['domain'],
    });
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

  /**
   * 启动前的凭证 + 域名探针。
   * 1. 用首选 domain 调 `/open-apis/bot/v3/info`；
   * 2. 拿到非 0 业务码或 axios 异常时，抓取响应体中的 code/msg，转成中文错误；
   * 3. 鉴权类失败再用另一个 domain（feishu↔lark）重试一次，避开扫码版本选错的常见坑；
   * 4. 两种 domain 都失败时抛出最后一次的详细错误，便于用户判断到底是密钥错还是版本错。
   *
   * 注意：SDK 的 `Domain` 是数字枚举（Feishu=0 / Lark=1），SDK 内部依据数值映射到
   * 真正的 base URL（feishu.cn / larksuite.com）。这里全程保持原始枚举数值，
   * 不要 `String()` 化——一旦字符串化，axios 会把 "0" / "1" 当成 base URL，
   * 拼出 `0/open-apis/...` 之类的非法 URL。
   */
  private async probeBotIdentity(
    Lark: LarkModule,
    appId: string,
    appSecret: string,
    preferredDomain: number
  ): Promise<{
    client: InstanceType<LarkModule['Client']>;
    domain: number;
    openId: string | null;
  }> {
    const larkDomain = Lark.Domain.Lark as unknown as number;
    const feishuDomain = Lark.Domain.Feishu as unknown as number;
    const altDomain = preferredDomain === larkDomain ? feishuDomain : larkDomain;
    const tries: number[] = [preferredDomain, altDomain];
    let lastError: Error | null = null;

    for (const domain of tries) {
      const client = new Lark.Client({
        appId,
        appSecret,
        appType: Lark.AppType.SelfBuild,
        domain: domain as unknown as LarkModule['Domain'][keyof LarkModule['Domain']],
      });
      try {
        const r = (await client.request({
          method: 'GET',
          url: '/open-apis/bot/v3/info',
        })) as {
          code?: number;
          msg?: string;
          data?: Record<string, unknown>;
          bot?: Record<string, unknown>;
        };
        if (r?.code === 0) {
          const openId =
            (r.data?.open_id as string | undefined) ??
            ((r.data?.bot as Record<string, unknown> | undefined)?.open_id as string | undefined) ??
            ((r.bot as Record<string, unknown> | undefined)?.open_id as string | undefined) ??
            null;
          return { client, domain, openId };
        }
        lastError = new Error(
          `飞书凭证验证失败（${this.domainLabel(domain, Lark)}）：code=${r?.code ?? '?'} msg=${r?.msg ?? '未知'}`
        );
      } catch (err: unknown) {
        lastError = this.formatProbeError(err, domain, Lark);
      }
    }

    throw lastError ?? new Error('飞书凭证验证失败');
  }

  private formatProbeError(err: unknown, domain: number, Lark: LarkModule): Error {
    if (err && typeof err === 'object' && 'isAxiosError' in err) {
      const axErr = err as {
        response?: { status?: number; data?: { code?: number; msg?: string } };
      };
      const status = axErr.response?.status;
      const body = axErr.response?.data;
      if (body && typeof body === 'object' && (body.code !== undefined || body.msg)) {
        return new Error(
          `飞书凭证验证失败（${this.domainLabel(domain, Lark)}）：HTTP ${status ?? '?'} code=${body.code ?? '?'} msg=${body.msg ?? '未知'}`
        );
      }
      return new Error(
        `飞书凭证验证失败（${this.domainLabel(domain, Lark)}）：HTTP ${status ?? '?'}`
      );
    }
    if (err instanceof Error) {
      return new Error(`飞书凭证验证失败（${this.domainLabel(domain, Lark)}）：${err.message}`);
    }
    return new Error(`飞书凭证验证失败（${this.domainLabel(domain, Lark)}）：${String(err)}`);
  }

  private domainLabel(domain: number, Lark: LarkModule): string {
    if (domain === (Lark.Domain.Lark as unknown as number)) return 'Lark 国际版';
    if (domain === (Lark.Domain.Feishu as unknown as number)) return '飞书国内版';
    return String(domain);
  }

  getStatus(): ChannelStatus {
    return this._status;
  }

  async sendMessage(chatId: string, content: string, options?: SendOptions): Promise<void> {
    if (!this.restClient) throw new Error('飞书通道未启动');
    const useCard = hasMarkdownSyntax(content);
    const msgType = useCard ? 'interactive' : 'text';
    const msgContent = useCard ? buildMarkdownCard(content) : asciiJson({ text: content });

    const replyToMessageId = options?.replyToMessageId;
    if (replyToMessageId) {
      const response = await this.restClient.im.message.reply({
        path: { message_id: replyToMessageId },
        data: { content: msgContent, msg_type: msgType },
      });
      if (response.code !== 0) {
        throw new Error(`飞书回复消息失败: ${response.msg ?? response.code}`);
      }
      return;
    }

    const receiveIdType = resolveReceiveIdType(chatId);
    const response = await this.restClient.im.message.create({
      params: { receive_id_type: receiveIdType },
      data: { receive_id: chatId, msg_type: msgType, content: msgContent },
    });
    if (response.code !== 0) {
      throw new Error(`飞书发送消息失败: ${response.msg ?? response.code}`);
    }
  }

  private async addReaction(messageId: string, emojiType: string): Promise<void> {
    if (!this.restClient) return;
    try {
      await this.restClient.request({
        method: 'POST',
        url: `/open-apis/im/v1/messages/${messageId}/reactions`,
        data: { reaction_type: { emoji_type: emojiType } },
      });
    } catch {
      // reaction 失败不影响主流程
    }
  }

  private async handleInboundMessage(event: FeishuMessageEvent): Promise<void> {
    const messageId = event.message.message_id;
    if (isMessageProcessed(messageId)) return;

    // 立即给消息加「在处理」反应，无需等待 LLM 回复（fire-and-forget）
    void this.addReaction(messageId, 'Get');

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

  private buildMsg(
    chatId: string,
    userId: string,
    messageId: string,
    text: string
  ): UnifiedMessage {
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
