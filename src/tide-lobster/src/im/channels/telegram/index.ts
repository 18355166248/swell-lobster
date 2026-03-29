import { Bot, type Context } from 'grammy';
import { ChannelAdapter } from '../../base.js';
import type { ChannelStatus, SendOptions, UnifiedMessage } from '../../types.js';

export interface TelegramConfig {
  bot_token_env: string; // 存储 token 的环境变量名，如 "TELEGRAM_BOT_TOKEN"
  allowed_user_ids?: number[]; // 白名单，为空则不限制
}

export class TelegramChannel extends ChannelAdapter {
  readonly channelType = 'telegram' as const;
  private bot: Bot | null = null;
  private _status: ChannelStatus = 'stopped';
  private _error: string | null = null;

  private get cfg(): TelegramConfig {
    return this.config as unknown as TelegramConfig;
  }

  async start(): Promise<void> {
    const token = process.env[this.cfg.bot_token_env];
    if (!token) throw new Error(`环境变量 ${this.cfg.bot_token_env} 未设置`);

    this.bot = new Bot(token);
    this.bot.on('message:text', (ctx) => void this.handleText(ctx));
    this.bot.on('message:photo', (ctx) => void this.handlePhoto(ctx));

    // start() 是非阻塞的（内部启动 long polling 协程），不需要 await
    this.bot.start().catch((err: unknown) => {
      this._status = 'error';
      this._error = String(err);
    });

    this._status = 'running';
    this._error = null;
  }

  async stop(): Promise<void> {
    await this.bot?.stop();
    this.bot = null;
    this._status = 'stopped';
  }

  getStatus(): ChannelStatus {
    return this._status;
  }

  async sendMessage(chatId: string, content: string, _options?: SendOptions): Promise<void> {
    if (!this.bot) return;
    try {
      await this.bot.api.sendMessage(Number(chatId), content, { parse_mode: 'Markdown' });
    } catch {
      // Markdown 解析失败时降级为纯文本
      await this.bot.api.sendMessage(Number(chatId), content);
    }
  }

  private isAllowed(userId: number): boolean {
    const list = this.cfg.allowed_user_ids;
    if (!list || list.length === 0) return true;
    return list.includes(userId);
  }

  private async handleText(ctx: Context): Promise<void> {
    const userId = ctx.from?.id;
    const text = ctx.message?.text;
    if (!userId || !text) return;

    if (!this.isAllowed(userId)) {
      await ctx.reply('抱歉，您没有使用权限。');
      return;
    }

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

    await ctx.api.sendChatAction(ctx.chat.id, 'typing');
    await this.onMessage?.(msg);
  }

  private async handlePhoto(ctx: Context): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;

    if (!this.isAllowed(userId)) {
      await ctx.reply('抱歉，您没有使用权限。');
      return;
    }

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

    await ctx.api.sendChatAction(ctx.chat.id, 'typing');
    await this.onMessage?.(msg);
  }
}
