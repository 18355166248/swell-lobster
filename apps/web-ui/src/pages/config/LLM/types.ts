/**
 * LLM 端点配置相关类型，与后端 data/llm_endpoints.json 及 API 对齐。
 */

export type ProviderInfo = {
  name: string;
  /** 唯一标识，如 openai、ollama */
  slug: string;
  /** 协议类型：openai 或 anthropic */
  api_type: 'openai' | 'anthropic';
  /** 默认 API 根地址 */
  default_base_url: string;
  /** 建议的环境变量名，如 OPENAI_API_KEY */
  api_key_env_suggestion: string;
  /** 是否需要填写 API Key（本地服务如 Ollama 为 false） */
  requires_api_key?: boolean;
  /** 是否本地部署（如 Ollama、LM Studio） */
  is_local?: boolean;
};

export type ListedModel = {
  id: string;
  name?: string;
  /** 模型支持的能力（与 bridge 归一化结果一致）：text / vision / video / tools / thinking / audio / pdf */
  capabilities?: Record<string, boolean>;
};

/** 单条端点配置（与后端 endpoints[] 项结构一致） */
export type EndpointItem = {
  name?: string;
  model?: string;
  /** openai 或 anthropic */
  api_type?: string;
  base_url?: string;
  /** 存 API Key 的环境变量名 */
  api_key_env?: string;
  /** 主备顺序，数字越小优先级越高 */
  priority?: number;
  enabled?: boolean;
  /** 服务商 slug */
  provider?: string;
  /** 能力列表：text、thinking、vision 等 */
  capabilities?: string[];
  /** 单次最大生成 token 数，0 表示不限制 */
  max_tokens?: number;
  /** 上下文窗口大小 */
  context_window?: number;
  /** 请求超时秒数 */
  timeout?: number;
  /** 每分钟请求数限制，0 表示不限制 */
  rpm_limit?: number;
  /** 美元/百万 input tokens，可选 */
  cost_per_1m_input?: number;
  /** 美元/百万 output tokens，可选 */
  cost_per_1m_output?: number;
};

/** 添加/编辑端点时表单产出的完整端点数据 */
export type EndpointFormData = {
  name: string;
  model: string;
  api_type: string;
  base_url: string;
  /** 环境变量名，API Key 会写入该 key */
  api_key_env: string;
  /** 当前填写的 API Key 明文，用于写入 .env（可选，仅添加时使用） */
  api_key_value?: string;
  priority: number;
  enabled?: boolean;
  provider?: string;
  capabilities: string[];
  max_tokens: number;
  context_window: number;
  timeout: number;
  rpm_limit: number;
  /** 美元/百万 input tokens */
  cost_per_1m_input?: number;
  /** 美元/百万 output tokens */
  cost_per_1m_output?: number;
};
