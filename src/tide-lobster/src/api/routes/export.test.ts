import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('export/session exporter', () => {
  let repoRoot = '';

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'swell-export-route-test-'));
    mkdirSync(join(repoRoot, 'identity'), { recursive: true });
    mkdirSync(join(repoRoot, 'data'), { recursive: true });
    writeFileSync(join(repoRoot, 'identity', 'assistant.md'), 'You are a test assistant.');
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

  it('exports markdown with normalized filename', async () => {
    const { ChatStore } = await import('../../chat/chatStore.js');
    const { exportMarkdown, getExportFilename } = await import('../../export/sessionExporter.js');

    const store = new ChatStore();
    const session = store.createSession('default');
    store.updateSession(session.id, { title: '周末复盘 / May 2026' });
    store.appendUserMessage({ sessionId: session.id, userContent: '整理主干稳定性任务' });
    store.appendAssistantMessage({ sessionId: session.id, assistantContent: '已记录并拆解。' });

    const filename = getExportFilename(session.id, 'md');
    const content = exportMarkdown(session.id);
    expect(filename).toBe(`周末复盘-May-2026-${session.id}.md`);
    expect(content).toContain('# 周末复盘 / May 2026');
    expect(content).toContain('整理主干稳定性任务');
  });

  it('exports json payload for existing session', async () => {
    const { ChatStore } = await import('../../chat/chatStore.js');
    const { exportJson, getExportFilename } = await import('../../export/sessionExporter.js');

    const store = new ChatStore();
    const session = store.createSession('default');
    store.appendAssistantMessage({ sessionId: session.id, assistantContent: 'hello export' });

    const filename = getExportFilename(session.id, 'json');
    const payload = JSON.parse(exportJson(session.id)) as {
      id: string;
      messages: Array<{ content: string }>;
    };
    expect(filename).toBe(`新对话-${session.id}.json`);
    expect(payload.id).toBe(session.id);
    expect(payload.messages.at(-1)?.content).toBe('hello export');
  });

  it('rejects unsupported export format with 400', async () => {
    const { createApp } = await import('../server.js');
    const app = createApp();
    const response = await app.request('/api/export/session/demo?format=csv');
    expect(response.status).toBe(400);
  });
});
