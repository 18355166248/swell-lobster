import type { ChatMessage, EndpointConfig } from "./models.js";

function normalizeMessages(history: ChatMessage[], userMessage: string): Array<{ role: "user" | "assistant"; content: string }> {
  const normalized = history
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: m.content }));
  normalized.push({ role: "user", content: userMessage });
  return normalized;
}

function openAIChatUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

function anthropicMessagesUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  return base.endsWith("/v1") ? `${base}/messages` : `${base}/v1/messages`;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutSec: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutMs = Math.max(10, timeoutSec) * 1000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function requestChatCompletion(args: {
  endpoint: EndpointConfig;
  apiKey: string;
  history: ChatMessage[];
  userMessage: string;
}): Promise<string> {
  const { endpoint, apiKey, history, userMessage } = args;
  if (!endpoint.base_url) throw new Error("endpoint base_url is empty");
  if (!endpoint.model) throw new Error("endpoint model is empty");

  const messages = normalizeMessages(history, userMessage);
  if ((endpoint.api_type || "openai").toLowerCase() === "anthropic") {
    return requestAnthropic(endpoint, apiKey, messages);
  }
  return requestOpenAI(endpoint, apiKey, messages);
}

async function requestOpenAI(
  endpoint: EndpointConfig,
  apiKey: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>
): Promise<string> {
  const body: Record<string, unknown> = { model: endpoint.model, messages };
  if (endpoint.max_tokens > 0) body.max_tokens = endpoint.max_tokens;

  const res = await fetchWithTimeout(
    openAIChatUrl(endpoint.base_url),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
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

  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    const texts = content
      .map((item) => {
        if (!item || typeof item !== "object") return "";
        const row = item as Record<string, unknown>;
        const type = String(row.type ?? "");
        if (type !== "text" && type !== "output_text") return "";
        return String(row.text ?? "").trim();
      })
      .filter(Boolean);
    if (texts.length > 0) return texts.join("\n");
  }

  throw new Error("chat completion response has no readable content");
}

async function requestAnthropic(
  endpoint: EndpointConfig,
  apiKey: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>
): Promise<string> {
  const body: Record<string, unknown> = {
    model: endpoint.model,
    messages,
    max_tokens: endpoint.max_tokens > 0 ? endpoint.max_tokens : 1024,
  };

  const res = await fetchWithTimeout(
    anthropicMessagesUrl(endpoint.base_url),
    {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        accept: "application/json",
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
      if (!item || typeof item !== "object") return "";
      const row = item as Record<string, unknown>;
      if (String(row.type ?? "") !== "text") return "";
      return String(row.text ?? "").trim();
    })
    .filter(Boolean);

  if (texts.length === 0) throw new Error("chat completion response has no readable content");
  return texts.join("\n");
}
