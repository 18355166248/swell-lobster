import type { MCPServerConfig, MCPToolInfo } from '../mcp/types.js';
import type { SkillDef } from '../skills/types.js';
import type { ToolDef, ToolPermissionMeta } from '../tools/types.js';
import { ExtensionEntryKind, ExtensionSource, type ExtensionManifest } from './types.js';

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function buildPermissionProfile(permission: ToolPermissionMeta): string[] {
  const values: string[] = [permission.riskLevel];
  if (permission.requiresApproval) values.push('approval');
  if (permission.pathScopes?.length) values.push('path');
  if (permission.networkScopes?.length) values.push('network');
  return unique(values);
}

export function buildBuiltinExtensionId(toolName: string): string {
  return `builtin:${toolName}`;
}

export function buildSkillExtensionId(skillName: string): string {
  return `skill:${skillName}`;
}

export function buildMcpExtensionId(serverId: string): string {
  return `mcp:${serverId}`;
}

export function buildBuiltinManifest(tool: ToolDef): ExtensionManifest {
  return {
    manifestVersion: 1,
    id: buildBuiltinExtensionId(tool.name),
    name: tool.name,
    source: ExtensionSource.builtin,
    description: tool.description,
    capabilities: [tool.name],
    permissionProfile: buildPermissionProfile(tool.permission),
    entry: {
      kind: ExtensionEntryKind.builtinTool,
      target: tool.name,
    },
  };
}

export function buildSkillManifest(skill: SkillDef): ExtensionManifest {
  return {
    manifestVersion: 1,
    id: buildSkillExtensionId(skill.name),
    name: skill.display_name,
    source: ExtensionSource.skill,
    description: skill.description,
    capabilities: unique(skill.tags.length > 0 ? skill.tags : ['skill']),
    permissionProfile: unique(['llm', 'prompt-template']),
    entry: {
      kind: ExtensionEntryKind.skill,
      target: skill.name,
      path: skill.file_path,
    },
  };
}

export function buildMcpManifest(
  server: MCPServerConfig,
  tools: MCPToolInfo[]
): ExtensionManifest {
  return {
    manifestVersion: 1,
    id: buildMcpExtensionId(server.id),
    name: server.name,
    source: ExtensionSource.mcp,
    description: server.registry_id
      ? `MCP server registered from ${server.registry_id}`
      : `MCP server via ${server.type} transport`,
    capabilities: unique(
      tools.length > 0 ? tools.map((tool) => tool.name) : [`transport:${server.type}`]
    ),
    permissionProfile: unique(
      server.type === 'stdio' ? ['execute', 'network', 'approval'] : ['network', 'approval']
    ),
    entry: {
      kind: ExtensionEntryKind.mcpServer,
      target: server.id,
    },
  };
}
