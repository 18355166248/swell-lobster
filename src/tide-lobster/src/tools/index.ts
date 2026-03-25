import { getDatetimeTool } from './builtins/get_datetime.js';
import { readMemoryTool } from './builtins/read_memory.js';
import { searchWebTool } from './builtins/search_web.js';
import { sendStickerBqbTool } from './builtins/send_sticker_bqb.js';
import { writeMemoryTool } from './builtins/write_memory.js';
import { globalToolRegistry } from './registry.js';

let initialized = false;

export function initializeBuiltinTools(): void {
  if (initialized) return;
  initialized = true;

  // 启动期注册内置工具，后续 ChatService 只依赖统一注册表，不感知具体实现细节。
  globalToolRegistry.register(getDatetimeTool);
  globalToolRegistry.register(readMemoryTool);
  globalToolRegistry.register(writeMemoryTool);
  globalToolRegistry.register(searchWebTool);
  globalToolRegistry.register(sendStickerBqbTool);
}
