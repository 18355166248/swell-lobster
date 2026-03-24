import type { ChatMessage, EndpointConfig } from './models.js';

export interface LLMUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatCompletionResult {
  content: string;
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
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  content: string;
  systemPrompt?: string;
}): LLMUsage {
  const promptText =
    args.messages.map((message) => message.content).join('\n') +
    (args.systemPrompt ? `\n${args.systemPrompt}` : '');
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
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
  };
}

function normalizeMessages(
  history: ChatMessage[],
  userMessage: string
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const normalized = history
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role, content: m.content }));
  normalized.push({ role: 'user', content: userMessage });
  return normalized;
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

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutSec: number,
  signal?: AbortSignal
): Promise<Response> {
  const controller = new AbortController();
  const timeoutMs = Math.max(10, timeoutSec) * 1000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', abort, { once: true });
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export async function streamChatCompletion(args: {
  endpoint: EndpointConfig;
  apiKey: string;
  history: ChatMessage[];
  userMessage: string;
  systemPrompt?: string;
  onChunk: (delta: string) => void | Promise<void>;
  signal?: AbortSignal;
}): Promise<ChatCompletionResult> {
  const { endpoint, apiKey, history, userMessage, systemPrompt, onChunk, signal } = args;
  if (!endpoint.model) throw new Error('endpoint model is empty');

  const apiType = (endpoint.api_type || 'openai').toLowerCase();

  if (!endpoint.base_url) throw new Error('endpoint base_url is empty');
  const messages = normalizeMessages(history, userMessage);
  if (apiType === 'anthropic') {
    return streamAnthropic(endpoint, apiKey, messages, onChunk, systemPrompt, signal);
  }
  return streamOpenAI(endpoint, apiKey, messages, onChunk, systemPrompt, signal);
}

export async function requestChatCompletion(args: {
  endpoint: EndpointConfig;
  apiKey: string;
  history: ChatMessage[];
  userMessage: string;
  systemPrompt?: string;
}): Promise<ChatCompletionResult> {
  const { endpoint, apiKey, history, userMessage, systemPrompt } = args;
  if (!endpoint.model) throw new Error('endpoint model is empty');

  const apiType = (endpoint.api_type || 'openai').toLowerCase();

  if (!endpoint.base_url) throw new Error('endpoint base_url is empty');
  const messages = normalizeMessages(history, userMessage);
  if (apiType === 'anthropic') {
    return requestAnthropic(endpoint, apiKey, messages, systemPrompt);
  }
  return requestOpenAI(endpoint, apiKey, messages, systemPrompt);
}

async function requestOpenAI(
  endpoint: EndpointConfig,
  apiKey: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  systemPrompt?: string
): Promise<ChatCompletionResult> {
  const finalMessages = systemPrompt
    ? [{ role: 'system' as const, content: systemPrompt }, ...messages]
    : messages;
  const body: Record<string, unknown> = { model: endpoint.model, messages: finalMessages };
  if (endpoint.max_tokens > 0) body.max_tokens = endpoint.max_tokens;

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
  const content = message.content;

  if (typeof content === 'string') {
    const trimmed = content.trim();
    return {
      content: trimmed,
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
        usage:
          parseOpenAIUsage(data.usage) ??
          estimateUsage({ messages, content: joined, systemPrompt }),
      };
    }
  }

  throw new Error('chat completion response has no readable content');
}

async function requestAnthropic(
  endpoint: EndpointConfig,
  apiKey: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  systemPrompt?: string
): Promise<ChatCompletionResult> {
  const body: Record<string, unknown> = {
    model: endpoint.model,
    messages,
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
  const texts = content
    .map((item) => {
      if (!item || typeof item !== 'object') return '';
      const row = item as Record<string, unknown>;
      if (String(row.type ?? '') !== 'text') return '';
      return String(row.text ?? '').trim();
    })
    .filter(Boolean);

  if (texts.length === 0) throw new Error('chat completion response has no readable content');
  const contentText = texts.join('\n');
  return {
    content: contentText,
    usage:
      parseAnthropicUsage(data.usage) ??
      estimateUsage({ messages, content: contentText, systemPrompt }),
  };
}

async function streamOpenAI(
  endpoint: EndpointConfig,
  apiKey: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  onChunk: (delta: string) => void | Promise<void>,
  systemPrompt?: string,
  signal?: AbortSignal
): Promise<ChatCompletionResult> {
  const finalMessages = systemPrompt
    ? [{ role: 'system' as const, content: systemPrompt }, ...messages]
    : messages;
  const body: Record<string, unknown> = {
    model: endpoint.model,
    messages: finalMessages,
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
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  onChunk: (delta: string) => void | Promise<void>,
  systemPrompt?: string,
  signal?: AbortSignal
): Promise<ChatCompletionResult> {
  const body: Record<string, unknown> = {
    model: endpoint.model,
    messages,
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
