/**
 * MCP（Model Context Protocol）子进程服务端持久化与工具元数据类型。
 * 与 SQLite `mcp_servers` 表及 SDK `listTools` 返回结构对齐。
 */

/** 进程状态：运行中 / 已停止 / 启动或连接失败 */
export type MCPServerStatus = 'running' | 'stopped' | 'error';

/** 客户端传输：stdio 子进程；sse / http 为远程（http = MCP Streamable HTTP） */
export type MCPServerTransportType = 'stdio' | 'sse' | 'http';

/** 一条 MCP 服务端配置（含启动命令与环境） */
export interface MCPServerConfig {
  id: string;
  name: string;
  /** 传输类型；默认 stdio */
  type: MCPServerTransportType;
  command: string;
  args: string[];
  env: Record<string, string>;
  /** 市场模板 id，自定义为空 */
  registry_id?: string;
  /** sse / http 时使用 */
  url?: string;
  /** 远程请求头（JSON） */
  headers: Record<string, string>;
  enabled: boolean;
  status: MCPServerStatus;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

/** 创建 MCP 服务端时的请求体（无 id/status，由 store 生成） */
export interface MCPServerCreateInput {
  name: string;
  type?: MCPServerTransportType;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
  registry_id?: string | null;
  url?: string | null;
  headers?: Record<string, string>;
}

/** SDK `tools/list` 中单条工具的精简形状（用于桥接到内置 ToolDef） */
export interface MCPToolInfo {
  name: string;
  description?: string;
  inputSchema?: {
    properties?: Record<string, Record<string, unknown>>;
    required?: string[];
  };
}
