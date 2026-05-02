import { chatService } from '../chat/index.js';
import type { ChatSession } from '../chat/models.js';

type DelegateTaskInput = {
  task: string;
  templateId?: string | null;
  endpointName?: string | null;
  timeoutSeconds?: unknown;
  parentSessionId?: string;
};

export type DelegateTaskResult = {
  session_id: string;
  message: string;
  summary: string;
};

const DEFAULT_TIMEOUT_SECONDS = 60;
const MAX_TIMEOUT_SECONDS = 120;
// phase10 只做单层委托，子会话默认禁止再次委托，避免递归扩散。
const DISABLED_CHILD_TOOLS = ['delegate_task'];

function clampTimeoutSeconds(value: unknown): number {
  const raw = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_TIMEOUT_SECONDS;
  return Math.min(Math.floor(raw), MAX_TIMEOUT_SECONDS);
}

function summarizeMessage(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) return '子 Agent 未返回文本内容。';
  if (trimmed.length <= 240) return trimmed;
  return `${trimmed.slice(0, 240)}...`;
}

function resolveEndpointName(input: DelegateTaskInput): string | null | undefined {
  if (input.endpointName?.trim()) return input.endpointName.trim();
  if (!input.parentSessionId) return null;
  const parent = chatService.getSession(input.parentSessionId);
  return parent?.endpoint_name ?? null;
}

export async function delegateTask(input: DelegateTaskInput): Promise<DelegateTaskResult> {
  const task = input.task.trim();
  if (!task) throw new Error('task is required');

  const endpointName = resolveEndpointName(input);
  const childSession = chatService.createSession(endpointName, null, input.templateId ?? null);
  const timeoutMs = clampTimeoutSeconds(input.timeoutSeconds) * 1000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // 复用标准聊天链路，确保子会话同样落消息、工具轨迹和模板提示。
    const result = await chatService.chatStream(
      {
        conversation_id: childSession.id,
        message: task,
        endpoint_name: endpointName,
        disabled_tool_names: DISABLED_CHILD_TOOLS,
      },
      async () => {},
      controller.signal
    );

    return {
      session_id: result.session.id,
      message: result.message,
      summary: summarizeMessage(result.message),
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`delegate task timed out after ${timeoutMs / 1000}s`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function getDelegatedSession(sessionId: string): ChatSession | undefined {
  return chatService.getSession(sessionId);
}
