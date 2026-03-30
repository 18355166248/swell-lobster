/**
 * 服务商注册表基础类型与接口
 *
 * Node 后端实现（原 Python 参考已移除）。
 */

export interface ProviderInfo {
  name: string; // 显示名称
  slug: string; // 标识符 (anthropic, dashscope, ...)
  api_type: string; // "anthropic" | "openai"
  default_base_url: string; // 默认 API 地址
  api_key_env_suggestion: string; // 建议的环境变量名
  supports_model_list: boolean; // 是否支持模型列表 API
  supports_capability_api: boolean; // API 是否返回能力信息
  requires_api_key: boolean; // 是否需要 API Key
  is_local: boolean; // 是否为本地服务商
  coding_plan_base_url?: string; // Coding Plan 专用 API 地址
  coding_plan_api_type?: string; // Coding Plan 模式下的协议类型
  note?: string; // 前端 i18n key — 服务商提示信息
}

export interface ModelInfo {
  id: string;
  name: string;
  capabilities: Record<string, boolean>;
  context_window?: number;
  max_output_tokens?: number;
  pricing?: Record<string, unknown>;
  thinking_only?: boolean;
}

/** 将 ProviderInfo 序列化为前端可用的 plain object */
export function providerInfoToDict(p: ProviderInfo): Record<string, unknown> {
  const d: Record<string, unknown> = {
    name: p.name,
    slug: p.slug,
    api_type: p.api_type,
    default_base_url: p.default_base_url,
    api_key_env_suggestion: p.api_key_env_suggestion,
    supports_model_list: p.supports_model_list,
    supports_capability_api: p.supports_capability_api,
    requires_api_key: p.requires_api_key,
    is_local: p.is_local,
  };
  if (p.coding_plan_base_url !== undefined) d.coding_plan_base_url = p.coding_plan_base_url;
  if (p.coding_plan_api_type !== undefined) d.coding_plan_api_type = p.coding_plan_api_type;
  if (p.note !== undefined) d.note = p.note;
  return d;
}
