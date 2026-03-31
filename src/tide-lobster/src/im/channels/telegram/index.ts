/**
 * Telegram Bot 适配器（grammy）。
 *
 * Token 不写入 DB，仅通过 `bot_token_env` 指向进程环境（或 `.env`）中的变量名。
 * 支持文本与带图消息：图片拉取为 base64 后走多模态聊天；出站优先 Markdown，失败则降级纯文本。
 *
 * 安全模型（`dm_policy`）：
 * - `pairing`（默认）：未认证用户收到配对码提示，管理员通过 API 审批后方可对话。
 *   `allowed_user_ids` 中的用户始终放行，无需配对。
 * - `allowlist`：仅 `allowed_user_ids` 中的用户可交互，完全无配对码流程。
 */
import { Bot, type Context } from 'grammy';
import { ChannelAdapter } from '../../base.js';
import type { ChannelStatus, SendOptions, UnifiedMessage } from '../../types.js';
import { isApprovedUser, upsertPendingRequest } from './pairing.js';

/** 持久化在 `im_channels.config` 中的结构（由前端表单序列化） */
export interface TelegramConfig {
  /** 环境变量名，如 TELEGRAM_BOT_TOKEN，值为 BotFather 下发的 token */
  bot_token_env: string;
  /**
   * DM 访问策略：
   * - `pairing`（默认）：未知用户需通过配对码审批
   * - `allowlist`：仅白名单用户可访问
   */
  dm_policy?: 'pairing' | 'allowlist';
  /** 白名单用户 ID；`pairing` 策略下始终放行，`allowlist` 策略下是唯一准入来源 */
  allowed_user_ids?: number[];
}

export class TelegramChannel extends ChannelAdapter {
  readonly channelType = 'telegram' as const;
  private bot: Bot | null = null;
  private _status: ChannelStatus = 'stopped';

  private get cfg(): TelegramConfig {
    return this.config as unknown as TelegramConfig;
  }

  /**
   * 创建 Bot、注册 text/photo 处理器并启动 long polling。
   * `bot.start()` 在后台运行；若抛错则异步将状态置为 `error`。
   */
  async start(): Promise<void> {
    const token = process.env[this.cfg.bot_token_env];
    if (!token) throw new Error(`环境变量 ${this.cfg.bot_token_env} 未设置`);

    this.bot = new Bot(token);
    this.bot.on('message:text', (ctx) => void this.handleText(ctx));
    this.bot.on('message:photo', (ctx) => void this.handlePhoto(ctx));

    // start() 是非阻塞的（内部启动 long polling 协程），不需要 await
    this.bot.start().catch((_err: unknown) => {
      this._status = 'error';
    });

    this._status = 'running';
  }

  /** 停止 grammy 轮询并清空引用 */
  async stop(): Promise<void> {
    await this.bot?.stop();
    this.bot = null;
    this._status = 'stopped';
  }

  getStatus(): ChannelStatus {
    return this._status;
  }

  /**
   * `chatId` 为 Telegram 的 chat id（私聊与群均为数字字符串）。
   * 先尝试 Markdown，失败则再发一次无 parse_mode，避免用户看到发送失败。
   */
  async sendMessage(chatId: string, content: string, _options?: SendOptions): Promise<void> {
    if (!this.bot) return;
    try {
      await this.bot.api.sendMessage(Number(chatId), content, { parse_mode: 'Markdown' });
    } catch {
      // Markdown 解析失败时降级为纯文本
      await this.bot.api.sendMessage(Number(chatId), content);
    }
  }

  /**
   * 访问控制检查。
   *
   * - `allowlist` 策略：仅 `allowed_user_ids` 中的用户通过。
   * - `pairing` 策略（默认）：`allowed_user_ids` 直通；已通过配对审批的用户通过；
   *   其他用户签发配对码并返回 `false`。
   *
   * 返回 `true` 表示允许，`false` 表示拒绝（已向用户发送提示）。
   */
  private async checkAccess(ctx: Context, userId: number): Promise<boolean> {
    const policy = this.cfg.dm_policy ?? 'pairing';
    const whitelist = this.cfg.allowed_user_ids ?? [];

    // 白名单始终放行（两种策略均适用）
    if (whitelist.includes(userId)) return true;

    if (policy === 'allowlist') {
      await ctx.reply('抱歉，您没有访问权限。');
      return false;
    }

    // pairing 策略：检查是否已批准
    if (isApprovedUser(this.channelId, userId)) return true;

    // 未授权：生成/刷新配对码并提示用户
    const code = upsertPendingRequest(this.channelId, userId, {
      first_name: ctx.from?.first_name,
      username: ctx.from?.username,
    });

    await ctx.reply(
      `🔐 *访问需要授权*\n\n` +
        `请将以下配对码发送给管理员，由管理员通过后台审批后您即可使用。\n\n` +
        `配对码：\`${code}\`\n\n` +
        `_授权通过后，重新发送消息即可开始对话。_`,
      { parse_mode: 'Markdown' }
    );
    return false;
  }

  /** 文本消息：校验权限 → 构造 `UnifiedMessage` → typing → 交给 `onMessage` */
  private async handleText(ctx: Context): Promise<void> {
    const userId = ctx.from?.id;
    const text = ctx.message?.text;
    if (!userId || !text) return;

    const allowed = await this.checkAccess(ctx, userId);
    if (!allowed) return;

    if (!ctx.chat) return;

    const msg: UnifiedMessage = {
      channel_type: 'telegram',
      channel_id: this.channelId,
      chat_id: String(ctx.chat.id),
      user_id: String(userId),
      message_id: String(ctx.message!.message_id),
      text,
      timestamp: new Date(),
    };

    const stopTyping = this.keepTyping(ctx.chat.id);
    try {
      await this.onMessage?.(msg);
    } finally {
      stopTyping();
    }
  }

  /**
   * 图片消息：取最大尺寸 `photo` 文件，经 Bot API 下载 URL 转 base64；
   * caption 写入 `text`/`caption` 供模型理解，mime 暂固定为 jpeg（与 Telegram 常见行为一致）。
   */
  private async handlePhoto(ctx: Context): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;

    const allowed = await this.checkAccess(ctx, userId);
    if (!allowed) return;

    if (!ctx.chat) return;

    const photo = ctx.message?.photo?.at(-1);
    if (!photo) return;

    const token = process.env[this.cfg.bot_token_env]!;
    let base64 = '';
    try {
      const file = await ctx.api.getFile(photo.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
      const buffer = await fetch(fileUrl).then((r) => r.arrayBuffer());
      base64 = Buffer.from(buffer).toString('base64');
    } catch {
      await ctx.reply('抱歉，图片下载失败。');
      return;
    }

    const msg: UnifiedMessage = {
      channel_type: 'telegram',
      channel_id: this.channelId,
      chat_id: String(ctx.chat.id),
      user_id: String(userId),
      message_id: String(ctx.message!.message_id),
      text: ctx.message?.caption ?? null,
      images: [{ base64, mimeType: 'image/jpeg' }],
      caption: ctx.message?.caption ?? undefined,
      timestamp: new Date(),
    };

    const stopTyping = this.keepTyping(ctx.chat.id);
    try {
      await this.onMessage?.(msg);
    } finally {
      stopTyping();
    }
  }

  /**
   * 每隔 4 秒向指定 chat 发送 typing 动作，持续到调用返回的 stop 函数为止。
   * 立即发送第一次，避免首帧空白；超过 `maxMs`（默认 120 秒）自动停止，防止异常时泄漏。
   */
  private keepTyping(chatId: number, maxMs = 120_000): () => void {
    const send = () => {
      void this.bot?.api.sendChatAction(chatId, 'typing').catch(() => {});
    };
    send(); // 立即发一次
    const timer = setInterval(send, 4_000);
    const guard = setTimeout(() => clearInterval(timer), maxMs);
    return () => {
      clearInterval(timer);
      clearTimeout(guard);
    };
  }
}
