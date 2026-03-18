import type { ProviderInfo } from './types';

/** 内置服务商列表（后端 /api/config/providers 为空时的回退） */
export const BUILTIN_PROVIDERS: ProviderInfo[] = [
  {
    name: 'OpenAI',
    slug: 'openai',
    api_type: 'openai',
    default_base_url: 'https://api.openai.com/v1',
    api_key_env_suggestion: 'OPENAI_API_KEY',
    requires_api_key: true,
  },
  {
    name: 'Anthropic',
    slug: 'anthropic',
    api_type: 'anthropic',
    default_base_url: 'https://api.anthropic.com',
    api_key_env_suggestion: 'ANTHROPIC_API_KEY',
    requires_api_key: true,
  },
  {
    name: '通义千问 / DashScope',
    slug: 'dashscope',
    api_type: 'openai',
    default_base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    api_key_env_suggestion: 'DASHSCOPE_API_KEY',
    requires_api_key: true,
  },
  {
    name: '自定义 (Custom)',
    slug: 'custom',
    api_type: 'openai',
    default_base_url: '',
    api_key_env_suggestion: 'CUSTOM_API_KEY',
    requires_api_key: true,
  },
  {
    name: 'Ollama',
    slug: 'ollama',
    api_type: 'openai',
    default_base_url: 'http://127.0.0.1:11434/v1',
    api_key_env_suggestion: 'OLLAMA_API_KEY',
    requires_api_key: false,
    is_local: true,
  },
  {
    name: 'LM Studio',
    slug: 'lmstudio',
    api_type: 'openai',
    default_base_url: 'http://127.0.0.1:1234/v1',
    api_key_env_suggestion: 'LMSTUDIO_API_KEY',
    requires_api_key: false,
    is_local: true,
  },
];

/** 模型能力选项（用于端点能力勾选） */
export const CAPABILITY_OPTIONS: { k: string; name: string }[] = [
  { k: 'text', name: '文本' },
  { k: 'thinking', name: '思考' },
  { k: 'vision', name: '视觉' },
  { k: 'video', name: '视频' },
  { k: 'tools', name: '工具' },
];
