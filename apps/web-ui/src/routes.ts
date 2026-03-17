/** 路由路径常量，独立文件避免与 router 的循环依赖 */
export const ROUTES = {
  HOME: '/',
  CHAT: '/chat',
  IM: '/im',
  SKILLS: '/skills',
  MCP: '/mcp',
  SCHEDULER: '/scheduler',
  MEMORY: '/memory',
  STATUS: '/status',
  TOKEN_STATS: '/token-stats',
  CONFIG_LLM: '/config/llm',
  CONFIG_IM: '/config/im',
  CONFIG_TOOLS: '/config/tools',
  CONFIG_SOUL: '/config/soul',
  CONFIG_IDENTITY: '/config/identity',
  CONFIG_ADVANCED: '/config/advanced',
  NOT_FOUND: '*',
} as const;
