/**
 * IM 中枢：适配器生命周期 + 入站消息到 `ChatService` 的路由。
 *
 * 每个 `channel_id` 最多一个运行中的 `ChannelAdapter`；`handleMessage` 根据
 * `im_session:<externalKey>` 在 `key_value_store` 与 `chat_sessions` 间建立稳定映射，
 * 使同一 Telegram 用户始终落在同一会话 id 上。
 */
import { randomUUID } from 'node:crypto';
import { ChannelAdapter } from './base.js';
import { TelegramChannel } from './channels/telegram/index.js';
import { imStore } from './store.js';
import type { IMChannelConfig, UnifiedMessage } from './types.js';
import type { ChatService } from '../chat/service.js';
import { IdentityService } from '../identity/identityService.js';
import { getDb } from '../db/index.js';
import { checkRateLimit } from './rateLimiter.js';

/** 工厂：按 `channel_type` 实例化具体适配器，未知类型抛错 */
function createAdapter(cfg: IMChannelConfig): ChannelAdapter {
  switch (cfg.channel_type) {
    case 'telegram':
      return new TelegramChannel(cfg.id, cfg.config);
    default:
      throw new Error(`不支持的通道类型: ${cfg.channel_type}`);
  }
}

export class IMManager {
  /** channel_id → 运行中的适配器 */
  private adapters = new Map<string, ChannelAdapter>();
  /** 由入口在 `loadAll` 前注入，未设置时入站消息直接丢弃 */
  private chatService: ChatService | null = null;

  /** 必须在 `loadAll` 之前调用，否则 IM 消息无法调用 LLM */
  setChatService(svc: ChatService): void {
    this.chatService = svc;
  }

  /**
   * 若该 id 已有适配器则先停止再重建，避免热更新配置后仍用旧实例。
   * 成功后写入 `imStore` 为 `running`。
   */
  async startChannel(cfg: IMChannelConfig): Promise<void> {
    if (this.adapters.has(cfg.id)) {
      await this.stopChannel(cfg.id);
    }
    const adapter = createAdapter(cfg);
    adapter.onMessage = (msg) => this.handleMessage(msg);
    await adapter.start();
    this.adapters.set(cfg.id, adapter);
    imStore.setStatus(cfg.id, 'running');
  }

  /** 停止并移除适配器；DB 状态置为 `stopped`（不区分是否曾报错） */
  async stopChannel(id: string): Promise<void> {
    const adapter = this.adapters.get(id);
    if (adapter) {
      await adapter.stop();
      this.adapters.delete(id);
    }
    imStore.setStatus(id, 'stopped');
  }

  /** 进程内真实状态；无适配器时视为 `stopped` */
  getRunningStatus(id: string): 'running' | 'stopped' | 'error' {
    return this.adapters.get(id)?.getStatus() ?? 'stopped';
  }

  /**
   * 进程启动时调用：对 `imStore` 中 `enabled` 的通道逐个 `startChannel`，
   * 单路失败仅记录错误状态，不阻塞其他通道。
   */
  async loadAll(): Promise<void> {
    const channels = imStore.list().filter((c) => c.enabled);
    for (const c of channels) {
      await this.startChannel(c).catch((err: unknown) => {
        imStore.setStatus(c.id, 'error', String(err));
      });
    }
  }

  /**
   * 入站统一消息：解析/创建会话 → 组装 `chat` 参数（含图片附件）→
   * 调用 `ChatService.chat` → 将回复文本发回 `chat_id`。
   */
  private async handleMessage(msg: UnifiedMessage): Promise<void> {
    if (!this.chatService) return;
    const adapter = this.adapters.get(msg.channel_id);
    if (!adapter) return;
    const channel = imStore.get(msg.channel_id);
    if (!channel) return;

    try {
      const rateLimit = checkRateLimit({
        channelId: msg.channel_id,
        channelType: msg.channel_type,
        userId: msg.user_id,
        config: channel.config,
      });
      if (!rateLimit.allowed) {
        await adapter.sendMessage(msg.chat_id, rateLimit.message ?? '请求过于频繁，请稍后再试。');
        return;
      }

      const externalKey = `im_${msg.channel_type}_${msg.channel_id}_${msg.user_id}`;
      const session = await getOrCreateSession(externalKey, {
        title: `${msg.channel_type} - ${msg.user_id}`,
      });

      const chatArgs: Parameters<ChatService['chat']>[0] = {
        conversation_id: session.id,
        message: msg.text ?? (msg.images?.length ? (msg.caption ?? '请描述这张图片') : ''),
      };

      if (msg.images?.length) {
        chatArgs.attachments = msg.images.map((img) => ({
          kind: 'image',
          base64: img.base64,
          mimeType: img.mimeType,
        }));
      }

      // 走与 Web UI 相同的 `ChatService.chat`：按 `conversation_id` 续写历史、选端点/人格、
      // 流式或非流式调用 LLM；`result.message` 为助手最终文本（已落库一侧由 ChatService 负责）。
      const result = await this.chatService.chat(chatArgs);
      // 将助手回复发回该 IM 侧 `chat_id`（如 Telegram 的 chat id），与入站同一会话线程。
      await adapter.sendMessage(msg.chat_id, result.message);
    } catch (err: unknown) {
      await adapter.sendMessage(msg.chat_id, '抱歉，处理消息时出现错误。').catch(() => {});
      console.error('[IMManager] handleMessage error:', err);
    }
  }
}

/**
 * 用稳定外部键 `im_<channel_type>_<channel_id>_<user_id>` 在 KV 中查找已绑定的 `chat_sessions.id`；
 * 缺失或会话已被删则新建会话并写回 KV，保证 IM 用户与网页聊天使用同一套消息表。
 */
async function getOrCreateSession(
  externalKey: string,
  defaults: { title: string }
): Promise<{ id: string }> {
  const db = getDb();
  const kvKey = `im_session:${externalKey}`;

  const row = db.prepare(`SELECT value FROM key_value_store WHERE key = ?`).get(kvKey) as
    | { value: string }
    | undefined;

  if (row?.value) {
    // 验证会话仍然存在
    const session = db.prepare(`SELECT id FROM chat_sessions WHERE id = ?`).get(row.value) as
      | { id: string }
      | undefined;
    if (session) return session;
  }

  // 创建新会话（与 Web UI 一致：无显式人格时落库默认助手人格，便于侧栏与系统提示一致）
  const personaPath = new IdentityService().getDefaultAssistantPersonaPath();
  const sessionId = `chat_${randomUUID().replace(/-/g, '').slice(0, 10)}`;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO chat_sessions (id, title, endpoint_name, persona_path, created_at, updated_at)
     VALUES (?, ?, NULL, ?, ?, ?)`
  ).run(sessionId, defaults.title, personaPath, now, now);

  db.prepare(
    `INSERT INTO key_value_store (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(kvKey, sessionId);

  return { id: sessionId };
}

export const imManager = new IMManager();
