/**
 * 助手技能（Markdown + frontmatter）类型定义。
 *
 * 与 Claude Code 的 `~/.claude/skills` 不同：本结构用于「在应用内用默认 LLM 执行模板」，
 * 见 `loader.ts` / `service.ts` 与 `/api/assistant-skills/*`。
 */

/** `manual`：仅 HTTP 触发；`llm_call` 预留由对话内调度使用 */
export type SkillTrigger = 'manual' | 'llm_call';

/** 扫描磁盘后的内存表示；`enabled` 会与 KV 中禁用集合合并 */
export interface SkillDef {
  name: string;
  display_name: string;
  description: string;
  version: string;
  trigger: SkillTrigger;
  enabled: boolean;
  tags: string[];
  /** 正文；`executeSkill` 会将 `{{context}}` 替换为请求体传入的上下文 */
  prompt_template: string;
  source: 'builtin' | 'user';
