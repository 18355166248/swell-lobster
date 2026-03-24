import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

import { parseEnv } from '../utils/envUtils.js';
import type { ChatMessage, ChatSession, EndpointConfig, SessionSummary } from './models.js';
import { requestChatCompletion, streamChatCompletion, type LLMUsage } from './llmClient.js';
import { ChatStore } from './chatStore.js';
import { EndpointStore } from '../store/endpointStore.js';
import { IdentityService } from '../identity/identityService.js';
import { getDb } from '../db/index.js';

function trimMessages(messages: ChatMessage[], maxChars = 60000): ChatMessage[] {
  let total = 0;
  const result: ChatMessage[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    total += messages[i].content.length;
    if (total > maxChars) break;
    result.unshift(messages[i]);
  }
  return result;
}

export class ChatService {
  private readonly store: ChatStore;
  private readonly endpointStore: EndpointStore;
  private readonly db = getDb();

  constructor(private readonly projectRoot: string) {
    this.store = new ChatStore();
    this.endpointStore = new EndpointStore();
  }

  listSessions(): SessionSummary[] {
    return this.store.listSessions();
  }

  getSession(sessionId: string): ChatSession | undefined {
    return this.store.getSession(sessionId);
  }

  createSession(endpointName?: string | null, personaPath?: string | null): ChatSession {
    const endpoint = this.resolveEndpoint(endpointName);
    if (endpointName && !endpoint) {
      throw new Error(`endpoint not found: ${endpointName}`);
    }
    return this.store.createSession(endpoint?.name ?? endpointName ?? null, personaPath ?? null);
  }

  updateSession(
    sessionId: string,
    patch: { endpoint_name?: string | null; title?: string | null; persona_path?: string | null }
  ): ChatSession | undefined {
    if (patch.endpoint_name) {
      const endpoint = this.resolveEndpoint(patch.endpoint_name);
      if (!endpoint) throw new Error(`endpoint not found: ${patch.endpoint_name}`);
    }
    return this.store.updateSession(sessionId, patch);
  }

  async chat(args: {
    conversation_id?: string | null;
    message: string;
    endpoint_name?: string | null;
  }): Promise<{ session: ChatSession; message: string }> {
    console.log('chat', args);
    const userMessage = (args.message ?? '').trim();
    if (!userMessage) throw new Error('message is empty');

    let session = args.conversation_id ? this.store.getSession(args.conversation_id) : undefined;
    let endpoint: EndpointConfig | undefined;

    if (!session) {
      endpoint = this.resolveEndpoint(args.endpoint_name);
      session = this.store.createSession(endpoint?.name ?? args.endpoint_name ?? null);
    } else {
      endpoint = this.resolveEndpoint(args.endpoint_name ?? session.endpoint_name ?? null);
    }

    if (!endpoint) {
      throw new Error('未找到可用端点，请先在 LLM 配置里添加并启用端点');
    }

    let apiKey = this.resolveApiKey(endpoint.api_key_env);
    if (endpoint.api_key_env && !apiKey) {
      throw new Error(`环境变量 ${endpoint.api_key_env} 未配置 API Key`);
    }
    if (!apiKey) apiKey = 'local';

    console.log('apiKey', endpoint, apiKey);

    const identityService = new IdentityService();
    const systemPrompt = identityService.loadSystemPrompt(session.persona_path ?? undefined);

    const sessionAfterUser = this.store.appendUserMessage({
      sessionId: session.id,
      userContent: userMessage,
      endpointName: endpoint.name,
    });
    if (!sessionAfterUser) throw new Error('failed to persist user message');

    const assistant = await requestChatCompletion({
      endpoint,
      apiKey,
      history: trimMessages(session.messages),
      userMessage,
      systemPrompt: systemPrompt || undefined,
    });

    const appended = this.store.appendAssistantMessageWithMeta({
      sessionId: session.id,
      assistantContent: assistant.content,
      endpointName: endpoint.name,
    });

    if (!appended) throw new Error('failed to persist chat session');

    this.recordUsage({
      messageId: appended.messageId,
      endpointName: endpoint.name,
      usage: assistant.usage,
    });

    return { session: appended.session, message: assistant.content };
  }

  deleteSession(sessionId: string): boolean {
    return this.store.deleteSession(sessionId);
  }

  /**
   * 流式对话：边生成边通过 onChunk 推送增量文本，结束后将完整助手回复落盘。
   * signal 可用于取消上游流式请求。
   */
  async chatStream(
    args: {
      conversation_id?: string | null;
      message: string;
      endpoint_name?: string | null;
    },
    onChunk: (delta: string) => void,
    signal?: AbortSignal
  ): Promise<{ session: ChatSession; message: string }> {
    // 校验用户输入非空
    const userMessage = (args.message ?? '').trim();
    if (!userMessage) throw new Error('message is empty');

    // 按 conversation_id 取已有会话；无则新建，并解析本次要用的 LLM 端点
    let session = args.conversation_id ? this.store.getSession(args.conversation_id) : undefined;
    let endpoint: EndpointConfig | undefined;

    if (!session) {
      endpoint = this.resolveEndpoint(args.endpoint_name);
      session = this.store.createSession(endpoint?.name ?? args.endpoint_name ?? null);
    } else {
      endpoint = this.resolveEndpoint(args.endpoint_name ?? session.endpoint_name ?? null);
    }

    if (!endpoint) {
      throw new Error('未找到可用端点，请先在 LLM 配置里添加并启用端点');
    }

    // 从环境变量 / .env 解析 API Key；无 key_env 时用占位，便于本地等特殊配置
    let apiKey = this.resolveApiKey(endpoint.api_key_env);
    if (endpoint.api_key_env && !apiKey) {
      throw new Error(`环境变量 ${endpoint.api_key_env} 未配置 API Key`);
    }
    if (!apiKey) apiKey = 'local';

    // 按会话绑定的 persona 加载系统提示词
    const identityService = new IdentityService();
    const systemPrompt = identityService.loadSystemPrompt(session.persona_path ?? undefined);

    // 先持久化用户消息，保证失败时不会白调模型
    const sessionAfterUser = this.store.appendUserMessage({
      sessionId: session.id,
      userContent: userMessage,
      endpointName: endpoint.name,
    });
    if (!sessionAfterUser) throw new Error('failed to persist user message');

    // 流式调用 LLM；history 截断以控制上下文长度，完整回复在 Promise resolve 时得到
    const assistant = await streamChatCompletion({
      endpoint,
      apiKey,
      history: trimMessages(session.messages), // 截断以控制上下文长度
      userMessage,
      systemPrompt: systemPrompt || undefined,
      onChunk,
      signal,
    });
    console.log("🚀 ~ ChatService ~ chatStream ~ assistant:", assistant)

    // 将拼接后的完整助手回复写入会话
    const appended = this.store.appendAssistantMessageWithMeta({
      sessionId: session.id,
      assistantContent: assistant.content,
      endpointName: endpoint.name,
    });

    if (!appended) throw new Error('failed to persist chat session');

    this.recordUsage({
      messageId: appended.messageId,
      endpointName: endpoint.name,
      usage: assistant.usage,
    });

    return { session: appended.session, message: assistant.content };
  }

  listEndpoints(): Array<Record<string, unknown>> {
    return this.endpointStore.listEndpoints();
  }

  private resolveEndpoint(endpointName?: string | null): EndpointConfig | undefined {
    const endpoints = this.endpointStore.listEndpoints().filter((ep: any) => ep.enabled !== 0);
    if (endpoints.length === 0) return undefined;

    if (endpointName) {
      const found = endpoints.find((ep: any) => String(ep.name ?? '') === endpointName);
      return found ? this.toEndpointConfig(found) : undefined;
    }

    const sorted = [...endpoints].sort((a: any, b: any) => {
      const ap = Number(a.priority ?? 999);
      const bp = Number(b.priority ?? 999);
      return (Number.isFinite(ap) ? ap : 999) - (Number.isFinite(bp) ? bp : 999);
    });
    return this.toEndpointConfig(sorted[0]);
  }

  private toEndpointConfig(raw: Record<string, unknown>): EndpointConfig {
    return {
      name: String(raw.name ?? ''),
      model: String(raw.model ?? ''),
      api_type: String(raw.api_type ?? 'openai'),
      base_url: String(raw.base_url ?? '').replace(/\/+$/, ''),
      api_key_env: String(raw.api_key_env ?? ''),
      timeout: Number(raw.timeout ?? 120),
      max_tokens: Number(raw.max_tokens ?? 0),
    };
  }

  private resolveApiKey(envName: string): string {
    if (!envName) return '';
    if (process.env[envName]) return String(process.env[envName]);

    const envPath = resolve(this.projectRoot, '.env');
    if (!existsSync(envPath)) return '';

    try {
      const parsed = parseEnv(readFileSync(envPath, 'utf-8'));
      return parsed[envName] ?? '';
    } catch {
      return '';
    }
  }

  /**
   * 助手回复成功后的统计：更新消息行 token_count，并按 UTC 日历日 upsert token_stats。
   * Review 注意：聚合接口「今日」等用 SQLite date('now','localtime')，与此处 UTC 日期在非 UTC 时区边界可能差一天，若需一致可改为同一时区取日串。
   */
  private recordUsage(args: {
    messageId: string;
    endpointName?: string | null;
    usage?: LLMUsage;
  }): void {
    if (!args.usage) return;

    this.store.updateMessageTokenCount(args.messageId, args.usage.total_tokens);

    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();

    this.db
      .prepare(
        `
        INSERT INTO token_stats (
          id,
          date,
          endpoint_name,
          prompt_tokens,
          completion_tokens,
          total_tokens,
          request_count,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, 1, ?)
        ON CONFLICT(date, endpoint_name) DO UPDATE SET
          prompt_tokens = token_stats.prompt_tokens + excluded.prompt_tokens,
          completion_tokens = token_stats.completion_tokens + excluded.completion_tokens,
          total_tokens = token_stats.total_tokens + excluded.total_tokens,
          request_count = token_stats.request_count + 1,
          updated_at = excluded.updated_at
      `
      )
      .run(
        randomUUID(),
        today,
        args.endpointName ?? null,
        args.usage.prompt_tokens,
        args.usage.completion_tokens,
        args.usage.total_tokens,
        now
      );
  }
}
