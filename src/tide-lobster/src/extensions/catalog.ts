import { mcpManager } from '../mcp/manager.js';
import { mcpStore } from '../mcp/store.js';
import type { MCPServerConfig, MCPToolInfo } from '../mcp/types.js';
import { getSkill, loadAllSkills, setSkillEnabled } from '../skills/loader.js';
import type { SkillDef } from '../skills/types.js';
import { initializeBuiltinTools } from '../tools/index.js';
import { globalToolRegistry } from '../tools/registry.js';
import type { ToolDef } from '../tools/types.js';
import { healthStatusForMcpServer } from './lifecycle.js';
import {
  buildBuiltinExtensionId,
  buildBuiltinManifest,
  buildMcpExtensionId,
  buildMcpManifest,
  buildSkillExtensionId,
  buildSkillManifest,
} from './manifest.js';
import { ExtensionHealthStatus, ExtensionKind, ExtensionSource, type ExtensionDescriptor } from './types.js';

type ParsedExtensionId =
  | { source: 'builtin'; target: string }
  | { source: 'skill'; target: string }
  | { source: 'mcp'; target: string };

export class ExtensionCatalogError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

function parseExtensionId(id: string): ParsedExtensionId {
  if (id.startsWith('builtin:')) return { source: 'builtin', target: id.slice('builtin:'.length) };
  if (id.startsWith('skill:')) return { source: 'skill', target: id.slice('skill:'.length) };
  if (id.startsWith('mcp:')) return { source: 'mcp', target: id.slice('mcp:'.length) };
  throw new ExtensionCatalogError('invalid extension id', 400);
}

function isMcpTool(tool: ToolDef): boolean {
  return tool.name.startsWith('mcp_');
}

function toBuiltinDescriptor(tool: ToolDef): ExtensionDescriptor {
  return {
    ...buildBuiltinManifest(tool),
    kind: ExtensionKind.tool,
    enabled: true,
    healthStatus: ExtensionHealthStatus.healthy,
    metadata: {
      parameterCount: Object.keys(tool.parameters).length,
    },
  };
}

function toSkillDescriptor(skill: SkillDef): ExtensionDescriptor {
  return {
    ...buildSkillManifest(skill),
    kind: ExtensionKind.skill,
    enabled: skill.enabled,
    healthStatus: ExtensionHealthStatus.healthy,
    metadata: {
      source: skill.source,
      version: skill.version,
    },
  };
}

async function readMcpTools(server: MCPServerConfig): Promise<MCPToolInfo[]> {
  if (server.status !== 'running') return [];
  try {
    return await mcpManager.getTools(server.id);
  } catch {
    return [];
  }
}

async function toMcpDescriptor(server: MCPServerConfig): Promise<ExtensionDescriptor> {
  const tools = await readMcpTools(server);
  return {
    ...buildMcpManifest(server, tools),
    kind: ExtensionKind.server,
    enabled: server.enabled,
    healthStatus: healthStatusForMcpServer(server),
    errorMessage: server.error_message,
    updatedAt: server.updated_at,
    metadata: {
      registryId: server.registry_id ?? null,
      status: server.status,
      toolCount: tools.length,
      transport: server.type,
      url: server.url ?? null,
    },
  };
}

export class ExtensionCatalog {
  async listExtensions(): Promise<ExtensionDescriptor[]> {
    initializeBuiltinTools();

    const builtins = globalToolRegistry
      .listAll()
      .filter((tool) => !isMcpTool(tool))
      .map(toBuiltinDescriptor);
    const skills = loadAllSkills().map(toSkillDescriptor);
    const mcpDescriptors = await Promise.all(mcpStore.list().map((server) => toMcpDescriptor(server)));

    return [...builtins, ...skills, ...mcpDescriptors].sort((left, right) => {
      if (left.source !== right.source) return left.source.localeCompare(right.source);
      return left.name.localeCompare(right.name);
    });
  }

  async getExtension(id: string): Promise<ExtensionDescriptor | undefined> {
    const parsed = parseExtensionId(id);
    if (parsed.source === 'builtin') {
      initializeBuiltinTools();
      const tool = globalToolRegistry
        .listAll()
        .find((item) => !isMcpTool(item) && buildBuiltinExtensionId(item.name) === id);
      return tool ? toBuiltinDescriptor(tool) : undefined;
    }
    if (parsed.source === 'skill') {
      const skill = getSkill(parsed.target);
      return skill ? toSkillDescriptor(skill) : undefined;
    }
    const server = mcpStore.get(parsed.target);
    return server ? toMcpDescriptor(server) : undefined;
  }

  async setEnabled(id: string, enabled: boolean): Promise<ExtensionDescriptor> {
    const parsed = parseExtensionId(id);
    if (parsed.source === 'builtin') {
      throw new ExtensionCatalogError('builtin extensions cannot be toggled', 400);
    }
    if (parsed.source === 'skill') {
      const ok = setSkillEnabled(parsed.target, enabled);
      if (!ok) throw new ExtensionCatalogError('extension not found', 404);
      const skill = getSkill(parsed.target);
      if (!skill) throw new ExtensionCatalogError('extension not found', 404);
      return toSkillDescriptor(skill);
    }

    const server = mcpStore.get(parsed.target);
    if (!server) throw new ExtensionCatalogError('extension not found', 404);
    if (enabled) {
      const updated = mcpStore.update(parsed.target, { enabled: true });
      await mcpManager.startServer(updated);
    } else {
      await mcpManager.stopServer(parsed.target);
      mcpStore.update(parsed.target, { enabled: false });
    }
    return (await this.getExtension(id))!;
  }

  async reload(id: string): Promise<ExtensionDescriptor> {
    const parsed = parseExtensionId(id);
    if (parsed.source === 'builtin') {
      throw new ExtensionCatalogError('builtin extensions do not support reload', 400);
    }
    if (parsed.source === 'skill') {
      const skill = getSkill(parsed.target);
      if (!skill) throw new ExtensionCatalogError('extension not found', 404);
      return toSkillDescriptor(skill);
    }
    const server = mcpStore.get(parsed.target);
    if (!server) throw new ExtensionCatalogError('extension not found', 404);
    await mcpManager.reloadServer(parsed.target);
    return (await this.getExtension(id))!;
  }
}

export const extensionCatalog = new ExtensionCatalog();
