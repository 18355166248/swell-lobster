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

export type ChatMessage = {
  id?: string;
  role: ChatRole;
  content: string;
  created_at?: string;
  tool_invocations?: ToolInvocation[];
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
