export const ExtensionSource = {
  builtin: 'builtin',
  skill: 'skill',
  mcp: 'mcp',
} as const;

export type ExtensionSource = (typeof ExtensionSource)[keyof typeof ExtensionSource];

export const ExtensionKind = {
  tool: 'tool',
  skill: 'skill',
  server: 'server',
} as const;

export type ExtensionKind = (typeof ExtensionKind)[keyof typeof ExtensionKind];

export const ExtensionHealthStatus = {
  unknown: 'unknown',
  healthy: 'healthy',
  degraded: 'degraded',
  error: 'error',
} as const;

export type ExtensionHealthStatus =
  (typeof ExtensionHealthStatus)[keyof typeof ExtensionHealthStatus];

export const ExtensionEntryKind = {
  builtinTool: 'builtin-tool',
  skill: 'skill',
  mcpServer: 'mcp-server',
} as const;

export type ExtensionEntryKind = (typeof ExtensionEntryKind)[keyof typeof ExtensionEntryKind];

export interface ExtensionEntry {
  kind: ExtensionEntryKind;
  path?: string;
  target: string;
}

export interface ExtensionManifest {
  manifestVersion: 1;
  id: string;
  name: string;
  source: ExtensionSource;
  description: string;
  capabilities: string[];
  permissionProfile: string[];
  entry: ExtensionEntry;
}

export interface ExtensionDescriptor extends ExtensionManifest {
  kind: ExtensionKind;
  enabled: boolean;
  healthStatus: ExtensionHealthStatus;
  errorMessage?: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
}
