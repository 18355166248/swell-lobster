/**
 * Skills 路由
 *
 * 两套技能系统：
 * 1. Claude Code 技能：~/.claude/skills/ 目录，SKILL.md，agent 工具
 * 2. 助手技能：identity/skills/ + data/skills/，用于 AI 助手执行的 prompt 模板
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { getDb } from '../../db/index.js';
import { loadAllSkills, getSkill, setSkillEnabled } from '../../skills/loader.js';
import { querySkillLogs } from '../../skills/logger.js';
import { executeSkill } from '../../skills/service.js';

export const skillsRouter = new Hono();

const SKILLS_DIR = join(homedir(), '.claude', 'skills');
const DISABLED_KEY = 'skills:disabled';

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

function parseSkillFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const result: Record<string, string> = {};
  let currentKey = '';
  let multilineValue = '';
  let inMultiline = false;

  for (const line of match[1].split('\n')) {
    if (inMultiline) {
      if (line.startsWith('  ') || line.startsWith('\t')) {
        multilineValue += ` ${line.trim()}`;
        continue;
      }
      result[currentKey] = multilineValue.trim();
      inMultiline = false;
    }

    const row = line.match(/^([\w-]+):\s*(.*)/);
    if (!row) continue;
    const key = row[1];
    const value = row[2].trim();
    if (value === '|' || value === '>') {
      currentKey = key;
      multilineValue = '';
      inMultiline = true;
    } else {
      result[key] = value;
    }
  }

  if (inMultiline && currentKey) {
    result[currentKey] = multilineValue.trim();
  }

  return result;
}

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
  const value = JSON.stringify([...disabled]);
  getDb()
    .prepare(
      `INSERT INTO key_value_store (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(DISABLED_KEY, value);
}

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
        name: meta.name || dir.name,
        description: meta.description || '',
        version: meta.version,
        category: meta.category || 'general',
        system: meta.system === 'true',
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

skillsRouter.get('/api/skills', (c) => {
  const disabled = getDisabledSet();
  const skills = scanSkills(disabled);
  return c.json({ skills, total: skills.length });
});

skillsRouter.post('/api/skills/toggle', async (c) => {
  const body = await c.req.json<{ skill_id?: string; enabled?: boolean }>();
  const skillId = body.skill_id?.trim();
  if (!skillId) return c.json({ detail: 'skill_id is required' }, 400);

  const skillPath = join(SKILLS_DIR, skillId, 'SKILL.md');
  if (!existsSync(skillPath)) return c.json({ detail: 'skill not found' }, 404);

  const disabled = getDisabledSet();
  if (body.enabled === false) disabled.add(skillId);
  else if (body.enabled === true) disabled.delete(skillId);
  else if (disabled.has(skillId)) disabled.delete(skillId);
  else disabled.add(skillId);

  saveDisabledSet(disabled);
  return c.json({ status: 'ok', skill_id: skillId, enabled: !disabled.has(skillId) });
});

skillsRouter.get('/api/assistant-skills', (c) => {
  const skills = loadAllSkills();
  return c.json({ skills, total: skills.length });
});

skillsRouter.get('/api/assistant-skill-logs', (c) => {
  const limit = Number(c.req.query('limit') ?? '50');
  const offset = Number(c.req.query('offset') ?? '0');
  const logs = querySkillLogs({ limit, offset });
  return c.json({ logs });
});

skillsRouter.get('/api/assistant-skills/:name/logs', (c) => {
  const name = c.req.param('name');
  const skill = getSkill(name);
  if (!skill) return c.json({ detail: 'skill not found' }, 404);

  const limit = Number(c.req.query('limit') ?? '50');
  const offset = Number(c.req.query('offset') ?? '0');
  const logs = querySkillLogs({ skillName: name, limit, offset });
  return c.json({ skill_name: name, logs });
});

skillsRouter.get('/api/assistant-skills/:name', (c) => {
  const name = c.req.param('name');
  const skill = getSkill(name);
  if (!skill) return c.json({ detail: 'skill not found' }, 404);
  return c.json(skill);
});

skillsRouter.post('/api/assistant-skills/:name/execute', async (c) => {
  const name = c.req.param('name');
  const body = await c.req.json<{ context?: string }>();
  try {
    const result = await executeSkill(name, body.context ?? '', { invokedBy: 'ui' });
    return c.json({ result });
  } catch (error) {
    return c.json({ detail: error instanceof Error ? error.message : String(error) }, 400);
  }
});

skillsRouter.patch('/api/assistant-skills/:name/enable', (c) => {
  const name = c.req.param('name');
  const ok = setSkillEnabled(name, true);
  if (!ok) return c.json({ detail: 'skill not found' }, 404);
  return c.json({ status: 'ok', name, enabled: true });
});

skillsRouter.patch('/api/assistant-skills/:name/disable', (c) => {
  const name = c.req.param('name');
  const ok = setSkillEnabled(name, false);
  if (!ok) return c.json({ detail: 'skill not found' }, 404);
  return c.json({ status: 'ok', name, enabled: false });
});
