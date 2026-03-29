import type { ChannelStatus, ChannelType, SendOptions, UnifiedMessage } from './types.js';

/** IM 通道适配器抽象基类，所有平台适配器都需实现此接口 */
export abstract class ChannelAdapter {
  abstract readonly channelType: ChannelType;

  constructor(
    readonly channelId: string,
    protected config: Record<string, unknown>
  ) {}

  /** 启动通道（建立连接 / 开始 polling） */
  abstract start(): Promise<void>;

  /** 停止通道（断开连接 / 释放资源） */
  abstract stop(): Promise<void>;

  abstract getStatus(): ChannelStatus;

  /** 向指定 chatId 发送消息 */
  abstract sendMessage(chatId: string, content: string, options?: SendOptions): Promise<void>;

  /** 注册消息回调，收到消息时调用 */
  onMessage: ((msg: UnifiedMessage) => Promise<void>) | null = null;
}
