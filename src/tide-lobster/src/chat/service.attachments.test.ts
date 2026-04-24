import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('chat attachment helpers', () => {
  let repoRoot = '';

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'swell-chat-test-'));
    mkdirSync(join(repoRoot, 'identity'), { recursive: true });
    writeFileSync(join(repoRoot, 'identity', 'assistant.md'), 'You are a test assistant.');
    process.env.SWELL_PROJECT_ROOT = repoRoot;
    process.env.SWELL_DATA_DIR = join(repoRoot, 'data');
    process.env.SWELL_IDENTITY_DIR = join(repoRoot, 'identity');
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
    delete process.env.SWELL_PROJECT_ROOT;
    delete process.env.SWELL_DATA_DIR;
    delete process.env.SWELL_IDENTITY_DIR;
    vi.resetModules();
  });

  it('builds read_file hints for uploaded files', async () => {
    const { buildReadableAttachmentHint } = await import('./attachments.js');

    const hint = buildReadableAttachmentHint(repoRoot, [
      {
        kind: 'file',
        filename: 'note.md',
        mimeType: 'text/markdown',
      },
    ]);

    expect(hint).toContain('read_file');
    expect(hint).toContain(join(repoRoot, 'data', 'tmp', 'uploads', 'note.md'));
  });

  it('replays historical image attachments as multimodal user content', async () => {
    const uploadsDir = join(repoRoot, 'data', 'tmp', 'uploads');
    mkdirSync(uploadsDir, { recursive: true });
    writeFileSync(join(uploadsDir, 'image.png'), Buffer.from([1, 2, 3, 4]));

    const { toLLMMessages } = await import('./attachments.js');

    const messages = toLLMMessages(repoRoot, [
      {
        role: 'user',
        content: '',
        attachments: [
          {
            kind: 'image',
            filename: 'image.png',
            mimeType: 'image/png',
          },
        ],
      },
      {
        role: 'assistant',
        content: 'ok',
      },
      {
        role: 'user',
        content: '继续看看这张图',
      },
    ]);

    expect(Array.isArray(messages[0]?.content)).toBe(true);
    const parts = messages[0]?.content as Array<{ type: string; base64?: string }>;
    expect(parts.some((part) => part.type === 'image')).toBe(true);
    expect(parts.find((part) => part.type === 'image')?.base64).toBe(
      Buffer.from([1, 2, 3, 4]).toString('base64')
    );
  });
});
