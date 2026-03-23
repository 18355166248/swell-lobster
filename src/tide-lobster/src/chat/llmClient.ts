import type { ChatMessage, EndpointConfig } from './models.js';

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
  timeoutSec: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutMs = Math.max(10, timeoutSec) * 1000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function streamChatCompletion(args: {
  endpoint: EndpointConfig;
  apiKey: string;
  history: ChatMessage[];
  userMessage: string;
  systemPrompt?: string;
  onChunk: (delta: string) => void | Promise<void>;
}): Promise<string> {
  const { endpoint, apiKey, history, userMessage, systemPrompt, onChunk } = args;
  if (!endpoint.model) throw new Error('endpoint model is empty');

  const apiType = (endpoint.api_type || 'openai').toLowerCase();

  if (!endpoint.base_url) throw new Error('endpoint base_url is empty');
  const messages = normalizeMessages(history, userMessage);
  if (apiType === 'anthropic') {
    return streamAnthropic(endpoint, apiKey, messages, onChunk, systemPrompt);
  }
  return streamOpenAI(endpoint, apiKey, messages, onChunk, systemPrompt);
}

export async function requestChatCompletion(args: {
  endpoint: EndpointConfig;
  apiKey: string;
  history: ChatMessage[];
  userMessage: string;
  systemPrompt?: string;
}): Promise<string> {
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
): Promise<string> {
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

  if (typeof content === 'string') return content.trim();
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
    if (texts.length > 0) return texts.join('\n');
  }

  throw new Error('chat completion response has no readable content');
}

async function requestAnthropic(
  endpoint: EndpointConfig,
  apiKey: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  systemPrompt?: string
): Promise<string> {
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
  return texts.join('\n');
}

async function streamOpenAI(
  endpoint: EndpointConfig,
  apiKey: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  onChunk: (delta: string) => void | Promise<void>,
  systemPrompt?: string
): Promise<string> {
  const finalMessages = systemPrompt
    ? [{ role: 'system' as const, content: systemPrompt }, ...messages]
    : messages;
  const body: Record<string, unknown> = { model: endpoint.model, messages: finalMessages, stream: true };
  if (endpoint.max_tokens > 0) body.max_tokens = endpoint.max_tokens;

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
    endpoint.timeout
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

  return full;
}

async function streamAnthropic(
  endpoint: EndpointConfig,
  apiKey: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  onChunk: (delta: string) => void | Promise<void>,
  systemPrompt?: string
): Promise<string> {
  const body: Record<string, unknown> = {
    model: endpoint.model,
    messages,
    max_tokens: endpoint.max_tokens > 0 ? endpoint.max_tokens : 1024,
    stream: true,
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
    endpoint.timeout
  );

  if (!res.ok) {
    const text = (await res.text()).slice(0, 200);
    throw new Error(`chat completion failed(${res.status}): ${text}`);
  }

  let full = '';
  const decoder = new TextDecoder();
  const reader = res.body!.getReader();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const raw = line.slice(5).trim();
      try {
        const chunk = JSON.parse(raw) as Record<string, unknown>;
        if (chunk.type === 'content_block_delta') {
          const delta = chunk.delta as Record<string, unknown> | undefined;
          const text = typeof delta?.text === 'string' ? delta.text : '';
          if (text) {
            await onChunk(text);
            full += text;
          }
        }
      } catch {
        /* skip malformed */
      }
    }
  }

  return full;
}
