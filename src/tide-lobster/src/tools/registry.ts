import type { AnthropicTool, OpenAITool, ToolDef, ToolPermissionMeta } from './types.js';

function validatePermissionMeta(tool: ToolDef): ToolPermissionMeta {
  const permission = tool.permission;
  if (!permission) {
    throw new Error(`tool "${tool.name}" is missing permission metadata`);
  }
  if (!permission.sideEffectSummary?.trim()) {
    throw new Error(`tool "${tool.name}" is missing sideEffectSummary`);
  }
  return {
    ...permission,
    sideEffectSummary: permission.sideEffectSummary.trim(),
    pathScopes: permission.pathScopes?.map((scope) => scope.trim()).filter(Boolean),
    networkScopes: permission.networkScopes?.map((scope) => scope.trim()).filter(Boolean),
  };
}

function toJsonSchema(tool: ToolDef): OpenAITool['function']['parameters'] {
  const properties = Object.fromEntries(
    Object.entries(tool.parameters).map(([name, parameter]) => [
      name,
      {
        type: parameter.type,
        description: parameter.description,
        // Gemini function_declarations：enum 仅允许 string 类型属性
        ...(parameter.type === 'string' && parameter.enum?.length
          ? { enum: parameter.enum }
          : {}),
        // Gemini：array 必须带 items，否则 400（如 MCP 的 include_domains/exclude_domains）
        ...(parameter.type === 'array'
          ? { items: parameter.items ?? { type: 'string' } }
          : {}),
      },
    ])
  );
  const required = Object.entries(tool.parameters)
    .filter(([, parameter]) => parameter.required)
    .map(([name]) => name);

  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDef>();

  register(tool: ToolDef): void {
    this.tools.set(tool.name, {
      ...tool,
      permission: validatePermissionMeta(tool),
    });
  }

  unregister(name: string): void {
    this.tools.delete(name);
  }

  get(name: string): ToolDef | undefined {
    return this.tools.get(name);
  }

  listAll(excludeNames?: string[]): ToolDef[] {
    const excludes = new Set(excludeNames ?? []);
    return [...this.tools.values()].filter((tool) => !excludes.has(tool.name));
  }

  toOpenAIFormat(excludeNames?: string[]): OpenAITool[] {
    return this.listAll(excludeNames).map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: toJsonSchema(tool),
      },
    }));
  }

  toAnthropicFormat(excludeNames?: string[]): AnthropicTool[] {
    return this.listAll(excludeNames).map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: toJsonSchema(tool),
    }));
  }
}

export const globalToolRegistry = new ToolRegistry();
