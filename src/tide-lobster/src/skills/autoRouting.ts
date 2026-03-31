import { join } from 'node:path';
import { settings } from '../config.js';
import { loadAllSkills } from './loader.js';

/**
 * 构建 LobsterAI 风格的 skills auto-routing 片段，注入 system prompt。
 *
 * 列出所有已启用技能的 id、名称、描述和 SKILL.md 文件路径。
 * LLM 通过扫描 description 决定是否调用某个技能，再用 read_skill 工具读取完整内容执行。
 * 每次 chat 请求动态调用，无缓存，启用/禁用变更立即生效。
 */
export function buildSkillsAutoRoutingPrompt(): string {
  const skills = loadAllSkills().filter((s) => s.enabled);
  if (skills.length === 0) return '';

  const entries = skills
    .map((s) => {
      const desc = s.description
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return [
        `  <skill>`,
        `    <id>${s.name}</id>`,
        `    <name>${s.display_name}</name>`,
        `    <description>${desc}</description>`,
        `    <location>${s.file_path}</location>`,
        `  </skill>`,
      ].join('\n');
    })
    .join('\n');

  return [
    `## Skills (mandatory)`,
    `Before replying: scan <available_skills> <description> entries.`,
    `- If exactly one skill clearly applies: read its SKILL.md at <location> with the read_skill tool, then follow it.`,
    `- If no skill clearly applies: answer directly.`,
    `<available_skills>`,
    entries,
    `</available_skills>`,
  ].join('\n');
}
