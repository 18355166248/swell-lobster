export type SkillTrigger = 'manual' | 'llm_call';

export interface SkillDef {
  name: string;
  display_name: string;
  description: string;
  version: string;
  trigger: SkillTrigger;
  enabled: boolean;
  tags: string[];
  prompt_template: string;
  file_path: string;
  /** 来源：identity/skills（内置）或 data/skills（用户自定义） */
  source: 'builtin' | 'user';
}
