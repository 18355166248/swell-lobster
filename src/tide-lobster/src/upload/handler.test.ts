import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('handleAttachmentUpload', () => {
  let repoRoot = '';

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'swell-upload-test-'));
    mkdirSync(join(repoRoot, 'identity'), { recursive: true });
    writeFileSync(join(repoRoot, 'identity', 'assistant.md'), 'test');
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

  it('stores image uploads with base64 preview payload', async () => {
    const { handleAttachmentUpload } = await import('./handler.js');
    const formData = new FormData();
    const bytes = new Uint8Array([137, 80, 78, 71]);
    formData.append('file', new File([bytes], 'sample.png', { type: 'image/png' }));

    const result = await handleAttachmentUpload(formData);

    expect(result.kind).toBe('image');
    expect(result.mimeType).toBe('image/png');
    expect(result.base64).toBe(Buffer.from(bytes).toString('base64'));
    expect(result.previewUrl).toBe(`/api/uploads/${result.filename}`);
  });

  it('stores text-like files without forcing base64 into chat payload', async () => {
    const { handleAttachmentUpload } = await import('./handler.js');
    const formData = new FormData();
    formData.append('file', new File(['# hello'], 'note.md', { type: 'text/markdown' }));

    const result = await handleAttachmentUpload(formData);

    expect(result.kind).toBe('file');
    expect(result.mimeType).toBe('text/markdown');
    expect(result.base64).toBeUndefined();
    expect(result.previewUrl).toBeUndefined();
  });

  it('rejects unsupported mime types', async () => {
    const { handleAttachmentUpload } = await import('./handler.js');
    const formData = new FormData();
    formData.append('file', new File(['{}'], 'data.json', { type: 'application/json' }));

    await expect(handleAttachmentUpload(formData)).rejects.toThrow('不支持的文件类型');
  });
});
