export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  enum?: string[];
  /** JSON Schema 的 `items`；`type: array` 时发给 Gemini/OpenAI 工具 schema 必填，缺省由 registry 补 `{ type: 'string' }` */
  items?: Record<string, unknown>;
  required?: boolean;
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
  execute(
    args: Record<string, unknown>,
    context?: {
      sessionId?: string;
    }
  ): Promise<string>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, Record<string, unknown>>;
      required?: string[];
    };
  };
}

export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, Record<string, unknown>>;
    required?: string[];
  };
}

export interface ToolExecutionTrace {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  status: 'running' | 'completed' | 'failed';
  result?: string;
}
