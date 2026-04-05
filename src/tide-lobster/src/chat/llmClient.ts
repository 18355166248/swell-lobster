import type { Dispatcher } from 'undici';
import type { EndpointConfig } from './models.js';
import type { AnthropicTool, OpenAITool, ToolCall } from '../tools/types.js';
import { getFetchDispatcherForUrl } from '../net/fetchDispatcher.js';

export interface LLMUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cache_read_tokens?: number; // Anthropic 流式缓存读取 tokens
  cache_write_tokens?: number; // Anthropic 流式缓存写入 tokens
}

export type LLMRequestMessage =
  | { role: 'user' | 'assistant'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls: ToolCall[] }
  | { role: 'tool'; content: string; tool_call_id: string; name?: string };

export interface ChatCompletionResult {
  content: string;
  tool_calls?: ToolCall[];
  usage?: LLMUsage;
}

// Token：优先解析厂商 usage；缺失时用下方 estimateTokens/estimateUsage 粗估（展示量级，非计费精度）。
// OpenAI 流式依赖 stream_options.include_usage；Anthropic 流式见 streamAnthropic 内按事件解析。
function estimateTokens(text: string): number {
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const otherChars = text.length - chineseChars;
  return Math.ceil(chineseChars / 3 + otherChars / 4);
}

function estimateUsage(args: {
  messages: LLMRequestMessage[];
  content: string;
  systemPrompt?: string;
}): LLMUsage {
  const promptText =
    args.messages
      .map((message) => {
        if (message.role === 'tool') return message.content;
        if ('content' in message && typeof message.content === 'string') return message.content;
        return '';
      })
      .join('\n') + (args.systemPrompt ? `\n${args.systemPrompt}` : '');
  const promptTokens = estimateTokens(promptText);
  const completionTokens = estimateTokens(args.content);
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
  };
}

function parseOpenAIUsage(raw: unknown): LLMUsage | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const usage = raw as Record<string, unknown>;
  const promptTokens = Number(usage.prompt_tokens ?? 0);
  const completionTokens = Number(usage.completion_tokens ?? 0);
  const totalTokens = Number(usage.total_tokens ?? promptTokens + completionTokens);
  if (![promptTokens, completionTokens, totalTokens].every(Number.isFinite)) return undefined;
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
  };
}

function parseAnthropicUsage(raw: unknown): LLMUsage | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const usage = raw as Record<string, unknown>;
  const promptTokens = Number(usage.input_tokens ?? 0);
  const completionTokens = Number(usage.output_tokens ?? 0);
  if (![promptTokens, completionTokens].every(Number.isFinite)) return undefined;
  const result: LLMUsage = {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
  };
  const cacheRead = usage.cache_read_input_tokens;
  const cacheWrite = usage.cache_creation_input_tokens;
  if (typeof cacheRead === 'number' && cacheRead > 0) result.cache_read_tokens = cacheRead;
  if (typeof cacheWrite === 'number' && cacheWrite > 0) result.cache_write_tokens = cacheWrite;
  return result;
}

function openAIChatUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
}

function anthropicMessagesUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  // 已含版本路径段（/v1, /v2, /v1beta 等）直接拼 /messages
  if (/\/v\d/.test(base)) return `${base}/messages`;
  return `${base}/v1/messages`;
}

/** 从 Error / cause 链上取 Node / undici 的 code（如 ECONNRESET） */
function getNestedErrorCode(err: unknown): string | undefined {
  let cur: unknown = err;
  for (let i = 0; i < 8 && cur; i++) {
    if (typeof cur === 'object' && cur !== null) {
      const code = (cur as { code?: string }).code;
      if (typeof code === 'string') return code;
      cur = (cur as { cause?: unknown }).cause;
    } else {
      break;
    }
  }
  return undefined;
}

function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  if (err instanceof Error && err.name === 'AbortError') return true;
  return false;
}

/** TLS 握手断连、对端重置等可短时重试的网络错误 */
const TRANSIENT_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
]);

function isTransientNetworkError(err: unknown): boolean {
  if (isAbortError(err)) return false;
  const code = getNestedErrorCode(err);
  return code !== undefined && TRANSIENT_NETWORK_CODES.has(code);
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutSec: number,
  signal?: AbortSignal
): Promise<Response> {
  const maxAttempts = 3;
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    const controller = new AbortController();
    const timeoutMs = Math.max(10, timeoutSec) * 1000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const abort = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', abort, { once: true });
    try {
      return await fetch(url, {
        ...init,
        signal: controller.signal,
        dispatcher: getFetchDispatcherForUrl(url),
      } as RequestInit & { dispatcher: Dispatcher });
    } catch (e) {
      lastError = e;
      if (signal?.aborted || isAbortError(e)) throw e;
      if (!isTransientNetworkError(e) || attempt === maxAttempts - 1) throw e;
      await new Promise((r) => setTimeout(r, 200 * 2 ** attempt));
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }
  throw lastError;
}

export async function streamChatCompletion(args: {
  endpoint: EndpointConfig;
  apiKey: string;
  messages: LLMRequestMessage[];
  systemPrompt?: string;
  onChunk: (delta: string) => void | Promise<void>;
  signal?: AbortSignal;
}): Promise<ChatCompletionResult> {
  const { endpoint, apiKey, messages, systemPrompt, onChunk, signal } = args;
  if (!endpoint.model) throw new Error('endpoint model is empty');

  const apiType = (endpoint.api_type || 'openai').toLowerCase();

  if (!endpoint.base_url) throw new Error('endpoint base_url is empty');
  if (apiType === 'anthropic') {
    return streamAnthropic(endpoint, apiKey, messages, onChunk, systemPrompt, signal);
  }
  return streamOpenAI(endpoint, apiKey, messages, onChunk, systemPrompt, signal);
}

/**
 * 请求 LLM 完成
 * @param args 请求参数
 * @param args.endpoint 端点配置
 * @param args.apiKey API密钥
 * @param args.messages 对话消息
 * @param args.systemPrompt 系统提示词
 * @param args.tools 工具
 * @returns 完成结果
 */
export async function requestChatCompletion(args: {
  endpoint: EndpointConfig;
  apiKey: string;
  messages: LLMRequestMessage[];
  systemPrompt?: string;
  tools?: OpenAITool[] | AnthropicTool[];
}): Promise<ChatCompletionResult> {
  const { endpoint, apiKey, messages, systemPrompt, tools } = args;
  if (!endpoint.model) throw new Error('endpoint model is empty');

  const apiType = (endpoint.api_type || 'openai').toLowerCase();

  if (!endpoint.base_url) throw new Error('endpoint base_url is empty');
  if (apiType === 'anthropic') {
    return requestAnthropic(
      endpoint,
      apiKey,
      messages,
      systemPrompt,
      tools as AnthropicTool[] | undefined
    );
  }
  return requestOpenAI(endpoint, apiKey, messages, systemPrompt, tools as OpenAITool[] | undefined);
}

/**
 * 非流式补全：先请求当前端点，失败时再尝试「备用端点」（仅一层，不会链式多级回退）。
 *
 * 当 `requestChatCompletion` 抛错（网络、4xx/5xx、超时等）且同时满足：
 * - 当前 `endpoint.fallback_endpoint_id` 已配置；
 * - 传入 `resolveFallback`：按 id 从配置表等解析出备用 `EndpointConfig`；
 * - 传入 `resolveApiKey`：解析备用端点对应的 API Key（通常读 `api_key_env`）；
 * 则打一条 warn 日志后，用相同 `messages` / `systemPrompt` / `tools` 再请求备用端点一次。
 * 若未配置备用或解析失败，则原样抛出首次错误。
 */
export async function requestWithFallback(args: {
  endpoint: EndpointConfig;
  apiKey: string;
  messages: LLMRequestMessage[];
  systemPrompt?: string;
  tools?: OpenAITool[] | AnthropicTool[];
  resolveFallback?: (endpointId: string) => EndpointConfig | undefined;
  resolveApiKey?: (endpoint: EndpointConfig) => string;
}): Promise<ChatCompletionResult> {
  try {
    return await requestChatCompletion(args);
  } catch (error) {
    const fallbackId = args.endpoint.fallback_endpoint_id;
    if (!fallbackId || !args.resolveFallback || !args.resolveApiKey) throw error;

    const fallback = args.resolveFallback(fallbackId);
    if (!fallback) throw error;

    const fallbackApiKey = args.resolveApiKey(fallback);
    console.warn(
      `[llm] endpoint [${args.endpoint.name}] failed, falling back to [${fallback.name}]`,
      error
    );

    return requestChatCompletion({
      endpoint: fallback,
      apiKey: fallbackApiKey,
      messages: args.messages,
      systemPrompt: args.systemPrompt,
      tools: args.tools,
    });
  }
}

function normalizeOpenAIMessages(
  messages: LLMRequestMessage[],
  systemPrompt?: string
): Array<Record<string, unknown>> {
  const normalized = messages.map((message) => {
    if (message.role === 'tool') {
      return {
        role: 'tool',
        content: message.content,
        tool_call_id: message.tool_call_id,
        ...(message.name ? { name: message.name } : {}),
      };
    }

    return {
      role: message.role,
      content: message.content,
      ...('tool_calls' in message
        ? {
            tool_calls: message.tool_calls.map((toolCall) => ({
              id: toolCall.id,
              type: 'function',
              function: {
                name: toolCall.name,
                arguments: JSON.stringify(toolCall.arguments),
              },
            })),
          }
        : {}),
    };
  });

  return systemPrompt ? [{ role: 'system', content: systemPrompt }, ...normalized] : normalized;
}

function normalizeAnthropicMessages(messages: LLMRequestMessage[]): Array<Record<string, unknown>> {
  return messages
    .filter((message) => message.role !== 'tool')
    .map((message) => {
      if ('tool_calls' in message) {
        return {
          role: 'assistant',
          content: message.tool_calls.map((toolCall) => ({
            type: 'tool_use',
            id: toolCall.id,
            name: toolCall.name,
            input: toolCall.arguments,
          })),
        };
      }
      return {
        role: message.role,
        content: [{ type: 'text', text: message.content }],
      };
    });
}

function openAIToolCallsFromMessage(message: Record<string, unknown>): ToolCall[] {
  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  return toolCalls
    .map((item) => {
      const raw = item as Record<string, unknown>;
      const fn = (raw.function ?? {}) as Record<string, unknown>;
      const argsText = String(fn.arguments ?? '{}');
      try {
        return {
          id: String(raw.id ?? ''),
          name: String(fn.name ?? ''),
          arguments: JSON.parse(argsText) as Record<string, unknown>,
        } satisfies ToolCall;
      } catch {
        return {
          id: String(raw.id ?? ''),
          name: String(fn.name ?? ''),
          arguments: {},
        } satisfies ToolCall;
      }
    })
    .filter((item) => item.id && item.name);
}

async function requestOpenAI(
  endpoint: EndpointConfig,
  apiKey: string,
  messages: LLMRequestMessage[],
  systemPrompt?: string,
  tools?: OpenAITool[]
): Promise<ChatCompletionResult> {
  const body: Record<string, unknown> = {
    model: endpoint.model,
    messages: normalizeOpenAIMessages(messages, systemPrompt),
  };
  if (endpoint.max_tokens > 0) body.max_tokens = endpoint.max_tokens;
  if (tools?.length) body.tools = tools;

  const res = await fetchWithTimeout(
    openAIChatUrl(endpoint.base_url),
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    },
    endpoint.timeout
  );

  if (!res.ok) {
    const text = (await res.text()).slice(0, 200);
    throw new Error(`chat completion failed(${res.status}): ${text}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const first = (choices[0] ?? {}) as Record<string, unknown>;
  const message = (first.message ?? {}) as Record<string, unknown>;
  const toolCalls = openAIToolCallsFromMessage(message);
  const content = message.content;

  if (typeof content === 'string') {
    const trimmed = content.trim();
    return {
      content: trimmed,
      ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      usage:
        parseOpenAIUsage(data.usage) ?? estimateUsage({ messages, content: trimmed, systemPrompt }),
    };
  }
  if (Array.isArray(content)) {
    const texts = content
      .map((item) => {
        if (!item || typeof item !== 'object') return '';
        const row = item as Record<string, unknown>;
        const type = String(row.type ?? '');
        if (type !== 'text' && type !== 'output_text') return '';
        return String(row.text ?? '').trim();
      })
      .filter(Boolean);
    if (texts.length > 0) {
      const joined = texts.join('\n');
      return {
        content: joined,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        usage:
          parseOpenAIUsage(data.usage) ??
          estimateUsage({ messages, content: joined, systemPrompt }),
      };
    }
  }

  if (toolCalls.length > 0) {
    return {
      content: '',
      tool_calls: toolCalls,
      usage: parseOpenAIUsage(data.usage) ?? estimateUsage({ messages, content: '', systemPrompt }),
    };
  }

  // content 为 null 且无 tool_calls：模型已无话可说（常见于工具调用后的第二轮回复）
  return {
    content: '',
    usage: parseOpenAIUsage(data.usage) ?? estimateUsage({ messages, content: '', systemPrompt }),
  };
}

async function requestAnthropic(
  endpoint: EndpointConfig,
  apiKey: string,
  messages: LLMRequestMessage[],
  systemPrompt?: string,
  tools?: AnthropicTool[]
): Promise<ChatCompletionResult> {
  const body: Record<string, unknown> = {
    model: endpoint.model,
    messages: normalizeAnthropicMessages(messages),
    max_tokens: endpoint.max_tokens > 0 ? endpoint.max_tokens : 1024,
    ...(systemPrompt ? { system: systemPrompt } : {}),
  };
  if (tools?.length) body.tools = tools;

  const res = await fetchWithTimeout(
    anthropicMessagesUrl(endpoint.base_url),
    {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(body),
    },
    endpoint.timeout
  );

  if (!res.ok) {
    const text = (await res.text()).slice(0, 200);
    throw new Error(`chat completion failed(${res.status}): ${text}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  const content = Array.isArray(data.content) ? data.content : [];
  const toolCalls: ToolCall[] = [];
  const texts = content
    .map((item) => {
      if (!item || typeof item !== 'object') return '';
      const row = item as Record<string, unknown>;
      const type = String(row.type ?? '');
      if (type === 'tool_use') {
        toolCalls.push({
          id: String(row.id ?? ''),
          name: String(row.name ?? ''),
          arguments:
            row.input && typeof row.input === 'object'
              ? (row.input as Record<string, unknown>)
              : {},
        });
        return '';
      }
      if (type !== 'text') return '';
      return String(row.text ?? '').trim();
    })
    .filter(Boolean);

  const contentText = texts.join('\n');
  if (!contentText && toolCalls.length === 0) {
    throw new Error('chat completion response has no readable content');
  }
  return {
    content: contentText,
    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    usage:
      parseAnthropicUsage(data.usage) ??
      estimateUsage({ messages, content: contentText, systemPrompt }),
  };
}

async function streamOpenAI(
  endpoint: EndpointConfig,
  apiKey: string,
  messages: LLMRequestMessage[],
  onChunk: (delta: string) => void | Promise<void>,
  systemPrompt?: string,
  signal?: AbortSignal
): Promise<ChatCompletionResult> {
  const body: Record<string, unknown> = {
    model: endpoint.model,
    messages: normalizeOpenAIMessages(messages, systemPrompt),
    stream: true,
  };
  if (endpoint.max_tokens > 0) body.max_tokens = endpoint.max_tokens;
  // 流末尾 chunk 可携带 usage；不支持时 parseOpenAIUsage 失败，回退 estimateUsage。
  body.stream_options = { include_usage: true };

  const res = await fetchWithTimeout(
    openAIChatUrl(endpoint.base_url),
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(body),
    },
    endpoint.timeout,
    signal
  );

  if (!res.ok) {
    const text = (await res.text()).slice(0, 200);
    throw new Error(`chat completion failed(${res.status}): ${text}`);
  }

  let full = '';
  const decoder = new TextDecoder();
  const reader = res.body!.getReader();
  let buf = '';
  let streamDone = false;
  let usage: LLMUsage | undefined;

  while (!streamDone) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const raw = line.slice(5).trim();
      if (raw === '[DONE]') {
        streamDone = true;
        break;
      }
      try {
        const chunk = JSON.parse(raw) as Record<string, unknown>;
        usage = parseOpenAIUsage(chunk.usage) ?? usage;
        const choices = Array.isArray(chunk.choices) ? chunk.choices : [];
        const delta = (choices[0] as Record<string, unknown>)?.delta as
          | Record<string, unknown>
          | undefined;
        const text = typeof delta?.content === 'string' ? delta.content : '';
        if (text) {
          await onChunk(text);
          full += text;
        }
      } catch {
        /* skip malformed */
      }
    }
  }

  return {
    content: full,
    usage: usage ?? estimateUsage({ messages, content: full, systemPrompt }),
  };
}

async function streamAnthropic(
  endpoint: EndpointConfig,
  apiKey: string,
  messages: LLMRequestMessage[],
  onChunk: (delta: string) => void | Promise<void>,
  systemPrompt?: string,
  signal?: AbortSignal
): Promise<ChatCompletionResult> {
  const body: Record<string, unknown> = {
    model: endpoint.model,
    messages: normalizeAnthropicMessages(messages),
    stream: true,
    max_tokens: endpoint.max_tokens > 0 ? endpoint.max_tokens : 1024,
    ...(systemPrompt ? { system: systemPrompt } : {}),
  };

  const res = await fetchWithTimeout(
    anthropicMessagesUrl(endpoint.base_url),
    {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        accept: 'text/event-stream',
      },
      body: JSON.stringify(body),
    },
    endpoint.timeout,
    signal
  );

  if (!res.ok) {
    const text = (await res.text()).slice(0, 200);
    throw new Error(`chat completion failed(${res.status}): ${text}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  let usage: LLMUsage | undefined;

  // SSE 以空行分隔事件；单事件内 data: 可能多行，需拼接成一条 JSON（与逐行解析相比更稳）。
  const handleEvent = async (eventBlock: string) => {
    const lines = eventBlock.split('\n');
    const dataLines: string[] = [];
    for (const line of lines) {
      if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      }
    }
    if (dataLines.length === 0) return;

    const raw = dataLines.join('\n');
    if (raw === '[DONE]') return;

    try {
      const event = JSON.parse(raw) as Record<string, unknown>;
      const type = String(event.type ?? '');
      if (type === 'message_start') {
        const message = event.message as Record<string, unknown> | undefined;
        usage = parseAnthropicUsage(message?.usage) ?? usage;
        return;
      }
      if (type === 'content_block_delta') {
        const delta = event.delta as Record<string, unknown> | undefined;
        const text = typeof delta?.text === 'string' ? delta.text : '';
        if (text) {
          await onChunk(text);
          full += text;
        }
        return;
      }
      if (type === 'message_delta') {
        const eventUsage = parseAnthropicUsage(event.usage);
        if (usage && eventUsage) {
          usage.completion_tokens = eventUsage.completion_tokens;
          usage.total_tokens = usage.prompt_tokens + usage.completion_tokens;
          if (eventUsage.cache_read_tokens !== undefined)
            usage.cache_read_tokens = eventUsage.cache_read_tokens;
          if (eventUsage.cache_write_tokens !== undefined)
            usage.cache_write_tokens = eventUsage.cache_write_tokens;
        } else if (eventUsage) {
          usage = eventUsage;
        }
      }
    } catch {
      /* skip malformed */
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';
    for (const eventBlock of events) {
      await handleEvent(eventBlock);
    }
  }

  if (buffer.trim()) {
    await handleEvent(buffer);
  }

  return {
    content: full,
    usage: usage ?? estimateUsage({ messages, content: full, systemPrompt }),
  };
}
