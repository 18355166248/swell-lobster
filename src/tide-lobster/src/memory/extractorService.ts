import { requestChatCompletion, type LLMRequestMessage } from '../chat/llmClient.js';
import { ChatStore } from '../chat/chatStore.js';
import type { EndpointConfig } from '../chat/models.js';
import { memoryStore } from './store.js';
import type { CreateMemoryInput, MemoryType } from './types.js';

/** 用户主动记忆触发：匹配"记住/记下/帮我记"等关键词，捕获组为记忆内容。 */
const EXPLICIT_RE = /(?:请\s*)?(?:记住|记下|帮我记|保存到?记忆)[：:，,]?\s*(.+)/u;

/** 对话过短（< 50 字符）时跳过提取。 */
function isTooShort(text: string): boolean {
  return text.replace(/\s/g, '').length < 50;
}

/** 仅为礼貌应答时跳过提取。 */
const POLITE_ONLY_RE = /^(?:ok|好的|好|谢谢|谢了|没问题|收到|明白|了解)[。！!～~]?$/iu;

/** 包含临时性/即时性信号时跳过提取（今天/昨天/这次报错/这个bug 等不值得长期记忆）。 */
const TRANSIENT_RE = /今天|昨天|最近|这次|这个|上次|报错|error|bug/iu;

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

    const userMessages = session.messages.filter((m) => m.role === 'user');
    const lastUserContent = userMessages.at(-1)?.content ?? '';

    // ── 规则 pre-filter ────────────────────────────────────────────────────────
    // 1. 显式触发：用户主动说"记住/记下..."，直接保存，跳过 LLM 调用
    const explicitMatch = EXPLICIT_RE.exec(lastUserContent);
    if (explicitMatch) {
      const content = explicitMatch[1].trim();
      if (content) {
        memoryStore.create({
          content,
          memory_type: 'preference',
          importance: 7,
          is_explicit: true,
          confidence: 1.0,
          source_session_id: sessionId,
        } satisfies CreateMemoryInput);
      }
      return;
    }

    // 2. 丢弃规则：满足任意一条则跳过本轮提取，避免无效 LLM 调用
    const fullText = buildConversation(
      session.messages.map((m) => ({ role: m.role, content: m.content }))
    );
    if (isTooShort(fullText)) return;
    if (POLITE_ONLY_RE.test(lastUserContent.trim())) return;
    if (TRANSIENT_RE.test(lastUserContent)) return;
    // ──────────────────────────────────────────────────────────────────────────

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
${fullText}
    `.trim();

    try {
      const result = await requestChatCompletion({
        endpoint,
        apiKey,
        messages: [{ role: 'user', content: prompt }],
      });

      let raw = result.content.trim();
      if (!raw) return;

      // 模型有时会用 ```json ... ``` 包裹，需先去掉代码块标记
      const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) raw = fenceMatch[1].trim();

      const parsed = JSON.parse(raw) as Array<{
        content?: string;
        memory_type?: MemoryType;
        importance?: number;
        tags?: string[];
      }>;
      if (!Array.isArray(parsed)) return;

      // store.create() 内部通过 fingerprint 去重（ON CONFLICT），此处无需再做重叠检查
      for (const item of parsed) {
        const content = String(item.content ?? '').trim();
        const memoryType = item.memory_type;
        if (!content || !memoryType) continue;

        memoryStore.create({
          content,
          memory_type: memoryType,
          importance: item.importance,
          tags: item.tags,
          is_explicit: false,
          confidence: 0.8,
          source_session_id: sessionId,
        } satisfies CreateMemoryInput);
      }
    } catch (error) {
      // 提取是低优先级异步任务，只记录失败，不能影响主对话。
      console.error('[memory.extractor] extract failed:', error);
    }
  }
}

export const extractorService = new MemoryExtractorService();
