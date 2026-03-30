import type { ChannelStatus, ChannelType, SendOptions, UnifiedMessage } from './types.js';

/**
 * IM 通道适配器抽象基类。
 *
 * 各即时通讯平台（Telegram、飞书等）实现本类，由 `IMManager` 统一创建、启停，
 * 并将入站消息规范为 `UnifiedMessage` 后交给 `ChatService`。出站则通过 `sendMessage`
 * 将助手回复发回该平台。
 */
export abstract class ChannelAdapter {
  /** 与 `types.ChannelType` 一致，用于日志与路由 */
  abstract readonly channelType: ChannelType;

  /**
   * @param channelId 对应 `im_channels.id`，用于在管理器内区分多条同类型通道
   * @param config 平台相关 JSON 配置（如 Telegram 的 token 环境变量名、白名单）
   */
  constructor(
    readonly channelId: string,
    protected config: Record<string, unknown>
  ) {}

  /**
   * 启动通道：建立 Bot API 连接、开始 long polling / webhook 等。
   * 实现须保证可重复调用前先 `stop` 或由管理器处理重复启动。
   */
  abstract start(): Promise<void>;

  /** 停止通道：取消轮询、释放句柄，避免进程退出时泄漏 */
  abstract stop(): Promise<void>;

  /** 当前运行态，供 API 列表与运维展示 */
  abstract getStatus(): ChannelStatus;

  /**
   * 向平台侧会话发送文本；`chatId` 为该平台会话标识（Telegram 为数字字符串）。
   */
  abstract sendMessage(chatId: string, content: string, options?: SendOptions): Promise<void>;

  /**
   * 由 `IMManager` 在 `startChannel` 前赋值：收到用户消息后异步调用，
   * 将 `UnifiedMessage` 送入聊天管线。
   */
  onMessage: ((msg: UnifiedMessage) => Promise<void>) | null = null;
}
