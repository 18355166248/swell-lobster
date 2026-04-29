export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  systemPrompt: string;
  recommendedTools?: string[];
  recommendedPersona?: string;
  icon?: string;
}

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

export type ChatAttachment = {
  kind: 'image' | 'file';
  filename: string;
  mimeType: string;
  url: string;
};

export type ChatMessage = {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
  tool_invocations?: ToolInvocation[];
  blocks?: MessageBlock[];
  attachments?: ChatAttachment[];
  imageUrls?: string[];
};

export type ChatSession = {
  id: string;
  title: string;
  endpoint_name?: string | null;
  persona_path?: string | null;
  template_id?: string | null;
  created_at: string;
  updated_at: string;
  messages: ChatMessage[];
};

export type SessionSummary = {
  id: string;
  title: string;
  endpoint_name?: string | null;
  persona_path?: string | null;
  template_id?: string | null;
  updated_at: string;
  message_count: number;
};

export type SessionSearchResult = {
  id: string;
  session_id: string;
  session_title: string;
  content: string;
  created_at: string;
};

export type EndpointItem = {
  id: string;
  name: string;
  model: string;
  api_type: string;
  enabled: boolean;
  priority?: number;
};

export type PersonaInfo = {
  path: string;
  name: string;
  filename: string;
  description?: string;
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
