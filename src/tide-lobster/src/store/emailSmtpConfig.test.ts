import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('emailSmtpConfig', () => {
  let repoRoot = '';
  let dataDir = '';

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'swell-smtp-config-test-'));
    dataDir = join(repoRoot, 'data');
    mkdirSync(dataDir, { recursive: true });
    mkdirSync(join(repoRoot, 'identity'), { recursive: true });
    writeFileSync(join(repoRoot, 'identity', 'assistant.md'), 'You are a test assistant.');
    process.env.SWELL_PROJECT_ROOT = repoRoot;
    process.env.SWELL_DATA_DIR = dataDir;
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

  it('stores smtp config with encrypted password and returns masked view', async () => {
    const { saveSmtpConfig, getSmtpConfig, getMaskedSmtpConfig } = await import('./emailSmtpConfig.js');
    const { KeyValueStore } = await import('./keyValueStore.js');
    saveSmtpConfig({
      host: 'smtp.example.com',
      port: 465,
      user: 'bot@example.com',
      password: 'secret123',
      from: 'bot@example.com',
      secure: true,
    });

    const raw = new KeyValueStore().getValue('email.smtp.config');
    expect(raw).toContain('enc:v1:');
    expect(raw).not.toContain('secret123');
    expect(getSmtpConfig()?.password).toBe('secret123');
    expect(getMaskedSmtpConfig()).toMatchObject({
      host: 'smtp.example.com',
      user: 'bot@example.com',
      from: 'bot@example.com',
      passwordConfigured: true,
    });
  });
});

