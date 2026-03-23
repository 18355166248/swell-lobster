export type ChatRole = 'user' | 'assistant';

export type ChatMessage = {
  role: ChatRole;
  content: string;
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

export type SessionSummary = {
  id: string;
  title: string;
  endpoint_name?: string | null;
  persona_path?: string | null;
  updated_at: string;
  message_count: number;
};

export type EndpointConfig = {
  name: string;
  model: string;
  api_type: 'openai' | 'anthropic' | string;
  base_url: string;
  api_key_env: string;
  timeout: number;
  max_tokens: number;
};
