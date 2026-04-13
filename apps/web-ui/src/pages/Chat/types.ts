export type ChatRole = 'user' | 'assistant';

export type ToolInvocation = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  status: 'running' | 'completed' | 'failed';
  result?: string;
  truncated?: boolean;
  original_length?: number;
};

export type MessageBlock =
  | { type: 'text'; content: string }
  | { type: 'tool_invocation'; invocation: ToolInvocation };

export type ChatMessage = {
  id?: string;
  role: ChatRole;
  content: string;
  created_at?: string;
  tool_invocations?: ToolInvocation[];
  /** 流式时按事件顺序构建的有序块，历史消息中不存在 */
  blocks?: MessageBlock[];
  /** 前端专用：当前会话内用户发送的图片预览 URL，不持久化 */
  imageUrls?: string[];
  /** 服务端持久化的图片文件名列表 */
  attachments?: string[];
};

export type EndpointItem = {
  name?: string;
  model?: string;
  enabled?: boolean;
  priority?: number;
};

export type SessionSummary = {
  id: string;
  title: string;
  endpoint_name?: string | null;
  persona_path?: string | null;
  updated_at: string;
  message_count: number;
};

export type ChatSession = {
  id: string;
  title: string;
  endpoint_name?: string | null;
  persona_path?: string | null;
  created_at: string;
  updated_at: string;
  messages: ChatMessage[];
};

export type PersonaInfo = {
  path: string;
  name: string;
  description: string;
};

export type ChatStreamEvent =
  | { type: 'delta'; delta: string }
  | { type: 'tool_call'; name: string; status: 'running'; arguments: Record<string, unknown> }
  | {
      type: 'tool_result';
      name: string;
      status: 'completed' | 'failed';
      content: string;
      truncated?: boolean;
      original_length?: number;
    };

/** 与 /api/sessions/search 单行结果一致：命中的是消息行，session_* 用于跳转与展示标题。 */
export type SessionSearchResult = {
  id: string;
  content: string;
  role: ChatRole;
  created_at: string;
  session_id: string;
  session_title: string;
};
