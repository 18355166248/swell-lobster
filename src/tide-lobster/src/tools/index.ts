import { deleteMemoryTool } from './builtins/delete_memory.js';
import { readMemoryTool } from './builtins/read_memory.js';
import { readSkillTool } from './builtins/read_skill.js';
import { runScriptTool } from './builtins/run_script.js';
import { writeMemoryTool } from './builtins/write_memory.js';
import { readFileTool } from './builtins/read_file.js';
import { globalToolRegistry } from './registry.js';

let initialized = false;

export function initializeBuiltinTools(): void {
  if (initialized) return;
  initialized = true;

  // 启动期注册内置工具，后续 ChatService 只依赖统一注册表，不感知具体实现细节。
  globalToolRegistry.register(readMemoryTool);
  globalToolRegistry.register(writeMemoryTool);
  globalToolRegistry.register(deleteMemoryTool);
  globalToolRegistry.register(readSkillTool);
  globalToolRegistry.register(runScriptTool);
  globalToolRegistry.register(readFileTool);
}
