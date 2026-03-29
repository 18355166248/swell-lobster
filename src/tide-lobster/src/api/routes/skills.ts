/**
 * Skills 路由
 *
 * 扫描 ~/.claude/skills/ 目录，读取 SKILL.md frontmatter，
 * 支持通过 key_value_store 持久化启用/禁用状态。
 *
 * 与「文件系统真实技能」分离：禁用只影响本应用展示/策略，不删除磁盘上的 SKILL.md。
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { getDb } from '../../db/index.js';

export const skillsRouter = new Hono();

/** Claude 技能根目录：每个子目录若含 SKILL.md 则视为一个技能 */
const SKILLS_DIR = join(homedir(), '.claude', 'skills');
/** key_value_store 中存储「已禁用 skill_id 列表」JSON 数组的键名 */
const DISABLED_KEY = 'skills:disabled';

/** 列表 API 返回的单个技能元数据（含扫描路径与当前启用状态） */
type SkillMeta = {
  skill_id: string;
  name: string;
  description: string;
  version?: string;
  category: string;
  system: boolean;
  enabled: boolean;
  path: string;
};

/**
 * 解析 YAML frontmatter（首段 --- ... ---），提取键值对。
 * 支持多行块（`| ` 或 `> ` 后的缩进行合并为一行 description 等），与常见 SKILL.md 写法兼容。
 */
function parseSkillFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const result: Record<string, string> = {};
  let currentKey = '';
  let multilineValue = '';
  let inMultiline = false;

  for (const line of match[1].split('\n')) {
    if (inMultiline) {
      // YAML 多行标量：后续缩进行属于同一段内容
      if (line.startsWith('  ') || line.startsWith('\t')) {
        multilineValue += ' ' + line.trim();
        continue;
      } else {
        result[currentKey] = multilineValue.trim();
        inMultiline = false;
      }
    }
    const m = line.match(/^([\w-]+):\s*(.*)/);
    if (!m) continue;
    const key = m[1];
    const val = m[2].trim();
    // `key: |` 或 `key: >` 表示后续缩进行为多行值
    if (val === '|' || val === '>') {
      currentKey = key;
      multilineValue = '';
      inMultiline = true;
    } else {
      result[key] = val;
    }
  }
  if (inMultiline && currentKey) {
    result[currentKey] = multilineValue.trim();
  }
  return result;
}

/** 从 SQLite 读出已禁用的 skill_id 集合；键不存在或 JSON 损坏时视为空集 */
function getDisabledSet(): Set<string> {
  const db = getDb();
  const row = db
    .prepare(`SELECT value FROM key_value_store WHERE key = ?`)
    .get(DISABLED_KEY) as { value: string } | undefined;
  if (!row) return new Set();
  try {
    return new Set(JSON.parse(row.value) as string[]);
  } catch {
    return new Set();
  }
}

/** 将禁用列表写回 key_value_store；已存在则 UPDATE（UPSERT） */
function saveDisabledSet(disabled: Set<string>): void {
  const db = getDb();
  const value = JSON.stringify([...disabled]);
  db.prepare(
    `INSERT INTO key_value_store (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(DISABLED_KEY, value);
}

/**
 * 遍历技能目录：每个子目录若存在 SKILL.md 则解析 frontmatter 并合并启用状态。
 * 排序：启用的在前；同组内按 name 字典序。
 */
function scanSkills(disabled: Set<string>): SkillMeta[] {
  if (!existsSync(SKILLS_DIR)) return [];
  const skills: SkillMeta[] = [];
  for (const dir of readdirSync(SKILLS_DIR, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const skillPath = join(SKILLS_DIR, dir.name, 'SKILL.md');
    if (!existsSync(skillPath)) continue;
    try {
      const content = readFileSync(skillPath, 'utf-8');
      const meta = parseSkillFrontmatter(content);
      skills.push({
        skill_id: dir.name,
        name: meta['name'] || dir.name,
        description: meta['description'] || '',
        version: meta['version'],
        category: meta['category'] || 'general',
        system: meta['system'] === 'true',
        enabled: !disabled.has(dir.name),
        path: skillPath,
      });
    } catch {
      // skip unreadable skills
    }
  }
  return skills.sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/** GET：扫描磁盘 + 合并 DB 中的禁用状态，返回完整列表 */
skillsRouter.get('/api/skills', (c) => {
  const disabled = getDisabledSet();
  const skills = scanSkills(disabled);
  return c.json({ skills, total: skills.length });
});

/**
 * POST：设置某个技能的启用/禁用，或省略 enabled 时做切换（toggle）。
 * 若 skill_id 对应目录下无 SKILL.md 则 404，避免误写 DB。
 */
skillsRouter.post('/api/skills/toggle', async (c) => {
  const body = await c.req.json<{ skill_id?: string; enabled?: boolean }>();
  const skillId = body.skill_id?.trim();
  if (!skillId) return c.json({ detail: 'skill_id is required' }, 400);

  const skillPath = join(SKILLS_DIR, skillId, 'SKILL.md');
  if (!existsSync(skillPath)) return c.json({ detail: 'skill not found' }, 404);

  const disabled = getDisabledSet();
  if (body.enabled === false) {
    disabled.add(skillId);
  } else if (body.enabled === true) {
    disabled.delete(skillId);
  } else {
    // toggle
    // 未传 enabled：在集合中则启用（移除），否则禁用（加入）
    if (disabled.has(skillId)) disabled.delete(skillId);
    else disabled.add(skillId);
  }
  saveDisabledSet(disabled);
  return c.json({ status: 'ok', skill_id: skillId, enabled: !disabled.has(skillId) });
});
