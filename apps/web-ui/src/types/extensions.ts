/**
 * 与后端 src/tide-lobster/src/extensions/types.ts 对齐的最小类型，
 * 仅用于 Extensions 页面渲染表格 + 抽屉详情。
 */

export type ExtensionSource = 'builtin' | 'skill' | 'mcp';
export type ExtensionKind = 'tool' | 'skill' | 'server';
export type ExtensionHealthStatus = 'unknown' | 'healthy' | 'degraded' | 'error';
export type ExtensionEntryKind = 'builtin-tool' | 'skill' | 'mcp-server';

export interface ExtensionEntry {
  kind: ExtensionEntryKind;
  path?: string;
  target: string;
}

export interface ExtensionDescriptor {
  manifestVersion: 1;
  id: string;
  name: string;
  source: ExtensionSource;
  kind: ExtensionKind;
  description: string;
  capabilities: string[];
  permissionProfile: string[];
  enabled: boolean;
  healthStatus: ExtensionHealthStatus;
  errorMessage?: string;
  updatedAt?: string;
  entry: ExtensionEntry;
  metadata?: Record<string, unknown>;
}

export interface ExtensionListResponse {
  extensions: ExtensionDescriptor[];
  total: number;
}
