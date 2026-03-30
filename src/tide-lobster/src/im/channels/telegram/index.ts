/**
 * Telegram Bot 适配器（grammy）。
 *
 * Token 不写入 DB，仅通过 `bot_token_env` 指向进程环境（或 `.env`）中的变量名。
 * 支持文本与带图消息：图片拉取为 base64 后走多模态聊天；出站优先 Markdown，失败则降级纯文本。
 */
import { Bot, type Context } from 'grammy';
import { ChannelAdapter } from '../../base.js';
import type { ChannelStatus, SendOptions, UnifiedMessage } from '../../types.js';

/** 持久化在 `im_channels.config` 中的结构（由前端表单序列化） */
export interface TelegramConfig {
  /** 环境变量名，如 TELEGRAM_BOT_TOKEN，值为 BotFather 下发的 token */
  bot_token_env: string;
  /** 允许交互的 Telegram user id；省略或空数组表示不限制 */
  allowed_user_ids?: number[];
}

export class TelegramChannel extends ChannelAdapter {
  readonly channelType = 'telegram' as const;
  private bot: Bot | null = null;
  private _status: ChannelStatus = 'stopped';
  private _error: string | null = null;

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
    this.bot.start().catch((err: unknown) => {
      this._status = 'error';
      this._error = String(err);
    });

    this._status = 'running';
    this._error = null;
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

  /** 白名单为空则放行；否则仅允许列表内用户 */
  private isAllowed(userId: number): boolean {
    const list = this.cfg.allowed_user_ids;
    if (!list || list.length === 0) return true;
    return list.includes(userId);
  }

  /** 文本消息：校验权限 → 构造 `UnifiedMessage` → typing → 交给 `onMessage` */
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

    // 发送正在输入状态
    await ctx.api.sendChatAction(ctx.chat.id, 'typing');
    await this.onMessage?.(msg);
  }

  /**
   * 图片消息：取最大尺寸 `photo` 文件，经 Bot API 下载 URL 转 base64；
   * caption 写入 `text`/`caption` 供模型理解，mime 暂固定为 jpeg（与 Telegram 常见行为一致）。
   */
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
