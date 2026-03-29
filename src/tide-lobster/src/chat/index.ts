import { settings } from '../config.js';
import { ChatService } from './service.js';

/** 全局 ChatService 单例，供 IM 等模块复用 */
export const chatService = new ChatService(settings.projectRoot);
