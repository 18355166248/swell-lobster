import { requestChatCompletion, type LLMRequestMessage } from '../chat/llmClient.js';
import { ChatStore } from '../chat/chatStore.js';
import type { EndpointConfig } from '../chat/models.js';
import { memoryStore } from './store.js';
import type { CreateMemoryInput, MemoryType } from './types.js';

function normalizeContent(text: string): string {
  return text.replace(/\s+/g, '').toLowerCase();
}

/**
 * 计算两个字符串的重叠比例
 * @param a 字符串1
 * @param b 字符串2
 * @returns 重叠比例
 */
function overlapRatio(a: string, b: string): number {
  const left = normalizeContent(a);
  const right = normalizeContent(b);
  if (!left || !right) return 0;

  const counts = new Map<string, number>();
  for (const char of left) {
    counts.set(char, (counts.get(char) ?? 0) + 1);
  }

  let overlap = 0;
  for (const char of right) {
    const count = counts.get(char) ?? 0;
    if (count > 0) {
      overlap += 1;
      counts.set(char, count - 1);
    }
  }

  return overlap / Math.max(left.length, right.length);
}

/**
 * 构建对话内容
 * @param messages 对话消息
 * @returns 对话内容
 */
function buildConversation(messages: LLMRequestMessage[]): string {
  return messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => `${message.role === 'user' ? '用户' : '助手'}：${message.content ?? ''}`)
    .join('\n');
}

export class MemoryExtractorService {
  private readonly chatStore = new ChatStore();

  /**
   * 从会话中提取记忆
   * @param sessionId 会话ID
   * @param endpoint 端点配置
   * @param apiKey API密钥
   */
  async extractFromSession(
    sessionId: string,
    endpoint: EndpointConfig,
    apiKey: string
  ): Promise<void> {
    const session = this.chatStore.getSession(sessionId);
    if (!session || session.messages.length === 0) return;

    const conversation = buildConversation(
      session.messages.map((message) => ({
        role: message.role,
        content: message.content,
      }))
    );

    const prompt = `
你是记忆提取助手。分析以下对话，提取值得长期记住的信息。

只提取满足以下条件之一的信息：
1. 用户明确表达的偏好、习惯或个人信息
2. 用户纠正 AI 的规则（"不要...""以后..."）
3. 重要的事实或决定

以 JSON 数组格式返回，每条记忆：
{
  "content": "...",
  "memory_type": "fact|preference|event|rule",
  "importance": 1-10,
  "tags": ["标签1", "标签2"]
}

如果没有值得记录的信息，返回 []

对话内容：
${conversation}
    `.trim();

    try {
      const result = await requestChatCompletion({
        endpoint,
        apiKey,
        messages: [{ role: 'user', content: prompt }],
      });

      const raw = result.content.trim();
      if (!raw) return;

      const parsed = JSON.parse(raw) as Array<{
        content?: string;
        memory_type?: MemoryType;
        importance?: number;
        tags?: string[];
      }>;
      if (!Array.isArray(parsed)) return;

      const existing = memoryStore.list({ limit: 500 });
      /**
       * 创建记忆
       * @param item 记忆项
       */
      for (const item of parsed) {
        const content = String(item.content ?? '').trim();
        const memoryType = item.memory_type;
        if (!content || !memoryType) continue;

        const duplicated = existing.some((memory) => overlapRatio(memory.content, content) >= 0.8);
        if (duplicated) continue;

        const created = memoryStore.create({
          content,
          memory_type: memoryType,
          importance: item.importance,
          tags: item.tags,
          source_session_id: sessionId,
        } satisfies CreateMemoryInput);
        existing.unshift(created);
      }
    } catch (error) {
      // 提取是低优先级异步任务，只记录失败，不能影响主对话。
      console.error('[memory.extractor] extract failed:', error);
    }
  }
}

export const extractorService = new MemoryExtractorService();
