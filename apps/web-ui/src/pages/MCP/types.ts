export type MCPTool = {
  name: string;
  description?: string;
};

export type MCPServerTransport = 'stdio' | 'sse' | 'http';

export type MCPServer = {
  id: string;
  name: string;
  type?: MCPServerTransport;
  command: string;
  args: string[];
  env: Record<string, string>;
  registry_id?: string;
  url?: string;
  headers?: Record<string, string>;
  enabled: boolean;
  status: 'running' | 'stopped' | 'error';
  error_message?: string;
  tool_count: number;
  created_at: string;
};

export type MarketplaceCategory = {
  id: string;
  name_zh: string;
  name_en: string;
};

export type MarketplaceServer = {
  id: string;
  name: string;
  description_zh?: string;
  description_en?: string;
  category: string;
  transportType: string;
  command: string;
  defaultArgs: string[];
  requiredEnvKeys?: string[];
  optionalEnvKeys?: string[];
};

export type MarketplaceCatalog = {
  categories: MarketplaceCategory[];
  servers: MarketplaceServer[];
};

/** 市场安装表单 */
export type InstallMarketFormValues = {
  name: string;
  templateEnv: Record<string, string>;
  extraEnv: { key: string; value: string }[];
};

/** 自定义 / 编辑（与弹窗内字段一致） */
export type CustomFormValues = {
  name: string;
  transportType: MCPServerTransport;
  command: string;
  argsText: string;
  url: string;
  headersText: string;
  extraEnv: { key: string; value: string }[];
  enabled: boolean;
};
