/**
 * 聊天模块对外入口。
 *
 * 导出与仓库根目录绑定的 `ChatService` 单例，避免在 IM、调度等子系统中重复构造
 * 会话存储与 LLM 客户端。所有「走统一聊天管线」的入口应注入此实例。
 */
import { settings } from '../config.js';
import { ChatService } from './service.js';

/** 全局 ChatService 单例，供 IM、未来其他通道复用同一套会话与补全逻辑 */
export const chatService = new ChatService(settings.projectRoot);
