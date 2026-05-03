/**
 * 聊天业务编排层：会话 CRUD、端点解析、系统提示（人格 + 记忆）、
 * 调用 LLM（含多轮工具循环）、流式增量推送、用量落库与记忆抽取触发。
 * 持久化会话走 ChatStore；token 统计走 SQLite（getDb）。
 */
import { randomUUID } from 'node:crypto';

import { readConfiguredEnvValue } from '../config.js';
import type {
  ChatAttachment,
  ChatSession,
  EndpointConfig,
  MessageBlock,
  SessionSummary,
} from './models.js';
import { requestWithFallback, type LLMRequestMessage, type LLMUsage } from './llmClient.js';
import { ChatStore } from './chatStore.js';
import { EndpointStore } from '../store/endpointStore.js';
import { IdentityService } from '../identity/identityService.js';
import { getDb } from '../db/index.js';
import { memoryStore } from '../memory/store.js';
import { getTemplate } from '../agent-templates/store.js';
import { extractorService } from '../memory/extractorService.js';
import { globalToolRegistry } from '../tools/registry.js';
import { ToolRiskLevel, type ToolCall, type ToolExecutionTrace } from '../tools/types.js';
import { buildSkillsAutoRoutingPrompt } from '../skills/autoRouting.js';
import { getSkill } from '../skills/loader.js';
import { persistUploadedBuffer, type StoredAttachment } from '../upload/handler.js';
import { toLLMMessages, type ChatInputAttachment } from './attachments.js';
import { approvalStore } from '../store/approvalStore.js';

/** 单次用户提问内，模型最多可发起多少轮「助手带 tool_calls → 执行工具 → 再请求模型」；防止死循环。 */
const MAX_TOOL_ROUNDS = 25;

/** 流式对话推送给前端的统一事件：文本增量或工具执行状态。 */
export type ChatStreamEvent =
  | { type: 'delta'; delta: string }
  | { type: 'tool_call'; name: string; status: 'running'; arguments: Record<string, unknown> }
  | {
      type: 'tool_approval_required';
      requestId: string;
      toolName: string;
      riskLevel: ToolRiskLevel;
      summary: string;
      arguments: Record<string, unknown>;
      pathScopes?: string[];
      networkScopes?: string[];
    }
  | {
      type: 'tool_approval_resolved';
      requestId: string;
      toolName: string;
      decision: 'approved' | 'denied' | 'expired';
    }
  | {
      type: 'tool_result';
      name: string;
      status: 'completed' | 'failed';
      content: string;
      truncated?: boolean;
      original_length?: number;
    };

/**
 * 从最新消息往前截断，控制发给模型的上下文总字符数（默认约 60k），避免超长请求。
 * tool 消息的 content 按字符串计；非 string 的 content 视为空。
 */
function trimMessages(messages: LLMRequestMessage[], maxChars = 60000): LLMRequestMessage[] {
  let total = 0;
  const result: LLMRequestMessage[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    const content =
      message.role === 'tool'
        ? message.content
        : typeof message.content === 'string'
          ? message.content
          : '';
    total += content.length;
    if (total > maxChars) break;
    result.unshift(message);
  }
  return result;
}

async function emitTextAsChunks(
  content: string,
  emit: (delta: string) => void | Promise<void>
): Promise<void> {
  // 工具回合是同步执行的；最终回答这里按小块回放，前端仍能复用原有 delta 渲染逻辑。
  const chunkSize = 48;
  for (let index = 0; index < content.length; index += chunkSize) {
    await emit(content.slice(index, index + chunkSize));
  }
}

function summarizeToolArguments(args: Record<string, unknown>): string {
  const keys = ['script_path', 'path', 'url', 'query', 'task', 'content'];
  const pick = [...keys, ...Object.keys(args).filter((key) => !keys.includes(key))];
  for (const key of pick) {
    const value = args[key];
    if (typeof value === 'string' && value.trim()) {
      const text = value.trim().replace(/\s+/g, ' ');
      return `${key}: ${text.slice(0, 120)}${text.length > 120 ? '...' : ''}`;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return `${key}: ${String(value)}`;
    }
  }
  return '此工具将按当前参数执行副作用操作。';
}

function buildSkillFallbackResult(skillName: string, skillPath: string, skillContent: string): string {
  return [
    `Auto-routed skill fallback: the model attempted to call skill "${skillName}" as a tool.`,
    `Skills are not callable tools in this runtime. Read and follow the SKILL.md below instead.`,
    `Skill path: ${skillPath}`,
    ``,
    skillContent,
  ].join('\n');
}

class ToolApprovalInterruptedError extends Error {
  constructor(
    message: string,
    readonly finalMessage: string,
    readonly trace: ToolExecutionTrace
  ) {
    super(message);
    this.name = 'ToolApprovalInterruptedError';
  }
}

/**
 * 对外暴露：非流式 chat、流式 chatStream，以及会话/端点查询。
 * 核心路径：落盘用户消息 → buildSystemPrompt → runCompletion（可能多轮工具）→ 落盘助手消息 → 用量与记忆。
 */
export class ChatService {
  private readonly store: ChatStore;
  private readonly endpointStore: EndpointStore;
  private readonly db = getDb();
  private templateSystemPrompts = new Map<string, string>();

  constructor(private readonly projectRoot: string) {
    this.store = new ChatStore();
    this.endpointStore = new EndpointStore();
    this.restoreTemplatePrompts();
  }

  /** 启动时从 DB 恢复 templateSystemPrompts，避免重启后模板失效。 */
  private restoreTemplatePrompts(): void {
    const rows = this.store.listSessionTemplates();
    for (const { id, template_id } of rows) {
      const template = getTemplate(template_id);
      if (template) {
        this.templateSystemPrompts.set(id, template.systemPrompt);
      }
    }
  }

  listSessions(): SessionSummary[] {
    return this.store.listSessions();
  }

  getSession(sessionId: string): ChatSession | undefined {
    return this.store.getSession(sessionId);
  }

  /** 新建会话；可指定默认端点名与 persona 文件路径。未传人格时落库默认助手人格（见 IdentityService.getDefaultAssistantPersonaPath）。 */
  createSession(
    endpointName?: string | null,
    personaPath?: string | null,
    templateId?: string | null
  ): ChatSession {
    const endpoint = this.getEndpointConfig(endpointName);
    if (endpointName && !endpoint) {
      throw new Error(`endpoint not found: ${endpointName}`);
    }
    const trimmed = personaPath?.trim();
    const resolvedPersona = trimmed
      ? trimmed
      : (new IdentityService().getDefaultAssistantPersonaPath() ?? null);
    const session = this.store.createSession(endpoint?.name ?? endpointName ?? null, resolvedPersona, templateId ?? null);

    // 处理模板 system prompt
    if (templateId) {
      const template = getTemplate(templateId);
      if (template) {
        this.templateSystemPrompts.set(session.id, template.systemPrompt);
      }
    }

    return session;
  }

  /** 会话尚无 persona_path 时补全为默认助手人格并写回 SQLite（兼容历史会话与 IM 等直接插库场景）。 */
  private ensureSessionPersona(session: ChatSession): ChatSession {
    if ((session.persona_path ?? '').trim()) return session;
    const defaultPath = new IdentityService().getDefaultAssistantPersonaPath();
    if (!defaultPath) return session;
    const updated = this.updateSession(session.id, { persona_path: defaultPath });
    return updated ?? { ...session, persona_path: defaultPath };
  }

  updateSession(
    sessionId: string,
    patch: { endpoint_name?: string | null; title?: string | null; persona_path?: string | null }
  ): ChatSession | undefined {
    if (patch.endpoint_name) {
      const endpoint = this.getEndpointConfig(patch.endpoint_name);
      if (!endpoint) throw new Error(`endpoint not found: ${patch.endpoint_name}`);
    }
    return this.store.updateSession(sessionId, patch);
  }

  /**
   * 非流式：一次请求拿完整助手回复。流程与 chatStream 相同，只是不向客户端推送 delta/tool 事件。
   */
  async chat(args: {
    conversation_id?: string | null;
    message: string;
    endpoint_name?: string | null;
    attachments?: ChatInputAttachment[];
    disabled_tool_names?: string[];
  }): Promise<{ session: ChatSession; message: string }> {
    const userMessage = (args.message ?? '').trim();
    const attachments = await this.prepareAttachments(args.attachments ?? []);
    if (!userMessage && attachments.length === 0) throw new Error('message is empty');

    // 无 conversation_id 或会话不存在时新建会话；端点优先用入参，否则用会话上已绑定的端点
    let session = args.conversation_id ? this.store.getSession(args.conversation_id) : undefined;
    let endpoint: EndpointConfig | undefined;

    if (!session) {
      endpoint = this.getEndpointConfig(args.endpoint_name);
      session = this.createSession(endpoint?.name ?? args.endpoint_name ?? null, null);
    } else {
      endpoint = this.getEndpointConfig(args.endpoint_name ?? session.endpoint_name ?? null);
    }

    if (!endpoint) {
      throw new Error('未找到可用端点，请先在 LLM 配置里添加并启用端点');
    }

    session = this.ensureSessionPersona(session);

    // 从环境变量 / .env 解析 API Key；无 key_env 时用占位，便于本地等特殊配置
    let apiKey = this.getApiKeyValue(endpoint.api_key_env);
    if (endpoint.api_key_env && !apiKey) {
      throw new Error(`环境变量 ${endpoint.api_key_env} 未配置 API Key`);
    }
    if (!apiKey) apiKey = 'local';

    // 先写入用户消息再调模型，避免请求失败却未记录用户输入
    const sessionAfterUser = this.store.appendUserMessage({
      sessionId: session.id,
      userContent: userMessage,
      endpointName: endpoint.name,
      attachments,
    });
    if (!sessionAfterUser) throw new Error('failed to persist user message');

    const systemPrompt = this.buildSystemPrompt(sessionAfterUser, userMessage);
    const assistant = await this.runCompletion({
      endpoint,
      apiKey,
      sessionId: session.id,
      messages: trimMessages(toLLMMessages(this.projectRoot, sessionAfterUser.messages)),
      systemPrompt,
      disabledToolNames: args.disabled_tool_names ?? [],
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
      endpoint,
      usage: assistant.usage,
    });

    this.attachToolInvocations(appended.session, assistant.toolInvocations);
    this.triggerMemoryExtraction(session.id, endpoint, apiKey);

    return { session: appended.session, message: assistant.content };
  }

  /** 删除会话（JSON 存储侧）。 */
  deleteSession(sessionId: string): boolean {
    this.templateSystemPrompts.delete(sessionId);
    return this.store.deleteSession(sessionId);
  }

  /**
   * 流式对话：通过 onEvent 推送 delta（最终回复会分块模拟流）与 tool_call/tool_result，结束后将完整助手回复落盘。
   * signal 可中止上游请求。
   */
  async chatStream(
    args: {
      conversation_id?: string | null;
      message: string;
      endpoint_name?: string | null;
      attachments?: ChatInputAttachment[];
      disabled_tool_names?: string[];
    },
    onEvent: (event: ChatStreamEvent) => void | Promise<void>,
    signal?: AbortSignal
  ): Promise<{ session: ChatSession; message: string }> {
    // 校验用户输入非空
    const userMessage = (args.message ?? '').trim();
    const attachments = await this.prepareAttachments(args.attachments ?? []);
    if (!userMessage && attachments.length === 0) throw new Error('message is empty');

    // 无 conversation_id 或会话不存在时新建会话；端点优先用入参，否则用会话上已绑定的端点
    let session = args.conversation_id ? this.store.getSession(args.conversation_id) : undefined;
    let endpoint: EndpointConfig | undefined;

    if (!session) {
      endpoint = this.getEndpointConfig(args.endpoint_name);
      session = this.createSession(endpoint?.name ?? args.endpoint_name ?? null, null);
    } else {
      endpoint = this.getEndpointConfig(args.endpoint_name ?? session.endpoint_name ?? null);
    }

    if (!endpoint) {
      throw new Error('未找到可用端点，请先在 LLM 配置里添加并启用端点');
    }

    session = this.ensureSessionPersona(session);

    // 从环境变量 / .env 解析 API Key；无 key_env 时用占位，便于本地等特殊配置
    let apiKey = this.getApiKeyValue(endpoint.api_key_env);
    if (endpoint.api_key_env && !apiKey) {
      throw new Error(`环境变量 ${endpoint.api_key_env} 未配置 API Key`);
    }
    if (!apiKey) apiKey = 'local';

    // buildSystemPrompt 会读 persona + 检索记忆；用户消息必须先落盘，避免白调模型
    const sessionAfterUser = this.store.appendUserMessage({
      sessionId: session.id,
      userContent: userMessage,
      endpointName: endpoint.name,
      attachments,
    });
    if (!sessionAfterUser) throw new Error('failed to persist user message');

    const systemPrompt = this.buildSystemPrompt(sessionAfterUser, userMessage);
    const baseMessages = trimMessages(toLLMMessages(this.projectRoot, sessionAfterUser.messages));

    // 用 tracking wrapper 跟踪已推送给前端的文本，abort 时可落盘
    let accumulated = '';
    const trackedToolInvocations: ToolExecutionTrace[] = [];
    const trackedBlocks: MessageBlock[] = [];
    const trackingOnEvent = async (event: ChatStreamEvent) => {
      if (event.type === 'delta') accumulated += event.delta;
      await onEvent(event);
    };

    try {
      const assistant = await this.runCompletion({
        endpoint,
        apiKey,
        sessionId: session.id,
        messages: baseMessages,
        systemPrompt,
        onEvent: trackingOnEvent,
        signal,
        toolInvocationsRef: trackedToolInvocations,
        blocksRef: trackedBlocks,
        disabledToolNames: args.disabled_tool_names ?? [],
      });

      // 将拼接后的完整助手回复写入会话
      const appended = this.store.appendAssistantMessageWithMeta({
        sessionId: session.id,
        assistantContent: assistant.content,
        endpointName: endpoint.name,
        blocks: assistant.blocks,
      });

      if (!appended) throw new Error('failed to persist chat session');

      this.recordUsage({
        messageId: appended.messageId,
        endpointName: endpoint.name,
        endpoint,
        usage: assistant.usage,
      });

      this.attachToolInvocations(appended.session, assistant.toolInvocations);
      this.triggerMemoryExtraction(session.id, endpoint, apiKey);

      return { session: appended.session, message: assistant.content };
    } catch (e) {
      const isAbort = (e instanceof Error && e.name === 'AbortError') || signal?.aborted;
      if (isAbort && (accumulated.trim() || trackedToolInvocations.length > 0)) {
        // 将前端实际收到的部分内容落盘，刷新后仍可见
        const appended = this.store.appendAssistantMessageWithMeta({
          sessionId: session.id,
          assistantContent: accumulated,
          endpointName: endpoint.name,
          blocks: trackedBlocks.length > 0 ? trackedBlocks : undefined,
        });
        if (appended && trackedToolInvocations.length > 0) {
          this.attachToolInvocations(appended.session, trackedToolInvocations);
        }
      }
      throw e;
    }
  }

  listEndpoints(): Array<Record<string, unknown>> {
    return this.endpointStore.listEndpoints();
  }

  getEndpointConfigById(endpointId: string): EndpointConfig | undefined {
    const endpoint = this.endpointStore
      .listEndpoints()
      .find((item: any) => String(item.id ?? '') === endpointId && item.enabled !== 0);
    return endpoint ? this.toEndpointConfig(endpoint) : undefined;
  }

  /**
   * 解析本次请求使用的 LLM 端点：按 name 精确匹配；未传 name 时取「已启用」列表中 priority 最小的一个。
   */
  getEndpointConfig(endpointName?: string | null): EndpointConfig | undefined {
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

  /** 将 endpointStore 的原始行转为内部统一的 EndpointConfig（去尾斜杠 base_url 等）。 */
  private toEndpointConfig(raw: Record<string, unknown>): EndpointConfig {
    const costIn = raw.cost_per_1m_input;
    const costOut = raw.cost_per_1m_output;
    return {
      id: raw.id ? String(raw.id) : undefined,
      name: String(raw.name ?? ''),
      model: String(raw.model ?? ''),
      api_type: String(raw.api_type ?? 'openai'),
      base_url: String(raw.base_url ?? '').replace(/\/+$/, ''),
      api_key_env: String(raw.api_key_env ?? ''),
      timeout: Number(raw.timeout ?? 120),
      max_tokens: Number(raw.max_tokens ?? 0),
      fallback_endpoint_id: raw.fallback_endpoint_id ? String(raw.fallback_endpoint_id) : undefined,
      cost_per_1m_input:
        typeof costIn === 'number' && Number.isFinite(costIn) && costIn > 0 ? costIn : undefined,
      cost_per_1m_output:
        typeof costOut === 'number' && Number.isFinite(costOut) && costOut >= 0
          ? costOut
          : undefined,
    };
  }

  /** 人格系统提示 + 与当前用户句相关的记忆片段 + skills auto-routing 块。 */
  private buildSystemPrompt(session: ChatSession, userMessage: string): string | undefined {
    const identityService = new IdentityService();
    const basePrompt = identityService.loadSystemPrompt(session.persona_path ?? undefined);
    const relevantMemories = memoryStore.findRelevant(userMessage, 5);

    const parts: string[] = [];
    if (basePrompt) parts.push(basePrompt);

    // 插入模板 system prompt
    const templatePrompt = this.templateSystemPrompts.get(session.id);
    if (templatePrompt) parts.push(templatePrompt);

    if (relevantMemories.length > 0) {
      const MAX_MEMORY_BLOCK_CHARS = 2000;
      const memoryBlock = relevantMemories
        .map((item) => `- ${item.content}`)
        .join('\n')
        .slice(0, MAX_MEMORY_BLOCK_CHARS);
      parts.push(`## 关于用户的记忆\n${memoryBlock}`);
    }

    const skillsPrompt = buildSkillsAutoRoutingPrompt();
    if (skillsPrompt) parts.push(skillsPrompt);

    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const now = new Date().toLocaleString('zh-CN', { timeZone: tz, hour12: false });
    parts.push(`当前时间：${now}（${tz}）`);

    return parts.length > 0 ? parts.join('\n\n') : undefined;
  }

  /**
   * 单次「用户轮」内的 LLM 循环：请求 → 若无 tool_calls 则得到最终文案并返回；
   * 若有 tool_calls 则执行工具、把 assistant/tool 消息追加进 currentMessages 再请求，直到无工具或达到 MAX_TOOL_ROUNDS。
   * 流式场景下最终文案通过 emitTextAsChunks 模拟 delta；非流式直接整段 content。
   * blocksRef 为外部传入的数组引用，函数直接 push，abort 时调用方仍可读取已积累的部分。
   */
  private async runCompletion(args: {
    endpoint: EndpointConfig;
    apiKey: string;
    sessionId: string;
    messages: LLMRequestMessage[];
    systemPrompt?: string;
    onEvent?: (event: ChatStreamEvent) => void | Promise<void>;
    signal?: AbortSignal;
    toolInvocationsRef?: ToolExecutionTrace[];
    blocksRef?: MessageBlock[];
    // 给子会话按需裁剪工具能力，例如禁用 delegate_task 防递归委托。
    disabledToolNames?: string[];
  }): Promise<{
    content: string;
    usage?: LLMUsage;
    toolInvocations: ToolExecutionTrace[];
    blocks: MessageBlock[];
  }> {
    let currentMessages = [...args.messages];
    const toolInvocations = args.toolInvocationsRef ?? [];
    const blocks: MessageBlock[] = args.blocksRef ?? [];
    const disabledToolNames = new Set(args.disabledToolNames ?? []);
    let lastContent = '';

    /** 追加或合并文本块：若末尾已是文本块则直接拼接，否则新建。 */
    const pushText = (text: string) => {
      if (!text) return;
      const last = blocks[blocks.length - 1];
      if (last?.type === 'text') {
        last.content += text;
      } else {
        blocks.push({ type: 'text', content: text });
      }
    };

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      // anthropic / openai 两套 tools schema 由 registry 分别序列化
      if (args.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const result = await requestWithFallback({
        endpoint: args.endpoint,
        apiKey: args.apiKey,
        messages: currentMessages,
        systemPrompt: args.systemPrompt,
        // 工具 schema 按请求过滤，复用同一套补全链路但允许子会话缩小工具集。
        tools:
          args.endpoint.api_type === 'anthropic'
            ? globalToolRegistry.toAnthropicFormat([...disabledToolNames])
            : globalToolRegistry.toOpenAIFormat([...disabledToolNames]),
        resolveFallback: (endpointId) => this.getEndpointConfigById(endpointId),
        resolveApiKey: (endpoint) => {
          const apiKey = this.getApiKeyValue(endpoint.api_key_env);
          return apiKey || 'local';
        },
        signal: args.signal,
      });

      // 模型不再要工具：视为本轮对话的最终回复
      if (!result.tool_calls?.length) {
        if (args.onEvent && result.content) {
          // 用独立变量累积最终内容，避免和中间轮 content 拼接
          let finalAccumulated = '';
          await emitTextAsChunks(result.content, async (delta) => {
            finalAccumulated += delta;
            await args.onEvent?.({ type: 'delta', delta });
          });
          lastContent = finalAccumulated;
        } else {
          // 不用空字符串覆盖已有内容（模型工具调用后第二轮可能返回空）
          lastContent = result.content || lastContent;
        }
        pushText(result.content || '');
        return {
          content: lastContent,
          usage: result.usage,
          toolInvocations,
          blocks,
        };
      }

      // 保留助手可见文本（若有），并挂上 tool_calls，供下一轮请求前拼接 tool 角色消息
      if (args.onEvent && result.content) {
        await args.onEvent({ type: 'delta', delta: result.content });
      }
      pushText(result.content || '');
      currentMessages = [
        ...currentMessages,
        {
          role: 'assistant',
          content: result.content || null,
          tool_calls: result.tool_calls,
        },
      ];
      lastContent = result.content || lastContent;

      for (const toolCall of result.tool_calls) {
        let trace: ToolExecutionTrace;
        try {
          trace = await this.executeTool(
            toolCall,
            toolInvocations,
            args.onEvent,
            args.sessionId,
            disabledToolNames,
            args.signal
          );
        } catch (error) {
          if (error instanceof ToolApprovalInterruptedError) {
            blocks.push({ type: 'tool_invocation', invocation: error.trace });
            pushText(error.finalMessage);
            if (args.onEvent) {
              await emitTextAsChunks(error.finalMessage, async (delta) => {
                await args.onEvent?.({ type: 'delta', delta });
              });
            }
            lastContent = error.finalMessage;
            return {
              content: error.finalMessage,
              usage: result.usage,
              toolInvocations,
              blocks,
            };
          }
          throw error;
        }
        // 工具执行完成后，以最终状态写入 blocks
        blocks.push({ type: 'tool_invocation', invocation: trace });
        currentMessages = [
          ...currentMessages,
          {
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolCall.name,
            content: trace.result ?? '',
          },
        ];
      }
    }

    // 多轮工具后仍要求工具：不再请求模型，返回提示语（无 usage 累加语义，由最后一次成功轮次决定）
    return {
      content: lastContent || '工具调用达到上限，已停止继续执行。',
      toolInvocations,
      blocks,
    };
  }

  /** 执行单个工具：写入 trace、推送 tool_call/tool_result 事件、捕获 execute 异常为 failed。 */
  private async executeTool(
    toolCall: ToolCall,
    toolInvocations: ToolExecutionTrace[],
    onEvent?: (event: ChatStreamEvent) => void | Promise<void>,
    sessionId?: string, // 会话 ID，用于记录技能调用日志
    disabledToolNames: Set<string> = new Set(),
    signal?: AbortSignal
  ): Promise<ToolExecutionTrace> {
    const trace: ToolExecutionTrace = {
      id: toolCall.id,
      name: toolCall.name,
      arguments: toolCall.arguments,
      status: 'running',
    };
    toolInvocations.push(trace);
    await onEvent?.({
      type: 'tool_call',
      name: toolCall.name,
      status: 'running',
      arguments: toolCall.arguments,
    });

    if (disabledToolNames.has(toolCall.name)) {
      trace.status = 'failed';
      // 返回普通 tool_result 而不是抛异常，让模型有机会解释为什么该工具不可用。
      trace.result = `工具 ${toolCall.name} 在当前子会话中已禁用`;
      await onEvent?.({
        type: 'tool_result',
        name: toolCall.name,
        status: 'failed',
        content: trace.result,
      });
      return trace;
    }

    const tool = globalToolRegistry.get(toolCall.name);
    if (!tool) {
      const skill = getSkill(toolCall.name);
      if (skill?.enabled) {
        const readSkill = globalToolRegistry.get('read_skill');
        if (readSkill) {
          const skillContent = await readSkill.execute(
            { path: skill.file_path },
            { sessionId }
          );
          trace.status = 'completed';
          trace.result = buildSkillFallbackResult(
            skill.name,
            skill.file_path,
            skillContent
          );
          await onEvent?.({
            type: 'tool_result',
            name: toolCall.name,
            status: 'completed',
            content: trace.result,
          });
          return trace;
        }
      }

      trace.status = 'failed';
      trace.result = `工具 ${toolCall.name} 不存在`;
      await onEvent?.({
        type: 'tool_result',
        name: toolCall.name,
        status: 'failed',
        content: trace.result,
      });
      return trace;
    }

    if (tool.permission.requiresApproval) {
      if (!(sessionId && approvalStore.hasSessionGrant(sessionId, toolCall.name))) {
      const approval = approvalStore.createRequest({
        sessionId: sessionId ?? 'unknown',
        toolName: toolCall.name,
        riskLevel: tool.permission.riskLevel,
        arguments: toolCall.arguments,
        summary: `${tool.permission.sideEffectSummary} ${summarizeToolArguments(toolCall.arguments)}`,
      });
      trace.approval_request_id = approval.id;
      await onEvent?.({
        type: 'tool_approval_required',
        requestId: approval.id,
        toolName: toolCall.name,
        riskLevel: tool.permission.riskLevel,
        summary: approval.summary,
        arguments: toolCall.arguments,
        pathScopes: tool.permission.pathScopes,
        networkScopes: tool.permission.networkScopes,
      });

      const resolved = await approvalStore.waitForDecision(approval.id, {
        signal,
        timeoutMs: 60_000,
      });
      const decision =
        resolved.status === 'approved'
          ? 'approved'
          : resolved.status === 'denied'
            ? 'denied'
            : 'expired';
      await onEvent?.({
        type: 'tool_approval_resolved',
        requestId: approval.id,
        toolName: toolCall.name,
        decision,
      });

      if (resolved.status !== 'approved') {
        trace.status = 'failed';
        trace.result =
          resolved.status === 'denied'
            ? `工具 ${toolCall.name} 的执行请求已被拒绝`
            : `工具 ${toolCall.name} 的执行请求等待审批超时`;
        await onEvent?.({
          type: 'tool_result',
          name: toolCall.name,
          status: 'failed',
          content: trace.result,
        });
        throw new ToolApprovalInterruptedError(
          trace.result,
          resolved.status === 'denied'
            ? `已拒绝工具 ${toolCall.name}，本轮工具执行已停止。`
            : `工具 ${toolCall.name} 审批超时，本轮工具执行已停止。`,
          trace
        );
      }
      }
    }

    const TOOL_RESULT_MAX_CHARS = 50_000;
    try {
      const rawResult = await tool.execute(toolCall.arguments, { sessionId });
      const truncated = rawResult.length > TOOL_RESULT_MAX_CHARS;
      trace.result = truncated
        ? rawResult.slice(0, TOOL_RESULT_MAX_CHARS) +
          `\n...[输出过长已截断，共 ${rawResult.length} 字符]`
        : rawResult;
      trace.status = 'completed';
      await onEvent?.({
        type: 'tool_result',
        name: toolCall.name,
        status: 'completed',
        content: trace.result,
        truncated,
        original_length: truncated ? rawResult.length : undefined,
      });
    } catch (error) {
      trace.status = 'failed';
      trace.result = error instanceof Error ? error.message : String(error);
      await onEvent?.({
        type: 'tool_result',
        name: toolCall.name,
        status: 'failed',
        content: trace.result,
      });
    }
    return trace;
  }

  /** 把本轮工具执行轨迹挂到最后一条助手消息上，并写入 SQLite，便于前端展示与刷新后保留。 */
  private attachToolInvocations(session: ChatSession, toolInvocations: ToolExecutionTrace[]): void {
    if (toolInvocations.length === 0) return;
    const lastAssistant = [...session.messages]
      .reverse()
      .find((message) => message.role === 'assistant');
    if (lastAssistant) {
      lastAssistant.tool_invocations = toolInvocations;
      if (lastAssistant.id) {
        this.store.updateMessageToolInvocations(lastAssistant.id, toolInvocations);
      }
    }
  }

  /** 异步后台抽取记忆，失败只打日志，不影响本次聊天返回。 */
  private triggerMemoryExtraction(
    sessionId: string,
    endpoint: EndpointConfig,
    apiKey: string
  ): void {
    extractorService.extractFromSession(sessionId, endpoint, apiKey).catch((error) => {
      console.error('[chat.memory] extract failed:', error);
    });
  }

  /** 统一从当前生效的用户配置 .env 读取 API Key。 */
  getApiKeyValue(envName: string): string {
    return readConfiguredEnvValue(envName);
  }

  private async prepareAttachments(attachments: ChatInputAttachment[]): Promise<ChatAttachment[]> {
    const normalized: ChatAttachment[] = [];

    for (const attachment of attachments) {
      if (!attachment?.mimeType || (attachment.kind !== 'image' && attachment.kind !== 'file')) {
        continue;
      }

      if (attachment.filename) {
        normalized.push({
          kind: attachment.kind,
          filename: attachment.filename,
          mimeType: attachment.mimeType,
        });
        continue;
      }

      if (!attachment.base64) continue;
      try {
        const stored: StoredAttachment = persistUploadedBuffer({
          buffer: Buffer.from(attachment.base64, 'base64'),
          mimeType: attachment.mimeType,
          kind: attachment.kind,
        });
        normalized.push({
          kind: stored.kind,
          filename: stored.filename,
          mimeType: stored.mimeType,
        });
      } catch (error) {
        console.warn('[chat.attachments] skip invalid attachment:', error);
      }
    }

    return normalized;
  }

  /**
   * 助手回复成功后的统计：更新消息行 token_count，并按 UTC 日历日 upsert token_stats。
   * Review 注意：聚合接口「今日」等用 SQLite date('now','localtime')，与此处 UTC 日期在非 UTC 时区边界可能差一天，若需一致可改为同一时区取日串。
   */
  private recordUsage(args: {
    messageId: string;
    endpointName?: string | null;
    endpoint?: EndpointConfig;
    usage?: LLMUsage;
  }): void {
    if (!args.usage) return;

    this.store.updateMessageTokenCount(args.messageId, args.usage.total_tokens);

    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();
    const costUsd = this.computeCostUsd(args.endpoint, args.usage);

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
          cache_read_tokens,
          cache_write_tokens,
          cost_usd,
          request_count,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
        ON CONFLICT(date, endpoint_name) DO UPDATE SET
          prompt_tokens = token_stats.prompt_tokens + excluded.prompt_tokens,
          completion_tokens = token_stats.completion_tokens + excluded.completion_tokens,
          total_tokens = token_stats.total_tokens + excluded.total_tokens,
          cache_read_tokens = token_stats.cache_read_tokens + excluded.cache_read_tokens,
          cache_write_tokens = token_stats.cache_write_tokens + excluded.cache_write_tokens,
          cost_usd = token_stats.cost_usd + excluded.cost_usd,
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
        args.usage.cache_read_tokens ?? 0,
        args.usage.cache_write_tokens ?? 0,
        costUsd,
        now
      );
  }

  /** 按端点可选单价估算本次请求美元成本（未配置单价时为 0）。 */
  private computeCostUsd(endpoint: EndpointConfig | undefined, usage: LLMUsage): number {
    const rateIn = endpoint?.cost_per_1m_input;
    if (typeof rateIn !== 'number' || !Number.isFinite(rateIn) || rateIn <= 0) return 0;
    const rateOut = endpoint?.cost_per_1m_output ?? 0;
    const out =
      typeof rateOut === 'number' && Number.isFinite(rateOut) && rateOut >= 0 ? rateOut : 0;
    return (usage.prompt_tokens / 1_000_000) * rateIn + (usage.completion_tokens / 1_000_000) * out;
  }
}
