import type { ToolExecutionTrace } from '../tools/types.js';

export type ChatRole = 'user' | 'assistant';

export type ChatAttachment = {
  kind: 'image' | 'file';
  filename: string;
  mimeType: string;
};

/** 助手消息的有序内容块：文本段或工具调用，保留原始执行顺序。 */
export type MessageBlock =
  | { type: 'text'; content: string }
  | { type: 'tool_invocation'; invocation: ToolExecutionTrace };

export type ChatMessage = {
  id?: string;
  role: ChatRole;
  content: string;
  created_at?: string;
  tool_invocations?: ToolExecutionTrace[]; // 工具执行轨迹（非流式时仅最后一轮）
  blocks?: MessageBlock[]; // 有序内容块，含顺序信息；新会话存库，历史会话无此字段
  attachments?: ChatAttachment[]; // 用户上传附件，物理文件存储于 data/tmp/uploads/
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
  updated_at: string;
  message_count: number;
};

export type EndpointConfig = {
  id?: string;
  name: string;
  model: string;
  api_type: 'openai' | 'anthropic' | string;
  base_url: string;
  api_key_env: string;
  timeout: number;
  max_tokens: number;
  fallback_endpoint_id?: string | null;
  /** 美元/百万 input tokens，可选；用于估算本次请求成本 */
  cost_per_1m_input?: number;
  /** 美元/百万 output tokens，可选 */
  cost_per_1m_output?: number;
};
