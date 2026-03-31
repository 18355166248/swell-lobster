/**
 * 技能 ↔ 工具注册表同步。
 *
 * 每次调用先清除所有 skill_ 前缀的工具，再将当前已启用且 invocation_policy
 * 允许 LLM 调用的技能重新注册，保证注册表与磁盘状态一致。
 *
 * 调用时机：
 * - 服务启动时（index.ts）
 * - 技能启用 / 禁用操作后（skills 路由的 enable / disable 接口）
 * - 技能文件变更（startSkillFileWatcher 回调）
 */
import { globalToolRegistry } from '../tools/registry.js';
import { loadAllSkills } from './loader.js';
import { skillDefToToolDef, SKILL_TOOL_PREFIX } from './skillTool.js';

/**
 * 将磁盘上的技能状态同步到 globalToolRegistry。
 *
 * 采用"全量清除再重建"而非增量 diff，实现简单且幂等：
 * 无论调用多少次，最终注册表内容都与当前磁盘状态一致。
 */
export function syncSkillsToToolRegistry(): void {
  // 先移除所有已注册的技能工具，避免残留已删除或已改名的技能
  for (const tool of globalToolRegistry.listAll()) {
    if (tool.name.startsWith(SKILL_TOOL_PREFIX)) {
      globalToolRegistry.unregister(tool.name);
    }
  }

  // 只注册满足以下条件的技能：
  // 1. enabled = true（未被 UI 禁用）
  // 2. invocation_policy 为 llm_only 或 both（允许 LLM 自动调用）
  // user_only 的技能不注册为工具，LLM 无法感知其存在
  const skills = loadAllSkills().filter(
    (skill) =>
      skill.enabled &&
      (skill.invocation_policy === 'llm_only' || skill.invocation_policy === 'both')
  );

  for (const skill of skills) {
    const tool = skillDefToToolDef(skill);
    globalToolRegistry.register(tool);
    console.log(`[skills] registered tool: ${tool.name}`);
  }
}
