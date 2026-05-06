import {
  ExtensionHealthStatus,
  type ExtensionHealthStatus as ExtensionHealthStatusValue,
} from './types.js';
import type { MCPServerConfig } from '../mcp/types.js';

export function healthStatusForMcpServer(
  server: Pick<MCPServerConfig, 'enabled' | 'status'>
): ExtensionHealthStatusValue {
  if (!server.enabled) return ExtensionHealthStatus.unknown;
  if (server.status === 'running') return ExtensionHealthStatus.healthy;
  if (server.status === 'error') return ExtensionHealthStatus.error;
  return ExtensionHealthStatus.degraded;
}
