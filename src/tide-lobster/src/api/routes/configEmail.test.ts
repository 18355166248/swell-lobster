import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('configEmailRouter', () => {
  let repoRoot = '';

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'swell-config-email-test-'));
    mkdirSync(join(repoRoot, 'identity'), { recursive: true });
    mkdirSync(join(repoRoot, 'data'), { recursive: true });
    writeFileSync(join(repoRoot, 'identity', 'assistant.md'), 'You are a test assistant.');
    process.env.SWELL_GLOBAL_ENV_DIR = repoRoot;
    process.env.SWELL_PROJECT_ROOT = repoRoot;
    process.env.SWELL_DATA_DIR = join(repoRoot, 'data');
    process.env.SWELL_IDENTITY_DIR = join(repoRoot, 'identity');
    vi.resetModules();
  });

  afterEach(async () => {
    const { closeDb } = await import('../../db/index.js');
    closeDb();
    rmSync(repoRoot, { recursive: true, force: true });
    delete process.env.SWELL_GLOBAL_ENV_DIR;
    delete process.env.SWELL_PROJECT_ROOT;
    delete process.env.SWELL_DATA_DIR;
    delete process.env.SWELL_IDENTITY_DIR;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('stores smtp config and masks password in response', async () => {
    const { createApp } = await import('../server.js');
    const app = createApp();

    const save = await app.request('/api/config/email-smtp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        host: 'smtp.example.com',
        port: 465,
        user: 'bot@example.com',
        password: 'secret123',
        from: 'bot@example.com',
        secure: true,
      }),
    });
    expect(save.status).toBe(200);
    const savedPayload = await save.json();
    expect(savedPayload.config.passwordConfigured).toBe(true);
    expect(savedPayload.config.password).toBeUndefined();

    const read = await app.request('/api/config/email-smtp');
    expect(read.status).toBe(200);
    expect((await read.json()).config).toMatchObject({
      host: 'smtp.example.com',
      user: 'bot@example.com',
      passwordConfigured: true,
    });
  });
});

