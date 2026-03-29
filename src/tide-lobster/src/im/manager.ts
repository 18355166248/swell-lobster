import { ChannelAdapter } from './base.js';
import { TelegramChannel } from './channels/telegram/index.js';
import { imStore } from './store.js';
import type { IMChannelConfig, UnifiedMessage } from './types.js';
import type { ChatService } from '../chat/service.js';
import { getDb } from '../db/index.js';

/** 根据通道配置创建对应的适配器实例 */
function createAdapter(cfg: IMChannelConfig): ChannelAdapter {
  switch (cfg.channel_type) {
    case 'telegram':
      return new TelegramChannel(cfg.id, cfg.config);
    default:
      throw new Error(`不支持的通道类型: ${cfg.channel_type}`);
  }
}

/** 管理所有 IM 通道的生命周期，并将收到的消息路由到 ChatService */
export class IMManager {
  private adapters = new Map<string, ChannelAdapter>();
  private chatService: ChatService | null = null;

  setChatService(svc: ChatService): void {
    this.chatService = svc;
  }

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

  async stopChannel(id: string): Promise<void> {
    const adapter = this.adapters.get(id);
    if (adapter) {
      await adapter.stop();
      this.adapters.delete(id);
    }
    imStore.setStatus(id, 'stopped');
  }

  getRunningStatus(id: string): 'running' | 'stopped' | 'error' {
    return this.adapters.get(id)?.getStatus() ?? 'stopped';
  }

  /** 服务启动时加载所有 enabled 通道 */
  async loadAll(): Promise<void> {
    const channels = imStore.list().filter((c) => c.enabled);
    for (const c of channels) {
      await this.startChannel(c).catch((err: unknown) => {
        imStore.setStatus(c.id, 'error', String(err));
      });
    }
  }

  private async handleMessage(msg: UnifiedMessage): Promise<void> {
    if (!this.chatService) return;
    const adapter = this.adapters.get(msg.channel_id);
    if (!adapter) return;

    try {
      const externalKey = `im_${msg.channel_type}_${msg.channel_id}_${msg.user_id}`;
      const session = await getOrCreateSession(externalKey, {
        title: `${msg.channel_type} - ${msg.user_id}`,
      });

      const chatArgs: Parameters<ChatService['chat']>[0] = {
        conversation_id: session.id,
        message: msg.text ?? (msg.images?.length ? (msg.caption ?? '请描述这张图片') : ''),
      };

      if (msg.images?.length) {
        (chatArgs as Record<string, unknown>).attachments = msg.images.map((img) => ({
          type: 'image',
          base64: img.base64,
          mimeType: img.mimeType,
        }));
      }

      const result = await this.chatService.chat(chatArgs);
      await adapter.sendMessage(msg.chat_id, result.message);
    } catch (err: unknown) {
      await adapter.sendMessage(msg.chat_id, '抱歉，处理消息时出现错误。').catch(() => {});
      console.error('[IMManager] handleMessage error:', err);
    }
  }
}

/** 通过 key_value_store 查找或创建与外部 IM 用户关联的聊天会话 */
async function getOrCreateSession(
  externalKey: string,
  defaults: { title: string }
): Promise<{ id: string }> {
  const db = getDb();
  const kvKey = `im_session:${externalKey}`;

  const row = db
    .prepare(`SELECT value FROM key_value_store WHERE key = ?`)
    .get(kvKey) as { value: string } | undefined;

  if (row?.value) {
    // 验证会话仍然存在
    const session = db
      .prepare(`SELECT id FROM chat_sessions WHERE id = ?`)
      .get(row.value) as { id: string } | undefined;
    if (session) return session;
  }

  // 创建新会话
  const { randomUUID } = await import('node:crypto');
  const sessionId = `chat_${randomUUID().replace(/-/g, '').slice(0, 10)}`;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO chat_sessions (id, title, endpoint_name, persona_path, created_at, updated_at)
     VALUES (?, ?, NULL, NULL, ?, ?)`
  ).run(sessionId, defaults.title, now, now);

  db.prepare(
    `INSERT INTO key_value_store (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(kvKey, sessionId);

  return { id: sessionId };
}

export const imManager = new IMManager();
