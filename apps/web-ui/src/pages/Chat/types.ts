export type ChatRole = 'user' | 'assistant';

export type ChatMessage = {
  role: ChatRole;
  content: string;
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

/** 与 /api/sessions/search 单行结果一致：命中的是消息行，session_* 用于跳转与展示标题。 */
export type SessionSearchResult = {
  id: string;
  content: string;
  role: ChatRole;
  created_at: string;
  session_id: string;
  session_title: string;
};
