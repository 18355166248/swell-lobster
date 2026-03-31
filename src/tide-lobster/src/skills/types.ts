/**
 * 助手技能（Markdown + frontmatter）类型定义。
 *
 * 与 Claude Code 的 `~/.claude/skills` 不同：本结构用于“在应用内用默认 LLM 执行模板”，
 * 见 `loader.ts` / `service.ts` 与 `/api/assistant-skills/*`。
 */

/** `manual`：仅 HTTP 触发；`llm_call`：可被对话内 function calling 调用 */
export type SkillTrigger = 'manual' | 'llm_call';

/**
 * 调用权限策略：
 * - user_only: 仅允许 UI 手动执行
 * - llm_only: 仅允许 LLM 自动调用
 * - both: 手动和自动都允许
 */
export type SkillInvocationPolicy = 'user_only' | 'llm_only' | 'both';

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
  trigger: SkillTrigger;
  enabled: boolean;
  tags: string[];
  /** 正文；`executeSkill` 会将模板占位符替换为传入参数 */
  prompt_template: string;
  invocation_policy: SkillInvocationPolicy;
  parameters?: Record<string, SkillParameter>;
  file_path: string;
  source: 'builtin' | 'user';
}
