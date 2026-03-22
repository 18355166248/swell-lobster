/**
 * 模型能力表与推断逻辑
 *
 * 对应 Python: swell_lobster/llm/capabilities.py
 *
 * 七种能力：
 * - text     : 支持文本输入/输出（所有模型都支持）
 * - vision   : 支持图片输入
 * - video    : 支持视频输入
 * - tools    : 支持工具调用 (function calling)
 * - thinking : 支持思考模式（深度推理）
 * - audio    : 支持音频原生输入
 * - pdf      : 支持 PDF 文档原生输入
 *
 * ⚠ 维护提示：前端有此函数的简化版（inferCapabilities），
 * 如果修改了"基于模型名关键词智能推断"的规则，需同步更新前端。
 */

export type Capabilities = {
  text: boolean;
  vision: boolean;
  video: boolean;
  tools: boolean;
  thinking: boolean;
  audio: boolean;
  pdf: boolean;
  thinking_only?: boolean;
};

// ── 预置能力表 ─────────────────────────────────────────────────────────────────

export const MODEL_CAPABILITIES: Record<string, Record<string, Partial<Capabilities>>> = {
  // ================================================================
  // 官方服务商 (Official Providers)
  // ================================================================
  openai: {
    'gpt-5': { text: true, vision: true, video: false, tools: true, thinking: false },
    'gpt-5.2': { text: true, vision: true, video: false, tools: true, thinking: false },
    'gpt-4o': { text: true, vision: true, video: false, tools: true, thinking: false },
    'gpt-4o-audio': {
      text: true,
      vision: true,
      video: false,
      tools: true,
      thinking: false,
      audio: true,
    },
    'gpt-4o-mini': { text: true, vision: true, video: false, tools: true, thinking: false },
    'gpt-4-vision': { text: true, vision: true, video: false, tools: true, thinking: false },
    'gpt-4-turbo': { text: true, vision: true, video: false, tools: true, thinking: false },
    'gpt-4': { text: true, vision: false, video: false, tools: true, thinking: false },
    'gpt-3.5-turbo': { text: true, vision: false, video: false, tools: true, thinking: false },
    o1: { text: true, vision: true, video: false, tools: true, thinking: true },
    'o1-mini': { text: true, vision: false, video: false, tools: true, thinking: true },
    'o1-preview': { text: true, vision: false, video: false, tools: true, thinking: true },
  },
  anthropic: {
    // 所有 Claude 3+ 模型支持 PDF 原生输入
    'claude-opus-4.5': {
      text: true,
      vision: true,
      video: false,
      tools: true,
      thinking: false,
      pdf: true,
    },
    'claude-sonnet-4.5': {
      text: true,
      vision: true,
      video: false,
      tools: true,
      thinking: false,
      pdf: true,
    },
    'claude-haiku-4.5': {
      text: true,
      vision: true,
      video: false,
      tools: true,
      thinking: false,
      pdf: true,
    },
    'claude-3-opus': {
      text: true,
      vision: true,
      video: false,
      tools: true,
      thinking: false,
      pdf: true,
    },
    'claude-3-sonnet': {
      text: true,
      vision: true,
      video: false,
      tools: true,
      thinking: false,
      pdf: true,
    },
    'claude-3-haiku': {
      text: true,
      vision: true,
      video: false,
      tools: true,
      thinking: false,
      pdf: true,
    },
    'claude-3-5-sonnet': {
      text: true,
      vision: true,
      video: false,
      tools: true,
      thinking: false,
      pdf: true,
    },
    'claude-3-5-haiku': {
      text: true,
      vision: true,
      video: false,
      tools: true,
      thinking: false,
      pdf: true,
    },
  },
  deepseek: {
    'deepseek-v3.2': { text: true, vision: false, video: false, tools: true, thinking: false },
    'deepseek-v3': { text: true, vision: false, video: false, tools: true, thinking: false },
    'deepseek-chat': { text: true, vision: false, video: false, tools: true, thinking: false },
    'deepseek-coder': { text: true, vision: false, video: false, tools: true, thinking: false },
    'deepseek-vl2': { text: true, vision: true, video: false, tools: false, thinking: false },
    'deepseek-vl2-base': { text: true, vision: true, video: false, tools: false, thinking: false },
    'deepseek-r1': {
      text: true,
      vision: false,
      video: false,
      tools: true,
      thinking: true,
      thinking_only: true,
    },
    'deepseek-r1-lite': {
      text: true,
      vision: false,
      video: false,
      tools: true,
      thinking: true,
      thinking_only: true,
    },
    'deepseek-reasoner': {
      text: true,
      vision: false,
      video: false,
      tools: true,
      thinking: true,
      thinking_only: true,
    },
  },
  moonshot: {
    'kimi-k2.5': { text: true, vision: true, video: true, tools: true, thinking: false },
    'kimi-k2': { text: true, vision: true, video: true, tools: true, thinking: false },
    'moonshot-v1-8k': { text: true, vision: false, video: false, tools: true, thinking: false },
    'moonshot-v1-32k': { text: true, vision: false, video: false, tools: true, thinking: false },
    'moonshot-v1-128k': { text: true, vision: false, video: false, tools: true, thinking: false },
  },
  dashscope: {
    'qwen3-vl': { text: true, vision: true, video: true, tools: true, thinking: true },
    'qwen2.5-vl': { text: true, vision: true, video: true, tools: true, thinking: false },
    qwen3: { text: true, vision: false, video: false, tools: true, thinking: true },
    'qwen-max': { text: true, vision: false, video: false, tools: true, thinking: false },
    'qwen-max-latest': { text: true, vision: false, video: false, tools: true, thinking: false },
    'qwen-plus': { text: true, vision: false, video: false, tools: true, thinking: true },
    'qwen-plus-latest': { text: true, vision: false, video: false, tools: true, thinking: true },
    'qwen-flash': { text: true, vision: false, video: false, tools: true, thinking: true },
    'qwen-turbo': { text: true, vision: false, video: false, tools: true, thinking: true },
    'qwen-turbo-latest': { text: true, vision: false, video: false, tools: true, thinking: true },
    'qwen3-235b-a22b-thinking': {
      text: true,
      vision: false,
      video: false,
      tools: true,
      thinking: true,
      thinking_only: true,
    },
    'qwen3-30b-a3b-thinking': {
      text: true,
      vision: false,
      video: false,
      tools: true,
      thinking: true,
      thinking_only: true,
    },
    'qwen3-235b-a22b-instruct': {
      text: true,
      vision: false,
      video: false,
      tools: true,
      thinking: false,
    },
    'qwen3-30b-a3b-instruct': {
      text: true,
      vision: false,
      video: false,
      tools: true,
      thinking: false,
    },
    'qwen-vl-max': { text: true, vision: true, video: true, tools: true, thinking: false },
    'qwen-vl-max-latest': { text: true, vision: true, video: true, tools: true, thinking: false },
    'qwen-vl-plus': { text: true, vision: true, video: true, tools: true, thinking: false },
    'qwen-vl-plus-latest': { text: true, vision: true, video: true, tools: true, thinking: false },
    'qwen3-vl-plus': { text: true, vision: true, video: true, tools: true, thinking: true },
    'qwen3-vl-flash': { text: true, vision: true, video: true, tools: true, thinking: true },
    'qwen-audio-turbo': {
      text: true,
      vision: false,
      video: false,
      tools: false,
      thinking: false,
      audio: true,
    },
    'qwen2-audio': {
      text: true,
      vision: false,
      video: false,
      tools: false,
      thinking: false,
      audio: true,
    },
    'qwq-plus': {
      text: true,
      vision: false,
      video: false,
      tools: true,
      thinking: true,
      thinking_only: true,
    },
    'qwq-32b': {
      text: true,
      vision: false,
      video: false,
      tools: true,
      thinking: true,
      thinking_only: true,
    },
    'qvq-max': {
      text: true,
      vision: true,
      video: false,
      tools: false,
      thinking: true,
      thinking_only: true,
    },
  },
  minimax: {
    'minimax-m2.5': { text: true, vision: false, video: false, tools: true, thinking: true },
    'minimax-m2.5-highspeed': {
      text: true,
      vision: false,
      video: false,
      tools: true,
      thinking: true,
    },
    'minimax-m2.1': { text: true, vision: false, video: false, tools: true, thinking: true },
    'minimax-m2.1-highspeed': {
      text: true,
      vision: false,
      video: false,
      tools: true,
      thinking: true,
    },
    'minimax-m2': { text: true, vision: false, video: false, tools: true, thinking: true },
    'abab6.5s-chat': { text: true, vision: false, video: false, tools: true, thinking: false },
    'abab6.5-chat': { text: true, vision: false, video: false, tools: true, thinking: false },
  },
  zhipu: {
    'glm-5': { text: true, vision: false, video: false, tools: true, thinking: true },
    'glm-5-plus': { text: true, vision: false, video: false, tools: true, thinking: true },
    'glm-4.7': { text: true, vision: false, video: false, tools: true, thinking: true },
    'glm-4.6v': { text: true, vision: true, video: false, tools: true, thinking: false },
    'glm-4.5v': { text: true, vision: true, video: false, tools: true, thinking: false },
    'glm-4': { text: true, vision: false, video: false, tools: true, thinking: false },
    'glm-4-plus': { text: true, vision: false, video: false, tools: true, thinking: false },
    'glm-4-air': { text: true, vision: false, video: false, tools: true, thinking: false },
    'glm-4-airx': { text: true, vision: false, video: false, tools: true, thinking: false },
    'glm-4-long': { text: true, vision: false, video: false, tools: true, thinking: false },
    'glm-4-flash': { text: true, vision: false, video: false, tools: true, thinking: false },
    'glm-4-flashx': { text: true, vision: false, video: false, tools: true, thinking: false },
    'glm-4v': { text: true, vision: true, video: false, tools: true, thinking: false },
    'glm-4v-plus': { text: true, vision: true, video: false, tools: true, thinking: false },
    'glm-4-32b-0414-128k': { text: true, vision: false, video: false, tools: true, thinking: true },
    'autoglm-phone': { text: true, vision: true, video: false, tools: true, thinking: false },
    'glm-ocr': { text: true, vision: true, video: false, tools: false, thinking: false },
  },
  google: {
    'gemini-3-pro': {
      text: true,
      vision: true,
      video: true,
      tools: true,
      thinking: false,
      audio: true,
      pdf: true,
    },
    'gemini-3-flash': {
      text: true,
      vision: true,
      video: true,
      tools: true,
      thinking: false,
      audio: true,
      pdf: true,
    },
    'gemini-2.5-pro': {
      text: true,
      vision: true,
      video: true,
      tools: true,
      thinking: false,
      audio: true,
      pdf: true,
    },
    'gemini-2.5-flash': {
      text: true,
      vision: true,
      video: true,
      tools: true,
      thinking: false,
      audio: true,
      pdf: true,
    },
    'gemini-2.0-flash': {
      text: true,
      vision: true,
      video: true,
      tools: true,
      thinking: false,
      audio: true,
      pdf: true,
    },
    'gemini-2.0-flash-lite': {
      text: true,
      vision: true,
      video: false,
      tools: false,
      thinking: false,
      audio: false,
      pdf: false,
    },
    'gemini-1.5-pro': {
      text: true,
      vision: true,
      video: true,
      tools: true,
      thinking: false,
      audio: true,
      pdf: true,
    },
    'gemini-1.5-flash': {
      text: true,
      vision: true,
      video: true,
      tools: true,
      thinking: false,
      audio: true,
      pdf: true,
    },
  },
  // ================================================================
  // 中转服务商 (Third-party Providers)
  // ================================================================
  openrouter: {},
  siliconflow: {
    'moonshotai/Kimi-K2-Thinking': {
      text: true,
      vision: false,
      video: false,
      tools: true,
      thinking: true,
      thinking_only: true,
    },
    'deepseek-ai/DeepSeek-R1': {
      text: true,
      vision: false,
      video: false,
      tools: false,
      thinking: true,
      thinking_only: true,
    },
    'Qwen/QwQ-32B': {
      text: true,
      vision: false,
      video: false,
      tools: true,
      thinking: true,
      thinking_only: true,
    },
    'Qwen/Qwen3-235B-A22B': {
      text: true,
      vision: false,
      video: false,
      tools: true,
      thinking: true,
    },
    'Qwen/Qwen3-32B': { text: true, vision: false, video: false, tools: true, thinking: true },
    'Qwen/Qwen3-14B': { text: true, vision: false, video: false, tools: true, thinking: true },
    'Qwen/Qwen3-8B': { text: true, vision: false, video: false, tools: true, thinking: true },
    'deepseek-ai/DeepSeek-V3': {
      text: true,
      vision: false,
      video: false,
      tools: true,
      thinking: false,
    },
    'deepseek-ai/DeepSeek-V3.1': {
      text: true,
      vision: false,
      video: false,
      tools: true,
      thinking: true,
    },
    'deepseek-ai/DeepSeek-V3.2': {
      text: true,
      vision: false,
      video: false,
      tools: true,
      thinking: true,
    },
    'moonshotai/Kimi-K2-Instruct': {
      text: true,
      vision: false,
      video: false,
      tools: true,
      thinking: false,
    },
    'moonshotai/Kimi-K2.5': { text: true, vision: true, video: true, tools: true, thinking: false },
  },
  volcengine: {
    'doubao-seed-1-6': { text: true, vision: true, video: false, tools: true, thinking: true },
    'doubao-1-5-pro-256k': {
      text: true,
      vision: false,
      video: false,
      tools: true,
      thinking: false,
    },
    'doubao-1-5-pro-32k': { text: true, vision: false, video: false, tools: true, thinking: false },
    'doubao-1-5-lite-32k': {
      text: true,
      vision: false,
      video: false,
      tools: true,
      thinking: false,
    },
    'doubao-1-5-vision-pro-32k': {
      text: true,
      vision: true,
      video: false,
      tools: true,
      thinking: false,
    },
    'doubao-pro-256k': { text: true, vision: false, video: false, tools: true, thinking: false },
    'doubao-pro-32k': { text: true, vision: false, video: false, tools: true, thinking: false },
    'doubao-pro-4k': { text: true, vision: false, video: false, tools: true, thinking: false },
    'doubao-lite-128k': { text: true, vision: false, video: false, tools: true, thinking: false },
    'doubao-lite-32k': { text: true, vision: false, video: false, tools: true, thinking: false },
    'doubao-lite-4k': { text: true, vision: false, video: false, tools: true, thinking: false },
    'doubao-vision-pro-32k': {
      text: true,
      vision: true,
      video: false,
      tools: true,
      thinking: false,
    },
    'doubao-vision-lite-32k': {
      text: true,
      vision: true,
      video: false,
      tools: false,
      thinking: false,
    },
    'deepseek-r1': { text: true, vision: false, video: false, tools: false, thinking: true },
    'deepseek-v3': { text: true, vision: false, video: false, tools: true, thinking: false },
  },
  yunwu: {},
};

// ── URL → provider slug 映射 ───────────────────────────────────────────────────

export const URL_TO_PROVIDER: Record<string, string> = {
  'api.openai.com': 'openai',
  'api.anthropic.com': 'anthropic',
  'dashscope.aliyuncs.com': 'dashscope',
  'dashscope-intl.aliyuncs.com': 'dashscope',
  'api.deepseek.com': 'deepseek',
  'api.moonshot.cn': 'moonshot',
  'api.minimax.chat': 'minimax',
  'open.bigmodel.cn': 'zhipu',
  'bigmodel.cn': 'zhipu',
  'api.z.ai': 'zhipu',
  'generativelanguage.googleapis.com': 'google',
  'openrouter.ai': 'openrouter',
  'api.siliconflow.cn': 'siliconflow',
  'api.siliconflow.com': 'siliconflow',
  'yunwu.ai': 'yunwu',
  'ark.cn-beijing.volces.com': 'volcengine',
};

const _ALL_CAPS: Capabilities = {
  text: false,
  vision: false,
  video: false,
  tools: false,
  thinking: false,
  audio: false,
  pdf: false,
};

function _normalize(caps: Partial<Capabilities>): Capabilities {
  return { ..._ALL_CAPS, ...caps };
}

// ── 核心推断函数 ───────────────────────────────────────────────────────────────

/**
 * 推断模型能力。
 *
 * 优先级：用户配置 > 预置表（精确匹配）> 预置表（前缀匹配）> 跨服务商模糊匹配 > 关键词推断。
 */
export function inferCapabilities(
  modelName: string,
  providerSlug?: string | null,
  userConfig?: Partial<Capabilities> | null
): Capabilities {
  // 1. 优先使用用户配置
  if (userConfig) return _normalize(userConfig);

  const modelLower = modelName.toLowerCase();

  // 2. 按服务商 + 模型名精确匹配
  if (providerSlug && providerSlug in MODEL_CAPABILITIES) {
    const providerModels = MODEL_CAPABILITIES[providerSlug];

    if (modelName in providerModels) return _normalize(providerModels[modelName]);

    // 前缀匹配（处理版本号、日期后缀等）
    for (const [key, caps] of Object.entries(providerModels)) {
      if (modelLower.startsWith(key.toLowerCase())) return _normalize(caps);
    }
  }

  // 3. 跨服务商模糊匹配（中转服务商场景）
  for (const models of Object.values(MODEL_CAPABILITIES)) {
    for (const [key, caps] of Object.entries(models)) {
      if (modelLower.startsWith(key.toLowerCase())) return _normalize(caps);
    }
  }

  // 4. 基于模型名关键词智能推断（兜底）
  const caps: Capabilities = {
    text: true,
    vision: false,
    video: false,
    tools: false,
    thinking: false,
    audio: false,
    pdf: false,
  };

  // Vision
  if (['vl', 'vision', 'visual', 'image', '-v-', '4v'].some((kw) => modelLower.includes(kw)))
    caps.vision = true;

  // Video — 保守策略
  if (['kimi', 'gemini'].some((kw) => modelLower.includes(kw))) caps.video = true;
  if (modelLower.includes('vl') && ['qwen', 'dashscope'].some((kw) => modelLower.includes(kw)))
    caps.video = true;

  // Audio — 非常保守
  if (['audio', 'gemini'].some((kw) => modelLower.includes(kw))) caps.audio = true;

  // PDF — 保守策略
  if (['claude', 'gemini'].some((kw) => modelLower.includes(kw))) caps.pdf = true;

  // Thinking
  if (['thinking', 'r1', 'qwq', 'qvq', 'o1', 'reasoner'].some((kw) => modelLower.includes(kw))) {
    caps.thinking = true;
    if (
      ['-thinking', '-r1', '/r1', 'qwq', 'qvq', 'o1-', 'o3-', 'reasoner'].some((kw) =>
        modelLower.includes(kw)
      )
    )
      caps.thinking_only = true;
  }

  // Tools — 主流模型默认支持
  if (
    ['qwen', 'gpt', 'claude', 'deepseek', 'kimi', 'glm', 'gemini', 'moonshot'].some((kw) =>
      modelLower.includes(kw)
    )
  )
    caps.tools = true;

  return caps;
}

// ── 辅助函数 ───────────────────────────────────────────────────────────────────

/**
 * 从 base_url 推断服务商标识。
 */
export function getProviderSlugFromBaseUrl(baseUrl: string): string | null {
  for (const [domain, slug] of Object.entries(URL_TO_PROVIDER)) {
    if (baseUrl.includes(domain)) return slug;
  }

  const urlLower = baseUrl.toLowerCase();
  const localHosts = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]'];
  if (localHosts.some((h) => urlLower.includes(h))) {
    if (urlLower.includes(':11434')) return 'ollama';
    if (urlLower.includes(':1234')) return 'lmstudio';
    return 'local';
  }

  return null;
}
