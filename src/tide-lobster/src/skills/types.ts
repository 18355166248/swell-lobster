/**
 * 助手技能（Markdown + frontmatter）类型定义。
 *
 * 与 Claude Code 的 `~/.claude/skills` 不同：本结构用于“在应用内用默认 LLM 执行模板”，
 * 见 `loader.ts` / `service.ts` 与 `/api/assistant-skills/*`。
 */

export interface SkillParameter {
  type: 'string' | 'number' | 'boolean';
  description: string;
  required?: boolean;
}

/** 扫描磁盘后的内存表示；`enabled` 会与 KV 中禁用集合合并 */
export interface SkillDef {
  name: string;
  display_name: string;
  description: string;
  version: string;
  enabled: boolean;
  tags: string[];
  /** 正文；`executeSkill` 会将模板占位符替换为传入参数 */
  prompt_template: string;
  parameters?: Record<string, SkillParameter>;
  file_path: string;
  source: 'builtin' | 'user';
}
