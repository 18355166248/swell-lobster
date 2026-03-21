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
  updated_at: string;
  message_count: number;
};

export type ChatSession = {
  id: string;
  title: string;
  endpoint_name?: string | null;
  created_at: string;
  updated_at: string;
  messages: ChatMessage[];
};
