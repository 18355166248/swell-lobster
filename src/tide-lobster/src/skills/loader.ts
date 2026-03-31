/**
 * 助手技能加载与启用状态。
 *
 * - 从 `SKILLS/` 与 `data/skills/` 扫描子目录，每个子目录必须包含 `SKILL.md`。
 * - 禁用列表存 `key_value_store`，键为 `assistant-skills:disabled`，值为 JSON 字符串数组。
 * - 列表中的 `enabled` = 文件 frontmatter 未显式 `enabled: false` 且不在禁用集合中。
 */
import { existsSync, readdirSync, readFileSync, watch, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import { settings } from '../config.js';
import type { SkillDef, SkillParameter } from './types.js';
import { getDb } from '../db/index.js';

/** key_value_store 中存放禁用技能名集合的键 */
const DISABLED_KEY = 'assistant-skills:disabled';

/** 技能文件名（固定大写，参考 LobsterAI 约定） */
const SKILL_FILE_NAME = 'SKILL.md';

/** 防止重复启动目录监听器的标志，进程生命周期内只初始化一次 */
let watchersStarted = false;
/** 文件变更防抖定时器，100ms 内的多次变更合并为一次回调 */
let reloadTimer: NodeJS.Timeout | undefined;

/**
 * 从 key_value_store 读取禁用技能名集合。
 * 键不存在或 JSON 解析失败时均返回空集合，确保调用方始终能安全使用。
 */
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

/**
 * 将禁用集合持久化回 key_value_store。
 * 使用 INSERT ... ON CONFLICT DO UPDATE 实现 upsert，避免先查后写的竞态。
 */
function saveDisabledSet(disabled: Set<string>): void {
  getDb()
    .prepare(
      `INSERT INTO key_value_store (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(DISABLED_KEY, JSON.stringify([...disabled]));
}

/**
 * 扫描目录，返回所有包含 SKILL.md 的子目录路径列表。
 * 参考 LobsterAI skillManager.ts 的 listSkillDirs 实现。
 *
 * 目录不存在时返回空数组，不报错。
 */
function listSkillDirs(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(root, entry.name))
    .filter((dir) => existsSync(join(dir, SKILL_FILE_NAME)));
}

/**
 * 规范化 parameters 字段。
 *
 * frontmatter 中的 parameters 为任意 YAML 对象，此处做类型收窄：
 * - 非对象或空对象返回 undefined，触发调用方的 context 参数回退逻辑
 * - 每个参数必须有合法的 type（string / number / boolean），否则跳过
 */
function normalizeParameters(value: unknown): Record<string, SkillParameter> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;

  const entries = Object.entries(value as Record<string, unknown>)
    .map(([name, raw]) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
      const row = raw as Record<string, unknown>;
      const type = row.type;
      if (type !== 'string' && type !== 'number' && type !== 'boolean') return null;
      return [
        name,
        {
          type,
          description: String(row.description ?? ''),
          required: row.required === true,
        } satisfies SkillParameter,
      ] as const;
    })
    .filter(Boolean) as Array<readonly [string, SkillParameter]>;

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

/**
 * 解析单个 SKILL.md 文件，返回 SkillDef。
 *
 * gray-matter 将文件拆分为 frontmatter（data）和正文（content）：
 * - frontmatter 提供元数据（name、trigger、invocation_policy 等）
 * - 正文即 prompt_template，{{key}} 占位符在执行时替换为实际参数
 *
 * name 字段缺失时视为非法文件，返回 null。
 */
function parseSkillFile(filePath: string, source: 'builtin' | 'user'): SkillDef | null {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const { data, content: body } = matter(content);
    if (!data.name) return null;

    const tags = Array.isArray(data.tags) ? data.tags.map(String) : [];

    return {
      name: String(data.name),
      display_name: String(data.display_name ?? data.name),
      description: String(data.description ?? ''),
      version: String(data.version ?? '1.0.0'),
      // frontmatter 中 enabled 缺失时默认为 true；显式写 enabled: false 才禁用
      enabled: data.enabled !== false,
      tags,
      prompt_template: body.trim(),
      parameters: normalizeParameters(data.parameters),
      file_path: filePath,
      source,
    };
  } catch {
    // 文件读取或解析失败时静默跳过，不影响其他技能加载
    return null;
  }
}

/**
 * 扫描两个目录并返回所有技能列表，同时合并数据库中的禁用状态。
 *
 * 扫描规则（参考 LobsterAI 目录约定）：
 * - 每个技能是一个子目录，目录内必须包含 SKILL.md
 * - 扫描顺序（优先级由低到高）：
 *   1. SKILLS/ — 内置技能（source: 'builtin'）
 *   2. data/skills/ — 用户自定义技能（source: 'user'）
 * - 同名技能以后扫描到的为准（用户技能可覆盖内置技能）
 * - 目录不存在时跳过，不报错
 */
export function loadAllSkills(): SkillDef[] {
  const disabled = getDisabledSet();
  const dirs: Array<{ path: string; source: 'builtin' | 'user' }> = [
    { path: join(settings.projectRoot, 'SKILLS'), source: 'builtin' },
    { path: join(settings.projectRoot, 'data', 'skills'), source: 'user' },
  ];

  const skills: SkillDef[] = [];
  for (const { path: dir, source } of dirs) {
    for (const skillDir of listSkillDirs(dir)) {
      const skill = parseSkillFile(join(skillDir, SKILL_FILE_NAME), source);
      if (!skill) continue;
      skills.push({
        ...skill,
        // 文件 frontmatter 中 enabled=true 且不在禁用集合中，才视为启用
        enabled: skill.enabled && !disabled.has(skill.name),
      });
    }
  }
  return skills;
}

/** 按名称查找单个技能，找不到返回 undefined */
export function getSkill(name: string): SkillDef | undefined {
  return loadAllSkills().find((skill) => skill.name === name);
}

/**
 * 更新技能的启用状态并持久化到数据库。
 *
 * @returns false 表示技能不存在；true 表示操作成功
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
 * 直接修改技能文件的 frontmatter 字段（原地读写）。
 *
 * gray-matter stringify 会重新生成完整文件内容（frontmatter + 正文），
 * 适用于修改 display_name、description、invocation_policy 等元数据字段。
 *
 * @returns false 表示技能不存在或写入失败
 */
export function patchSkillFrontmatter(name: string, patch: Record<string, unknown>): boolean {
  const skill = getSkill(name);
  if (!skill) return false;
  try {
    const content = readFileSync(skill.file_path, 'utf-8');
    const parsed = matter(content);
    Object.assign(parsed.data, patch);
    const nextContent = matter.stringify(parsed.content, parsed.data);
    writeFileSync(skill.file_path, nextContent, 'utf-8');
    return true;
  } catch {
    return false;
  }
}

/**
 * 启动技能目录的文件监听器，技能文件变更时触发 onReload 回调。
 *
 * - 使用 persistent: false，不阻止进程退出
 * - 100ms 防抖：同一时刻多个文件变更（如批量保存）只触发一次回调
 * - 进程生命周期内只初始化一次（watchersStarted 标志防止重复注册）
 * - 监听目录本身（含子目录变更事件），SKILL.md 修改会触发父目录的 change 事件
 */
export function startSkillFileWatcher(onReload: () => void): void {
  if (watchersStarted) return;
  watchersStarted = true;

  const dirs = [
    join(settings.projectRoot, 'SKILLS'),
    join(settings.projectRoot, 'data', 'skills'),
  ];
  const triggerReload = () => {
    if (reloadTimer) clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      reloadTimer = undefined;
      onReload();
    }, 100);
  };

  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    watch(dir, { persistent: false, recursive: true }, (_eventType, filename) => {
      if (!filename || !String(filename).endsWith('SKILL.md')) return;
      triggerReload();
    });
  }
}
