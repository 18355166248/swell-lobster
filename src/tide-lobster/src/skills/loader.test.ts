import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('assistant skill loader', () => {
  let repoRoot = '';

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'swell-skill-loader-test-'));
    mkdirSync(join(repoRoot, 'identity', 'skills', 'docx_report'), { recursive: true });
    mkdirSync(join(repoRoot, 'identity', 'skills', 'daily_summary'), { recursive: true });
    mkdirSync(join(repoRoot, 'data'), { recursive: true });
    writeFileSync(join(repoRoot, 'identity', 'assistant.md'), 'You are a test assistant.');
    writeFileSync(
      join(repoRoot, 'identity', 'skills', 'docx_report', 'SKILL.md'),
      [
        '---',
        'name: docx_report',
        'display_name: Word 报告生成',
        'description: 生成文档',
        'category: document',
        'tags: [文档]',
        '---',
        '',
        'Use docx_writer.',
      ].join('\n')
    );
    writeFileSync(
      join(repoRoot, 'identity', 'skills', 'daily_summary', 'SKILL.md'),
      [
        '---',
        'name: daily_summary',
        'display_name: 每日总结',
        'description: 默认分类测试',
        '---',
        '',
        'Summarize the day.',
      ].join('\n')
    );
    process.env.SWELL_PROJECT_ROOT = repoRoot;
    process.env.SWELL_DATA_DIR = join(repoRoot, 'data');
    process.env.SWELL_IDENTITY_DIR = join(repoRoot, 'identity');
    process.env.SWELL_GLOBAL_ENV_DIR = repoRoot;
    vi.resetModules();
  });

  afterEach(async () => {
    const { closeDb } = await import('../db/index.js');
    closeDb();
    rmSync(repoRoot, { recursive: true, force: true });
    delete process.env.SWELL_PROJECT_ROOT;
    delete process.env.SWELL_DATA_DIR;
    delete process.env.SWELL_IDENTITY_DIR;
    delete process.env.SWELL_GLOBAL_ENV_DIR;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('parses explicit categories and defaults missing ones to text', async () => {
    const { loadAllSkills } = await import('./loader.js');
    const skills = loadAllSkills();
    const byName = new Map(skills.map((skill) => [skill.name, skill]));

    expect(byName.get('docx_report')?.category).toBe('document');
    expect(byName.get('daily_summary')?.category).toBe('text');
  });
});
