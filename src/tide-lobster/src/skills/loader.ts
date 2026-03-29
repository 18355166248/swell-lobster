import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import { settings } from '../config.js';
import type { SkillDef, SkillTrigger } from './types.js';
import { getDb } from '../db/index.js';

const DISABLED_KEY = 'assistant-skills:disabled';

function getDisabledSet(): Set<string> {
  const row = getDb()
    .prepare(`SELECT value FROM key_value_store WHERE key = ?`)
    .get(DISABLED_KEY) as { value: string } | undefined;
  if (!row) return new Set();
  try {
    return new Set(JSON.parse(row.value) as string[]);
  } catch {
    return new Set();
  }
}

function saveDisabledSet(disabled: Set<string>): void {
  getDb()
    .prepare(
      `INSERT INTO key_value_store (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(DISABLED_KEY, JSON.stringify([...disabled]));
}

function parseSkillFile(filePath: string, source: 'builtin' | 'user'): SkillDef | null {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const { data, content: body } = matter(content);
    if (!data.name) return null;

    const tags = Array.isArray(data.tags) ? (data.tags as string[]) : [];

    return {
      name: String(data.name),
      display_name: String(data.display_name ?? data.name),
      description: String(data.description ?? ''),
      version: String(data.version ?? '1.0.0'),
      trigger: (data.trigger as SkillTrigger) ?? 'manual',
      enabled: data.enabled !== false,
      tags,
      prompt_template: body.trim(),
      file_path: filePath,
      source,
    };
  } catch {
    return null;
  }
}

/** 扫描内置和用户技能目录，合并 DB 中的禁用状态 */
export function loadAllSkills(): SkillDef[] {
  const disabled = getDisabledSet();
  const dirs: Array<{ path: string; source: 'builtin' | 'user' }> = [
    { path: join(settings.identityDir, 'skills'), source: 'builtin' },
    { path: join(settings.projectRoot, 'data', 'skills'), source: 'user' },
  ];

  const skills: SkillDef[] = [];
  for (const { path: dir, source } of dirs) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
      const skill = parseSkillFile(join(dir, file), source);
      if (!skill) continue;
      skills.push({ ...skill, enabled: !disabled.has(skill.name) });
    }
  }
  return skills;
}

export function getSkill(name: string): SkillDef | undefined {
  return loadAllSkills().find((s) => s.name === name);
}

export function setSkillEnabled(name: string, enabled: boolean): boolean {
  const skill = getSkill(name);
  if (!skill) return false;
  const disabled = getDisabledSet();
  if (enabled) disabled.delete(name);
  else disabled.add(name);
  saveDisabledSet(disabled);
  return true;
}

/** 将 enabled 状态写回 frontmatter（修改磁盘文件） */
export function patchSkillFrontmatter(name: string, patch: Record<string, unknown>): boolean {
  const skill = getSkill(name);
  if (!skill) return false;
  try {
    const content = readFileSync(skill.file_path, 'utf-8');
    const parsed = matter(content);
    Object.assign(parsed.data, patch);
    const newContent = matter.stringify(parsed.content, parsed.data);
    writeFileSync(skill.file_path, newContent, 'utf-8');
    return true;
  } catch {
    return false;
  }
}
