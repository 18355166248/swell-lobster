/**
 * 将 MCP 工具桥接到应用内 `ToolDef`：名称形如 `mcp_<serverId>_<toolName>`，
 * 执行时转发 `callTool`，并把 content 块拼成字符串返回给 LLM。
 */

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { globalToolRegistry } from '../tools/registry.js';
import type { ToolDef, ToolParameter } from '../tools/types.js';
import type { MCPToolInfo } from './types.js';

/** MCP JSON Schema 子集 → 内置 tools 模块可识别的 parameters 描述 */
function toToolParameters(tool: MCPToolInfo): ToolDef['parameters'] {
  const properties = tool.inputSchema?.properties ?? {};
  const required = new Set(tool.inputSchema?.required ?? []);
  return Object.fromEntries(
    Object.entries(properties).map(([name, schema]) => {
      const type: ToolParameter['type'] =
        schema.type === 'number' ||
        schema.type === 'boolean' ||
        schema.type === 'object' ||
        schema.type === 'array'
          ? schema.type
          : 'string';
      // Gemini 等上游要求：JSON Schema 的 enum 只能出现在 string 类型上（否则会 400）
      const enumForSchema =
        type === 'string' && Array.isArray(schema.enum) ? schema.enum.map(String) : undefined;
      let description = String(schema.description ?? '');
      if (
        type !== 'string' &&
        Array.isArray(schema.enum) &&
        schema.enum.length > 0
      ) {
        description = `${description}\n允许取值: ${schema.enum.map(String).join(', ')}`.trim();
      }
      return [
        name,
        {
          type,
          description,
          ...(enumForSchema?.length ? { enum: enumForSchema } : {}),
          ...(required.has(name) ? { required: true } : {}),
        },
      ];
    })
  );
}

export class MCPToolBridge {
  /**
   * 将远端 MCP 服务器上的单条工具注册进全局 `globalToolRegistry`，供聊天/编排侧按名称调用。
   *
   * **命名**：`mcp_<serverId>_<mcpTool.name>`。`serverId` 用于区分多实例或同名工具，避免与内置工具或其它 MCP 冲突；
   * 真正发给 MCP 的仍是 `mcpTool.name`（见下方 `callTool`）。
   *
   * **参数**：`toToolParameters` 把 MCP 的 `inputSchema` 转成内部 `ToolDef['parameters']`，与 LLM 工具调用约定对齐。
   *
   * **执行**：`execute` 闭包捕获当前 `client`，调用 `client.callTool`；返回的 `result.content` 是 MCP 规范中的
   * ContentBlock 数组（常见为 `{ type: 'text', text }` 等）。此处将各块展平为可读字符串：`text` 取 `text` 字段，
   * 其它类型序列化为 JSON；空块过滤后按换行拼接，作为工具输出交给上层（最终进入 LLM 上下文）。
   */
  registerMCPTool(serverId: string, mcpTool: MCPToolInfo, client: Client): void {
    // 对外暴露给 LLM/注册表的唯一名称（含 server 前缀，unregister 时按前缀批量清理）
    const toolName = `mcp_${serverId}_${mcpTool.name}`;
    const toolDef: ToolDef = {
      name: toolName,
      // 前缀 [MCP] 便于在工具列表里识别来源；缺省时用工具名兜底
      description: `[MCP] ${mcpTool.description ?? mcpTool.name}`,
      parameters: toToolParameters(mcpTool),
      async execute(args) {
        // 协议层仍使用 MCP 侧原始工具名，与注册表里的桥接名不同
        const result = await client.callTool({
          name: mcpTool.name,
          arguments: args,
        });
        const content = Array.isArray(result.content) ? result.content : [];
        return content
          .map((item) => {
            if (!item || typeof item !== 'object') return '';
            const row = item as Record<string, unknown>;
            // text 块直接取正文；图片/资源等非常规块用 JSON 字符串化，避免丢信息
            return row.type === 'text' ? String(row.text ?? '') : JSON.stringify(row);
          })
          .filter(Boolean)
          .join('\n');
      },
    };
    globalToolRegistry.register(toolDef);
  }

  /** 移除该 server 前缀下的全部桥接工具（停止或重载前调用） */
  unregisterMCPTools(serverId: string): void {
    const prefix = `mcp_${serverId}_`;
    globalToolRegistry
      .listAll()
      .filter((tool) => tool.name.startsWith(prefix))
      .forEach((tool) => globalToolRegistry.unregister(tool.name));
  }
}

export const mcpToolBridge = new MCPToolBridge();
