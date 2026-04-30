import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('ChatService template prompts', () => {
  let repoRoot = '';

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'swell-chat-template-test-'));
    mkdirSync(join(repoRoot, 'identity'), { recursive: true });
    mkdirSync(join(repoRoot, 'data', 'agent-templates'), { recursive: true });
    writeFileSync(join(repoRoot, 'identity', 'assistant.md'), 'You are a test assistant.');
    writeFileSync(
      join(repoRoot, 'data', 'agent-templates', 'researcher.json'),
      JSON.stringify(
        {
          id: 'researcher',
          name: 'Researcher',
          category: 'research',
          systemPrompt: 'Always think like a careful researcher.',
        },
        null,
        2
      )
    );
    process.env.SWELL_PROJECT_ROOT = repoRoot;
    process.env.SWELL_DATA_DIR = join(repoRoot, 'data');
    process.env.SWELL_IDENTITY_DIR = join(repoRoot, 'identity');
    vi.resetModules();
  });

  afterEach(() => {
    try {
      rmSync(repoRoot, { recursive: true, force: true });
    } catch {
      // ignore locked files on Windows
    }
    delete process.env.SWELL_PROJECT_ROOT;
    delete process.env.SWELL_DATA_DIR;
    delete process.env.SWELL_IDENTITY_DIR;
    vi.resetModules();
  });

  it('injects the selected template prompt into the system prompt', async () => {
    const { ChatService } = await import('./service.js');
    const service = new ChatService(repoRoot);
    const session = service.createSession(
      null,
      join(repoRoot, 'identity', 'assistant.md'),
      'researcher'
    );

    const prompt = (service as unknown as { buildSystemPrompt: (session: unknown, message: string) => string })
      .buildSystemPrompt(session, '帮我分析这个项目的风险');

    expect(prompt).toContain('Always think like a careful researcher.');
    expect(prompt).toContain('当前时间：');
  });

  it('restores template prompts from persisted sessions after service restart', async () => {
    const { ChatService } = await import('./service.js');
    const first = new ChatService(repoRoot);
    const created = first.createSession(
      null,
      join(repoRoot, 'identity', 'assistant.md'),
      'researcher'
    );

    const second = new ChatService(repoRoot);
    const restored = second.getSession(created.id);
    expect(restored?.template_id).toBe('researcher');

    const prompt = (second as unknown as { buildSystemPrompt: (session: unknown, message: string) => string })
      .buildSystemPrompt(restored, '再给我一个研究视角');

    expect(prompt).toContain('Always think like a careful researcher.');
  });
});
