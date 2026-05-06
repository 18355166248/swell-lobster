import { mcpStore } from '../mcp/store.js';
import { globalToolRegistry } from '../tools/registry.js';
import { buildBuiltinExtensionId, buildMcpExtensionId } from './manifest.js';
import { ExtensionSource } from './types.js';

/** 与 mcp/toolBridge 对齐的工具名 sanitize：仅保留字母数字下划线 */
function sanitizeToolName(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_]/g, '_');
}

/**
 * 反查注册表里某个工具调用属于哪个扩展，用于审计补 source 字段。
 *
 * 单独成文件而不放进 catalog.ts，是为了避开「chat/service → extensions/catalog → tools/index
 * → delegate_task → agents/delegateService → chat/index → chat/service」的 ESM 循环：
 * 本模块只依赖 globalToolRegistry / mcpStore / manifest / types，不会拉起 builtin 注册链。
 *
 * 调用方在工具刚执行完之后才会调到这里，此时 builtin 工具早已 register 完毕，
 * 不需要再调 initializeBuiltinTools()。
 */
export function resolveToolSource(
  toolName: string
): { source: ExtensionSource; extensionId: string } | null {
  if (!toolName) return null;

  if (toolName.startsWith('mcp_')) {
    for (const server of mcpStore.list()) {
      const prefix = sanitizeToolName(`mcp_${server.id}_`);
      if (toolName.startsWith(prefix)) {
        return { source: ExtensionSource.mcp, extensionId: buildMcpExtensionId(server.id) };
      }
    }
    return { source: ExtensionSource.mcp, extensionId: '' };
  }

  const builtin = globalToolRegistry.listAll().find((tool) => tool.name === toolName);
  if (builtin) {
    return { source: ExtensionSource.builtin, extensionId: buildBuiltinExtensionId(toolName) };
  }
  return null;
}
