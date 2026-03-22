import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parseEnv } from "../utils/envUtils.js";
import type { ChatSession, EndpointConfig, SessionSummary } from "./models.js";
import { requestChatCompletion, streamChatCompletion } from "./llmClient.js";
import { ChatSessionStore } from "./store.js";

export class ChatService {
  private readonly store: ChatSessionStore;

  constructor(private readonly projectRoot: string) {
    this.store = new ChatSessionStore(resolve(projectRoot, "data", "chat_sessions.json"));
  }

  listSessions(): SessionSummary[] {
    return this.store.listSessions();
  }

  getSession(sessionId: string): ChatSession | undefined {
    return this.store.getSession(sessionId);
  }

  createSession(endpointName?: string | null): ChatSession {
    const endpoint = this.resolveEndpoint(endpointName);
    if (endpointName && !endpoint) {
      throw new Error(`endpoint not found: ${endpointName}`);
    }
    return this.store.createSession(endpoint?.name ?? endpointName ?? null);
  }

  updateSession(
    sessionId: string,
    patch: { endpoint_name?: string | null; title?: string | null }
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
    const userMessage = (args.message ?? "").trim();
    if (!userMessage) throw new Error("message is empty");

    let session = args.conversation_id ? this.store.getSession(args.conversation_id) : undefined;
    let endpoint: EndpointConfig | undefined;

    if (!session) {
      endpoint = this.resolveEndpoint(args.endpoint_name);
      session = this.store.createSession(endpoint?.name ?? args.endpoint_name ?? null);
    } else {
      endpoint = this.resolveEndpoint(args.endpoint_name ?? session.endpoint_name ?? null);
    }

    if (!endpoint) {
      throw new Error("未找到可用端点，请先在 LLM 配置里添加并启用端点");
    }

    let apiKey = this.resolveApiKey(endpoint.api_key_env);
    if (endpoint.api_key_env && !apiKey) {
      throw new Error(`环境变量 ${endpoint.api_key_env} 未配置 API Key`);
    }
    if (!apiKey) apiKey = "local";

    const assistant = await requestChatCompletion({
      endpoint,
      apiKey,
      history: session.messages,
      userMessage,
    });

    const updated = this.store.appendTurn({
      sessionId: session.id,
      userContent: userMessage,
      assistantContent: assistant,
      endpointName: endpoint.name,
    });

    if (!updated) throw new Error("failed to persist chat session");
    return { session: updated, message: assistant };
  }

  deleteSession(sessionId: string): boolean {
    return this.store.deleteSession(sessionId);
  }

  async chatStream(
    args: {
      conversation_id?: string | null;
      message: string;
      endpoint_name?: string | null;
    },
    onChunk: (delta: string) => void
  ): Promise<{ session: ChatSession; message: string }> {
    const userMessage = (args.message ?? "").trim();
    if (!userMessage) throw new Error("message is empty");

    let session = args.conversation_id ? this.store.getSession(args.conversation_id) : undefined;
    let endpoint: EndpointConfig | undefined;

    if (!session) {
      endpoint = this.resolveEndpoint(args.endpoint_name);
      session = this.store.createSession(endpoint?.name ?? args.endpoint_name ?? null);
    } else {
      endpoint = this.resolveEndpoint(args.endpoint_name ?? session.endpoint_name ?? null);
    }

    if (!endpoint) {
      throw new Error("未找到可用端点，请先在 LLM 配置里添加并启用端点");
    }

    let apiKey = this.resolveApiKey(endpoint.api_key_env);
    if (endpoint.api_key_env && !apiKey) {
      throw new Error(`环境变量 ${endpoint.api_key_env} 未配置 API Key`);
    }
    if (!apiKey) apiKey = "local";

    const assistant = await streamChatCompletion({
      endpoint,
      apiKey,
      history: session.messages,
      userMessage,
      onChunk,
    });

    const updated = this.store.appendTurn({
      sessionId: session.id,
      userContent: userMessage,
      assistantContent: assistant,
      endpointName: endpoint.name,
    });

    if (!updated) throw new Error("failed to persist chat session");
    return { session: updated, message: assistant };
  }

  listEndpoints(): Array<Record<string, unknown>> {
    return this.readEndpointsRaw();
  }

  private readEndpointsRaw(): Array<Record<string, unknown>> {
    const path = resolve(this.projectRoot, "data", "llm_endpoints.json");
    if (!existsSync(path)) return [];

    try {
      const raw = JSON.parse(readFileSync(path, "utf-8"));
      return Array.isArray(raw?.endpoints)
        ? raw.endpoints.filter((x: unknown) => x && typeof x === "object")
        : [];
    } catch {
      return [];
    }
  }

  private resolveEndpoint(endpointName?: string | null): EndpointConfig | undefined {
    const endpoints = this.readEndpointsRaw().filter((ep) => ep.enabled !== false);
    if (endpoints.length === 0) return undefined;

    if (endpointName) {
      const found = endpoints.find((ep) => String(ep.name ?? "") === endpointName);
      return found ? this.toEndpointConfig(found) : undefined;
    }

    const sorted = [...endpoints].sort((a, b) => {
      const ap = Number(a.priority ?? 999);
      const bp = Number(b.priority ?? 999);
      return (Number.isFinite(ap) ? ap : 999) - (Number.isFinite(bp) ? bp : 999);
    });
    return this.toEndpointConfig(sorted[0]);
  }

  private toEndpointConfig(raw: Record<string, unknown>): EndpointConfig {
    return {
      name: String(raw.name ?? ""),
      model: String(raw.model ?? ""),
      api_type: String(raw.api_type ?? "openai"),
      base_url: String(raw.base_url ?? "").replace(/\/+$/, ""),
      api_key_env: String(raw.api_key_env ?? ""),
      timeout: Number(raw.timeout ?? 120),
      max_tokens: Number(raw.max_tokens ?? 0),
    };
  }

  private resolveApiKey(envName: string): string {
    if (!envName) return "";
    if (process.env[envName]) return String(process.env[envName]);

    const envPath = resolve(this.projectRoot, ".env");
    if (!existsSync(envPath)) return "";

    try {
      const parsed = parseEnv(readFileSync(envPath, "utf-8"));
      return parsed[envName] ?? "";
    } catch {
      return "";
    }
  }
}
