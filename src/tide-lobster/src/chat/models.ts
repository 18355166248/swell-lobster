import type { ToolExecutionTrace } from '../tools/types.js';

export type ChatRole = 'user' | 'assistant';

export type ChatMessage = {
  id?: string;
  role: ChatRole;
  content: string;
  created_at?: string;
  tool_invocations?: ToolExecutionTrace[]; // 工具执行轨迹（非流式时仅最后一轮）
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
  /** 美元/百万 input tokens，可选；用于估算本次请求成本 */
  cost_per_1m_input?: number;
  /** 美元/百万 output tokens，可选 */
  cost_per_1m_output?: number;
};
