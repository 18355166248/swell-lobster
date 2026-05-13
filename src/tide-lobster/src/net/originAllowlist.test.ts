import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('originAllowlist', () => {
  let repoRoot = '';

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'swell-origin-allowlist-test-'));
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
    const { closeDb } = await import('../db/index.js');
    closeDb();
    rmSync(repoRoot, { recursive: true, force: true });
    delete process.env.SWELL_GLOBAL_ENV_DIR;
    delete process.env.SWELL_PROJECT_ROOT;
    delete process.env.SWELL_DATA_DIR;
    delete process.env.SWELL_IDENTITY_DIR;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('allows localhost by default', async () => {
    const { isOriginAllowed } = await import('./originAllowlist.js');
    expect(isOriginAllowed('http://localhost:5173/demo')).toBe(true);
    expect(isOriginAllowed('http://127.0.0.1:18900/health')).toBe(true);
  });

  it('reads custom allowlist from env-backed config', async () => {
    writeFileSync(
      join(repoRoot, '.env'),
      'SWELL_BROWSER_ALLOWED_ORIGINS=https://example.com,*.internal.test\n',
      'utf-8'
    );
    vi.resetModules();
    const { isOriginAllowed } = await import('./originAllowlist.js');
    expect(isOriginAllowed('https://example.com/path')).toBe(true);
    expect(isOriginAllowed('https://api.internal.test/data')).toBe(true);
    expect(isOriginAllowed('https://blocked.test')).toBe(false);
  });
});
