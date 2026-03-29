/**
 * MCP（Model Context Protocol）子进程服务端持久化与工具元数据类型。
 * 与 SQLite `mcp_servers` 表及 SDK `listTools` 返回结构对齐。
 */

/** 进程状态：运行中 / 已停止 / 启动或连接失败 */
export type MCPServerStatus = 'running' | 'stopped' | 'error';

/** 一条 MCP 服务端配置（含启动命令与环境） */
export interface MCPServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
  status: MCPServerStatus;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

/** 创建 MCP 服务端时的请求体（无 id/status，由 store 生成） */
export interface MCPServerCreateInput {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
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
