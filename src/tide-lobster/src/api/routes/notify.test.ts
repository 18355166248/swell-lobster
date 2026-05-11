import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('notifyRouter', () => {
  let repoRoot = '';

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'swell-notify-route-test-'));
    mkdirSync(join(repoRoot, 'identity'), { recursive: true });
    mkdirSync(join(repoRoot, 'data'), { recursive: true });
    writeFileSync(join(repoRoot, 'identity', 'assistant.md'), 'You are a test assistant.');
    process.env.SWELL_PROJECT_ROOT = repoRoot;
    process.env.SWELL_DATA_DIR = join(repoRoot, 'data');
    process.env.SWELL_IDENTITY_DIR = join(repoRoot, 'identity');
    vi.resetModules();
  });

  afterEach(async () => {
    const { closeDb } = await import('../../db/index.js');
    closeDb();
    rmSync(repoRoot, { recursive: true, force: true });
    delete process.env.SWELL_PROJECT_ROOT;
    delete process.env.SWELL_DATA_DIR;
    delete process.env.SWELL_IDENTITY_DIR;
    vi.resetModules();
  });

  it('streams notify events as SSE payloads', async () => {
    const { createApp } = await import('../server.js');
    const { notifyBus } = await import('../../notify/bus.js');
    const app = createApp();

    const response = await app.request('/api/notify/stream');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    const reader = response.body?.getReader();
    expect(reader).toBeDefined();

    notifyBus.emit('event', {
      type: 'im_start',
      session_id: 'chat_test_notify',
      channel_type: 'feishu',
    });

    const chunk = await reader!.read();
    const payload = new TextDecoder().decode(chunk.value);
    await reader!.cancel();

    expect(payload).toContain('event: notify');
    expect(payload).toContain('"type":"im_start"');
    expect(payload).toContain('"channel_type":"feishu"');
  });
});
