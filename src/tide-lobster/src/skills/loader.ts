/**
 * 助手技能加载与启用状态。
 *
 * - 从 `identity/skills` 与 `data/skills` 扫描 `*.md`，用 gray-matter 解析 YAML + 正文。
 * - 禁用列表存 `key_value_store`，键为 `assistant-skills:disabled`，值为 JSON 字符串数组（被禁用的 `name`）。
 * - 列表中的 `enabled` = 文件 frontmatter 未显式 `enabled: false` 且不在禁用集合中。
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import { settings } from '../config.js';
import type { SkillDef, SkillTrigger } from './types.js';
import { getDb } from '../db/index.js';

/** 与 `skills.ts` 路由中助手技能禁用逻辑对应的 KV 键 */
const DISABLED_KEY = 'assistant-skills:disabled';

/** 读出当前禁用技能名集合；损坏时返回空集，避免整站不可用 */
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

/** 持久化禁用集合（覆盖写） */
function saveDisabledSet(disabled: Set<string>): void {
  getDb()
    .prepare(
      `INSERT INTO key_value_store (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(DISABLED_KEY, JSON.stringify([...disabled]));
}

/** 单文件解析；缺少 `name` 或读失败时返回 null，调用方跳过 */
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

/** 合并两目录扫描结果，并按禁用集合覆盖各技能的 `enabled` 字段 */
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

/** 按唯一 `name` 查找；内部会重新 `loadAllSkills`，适合低频调用 */
export function getSkill(name: string): SkillDef | undefined {
  return loadAllSkills().find((s) => s.name === name);
}

/**
 * 在 KV 中记录禁用/启用；不改变 Markdown 文件本身。
 * 若技能不存在返回 false。
 */
export function setSkillEnabled(name: string, enabled: boolean): boolean {
  const skill = getSkill(name);
  if (!skill) return false;
  const disabled = getDisabledSet();
  if (enabled) disabled.delete(name);
  else disabled.add(name);
  saveDisabledSet(disabled);
  return true;
}

/**
 * 直接修改技能文件 YAML frontmatter（如更新版本、描述）。
 * 与 `setSkillEnabled` 不同：会写回磁盘，慎用并发编辑。
 */
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
