import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('configSandboxRouter', () => {
  let repoRoot = '';

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'swell-config-sandbox-test-'));
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

  it('GET /api/config/sandbox 返回默认 open 模式', async () => {
    const { createApp } = await import('../server.js');
    const app = createApp();

    const res = await app.request('/api/config/sandbox');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe('open');
    expect(Array.isArray(body.allowlist)).toBe(true);
  });

  it('PATCH /api/config/sandbox 切换模式为 allowlist', async () => {
    const { createApp } = await import('../server.js');
    const app = createApp();

    const patch = await app.request('/api/config/sandbox', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'allowlist' }),
    });
    expect(patch.status).toBe(200);
    const body = await patch.json();
    expect(body.mode).toBe('allowlist');

    // 持久化验证：重新 GET
    const get = await app.request('/api/config/sandbox');
    expect((await get.json()).mode).toBe('allowlist');
  });

  it('PATCH /api/config/sandbox 无效 mode 返回 400', async () => {
    const { createApp } = await import('../server.js');
    const app = createApp();

    const patch = await app.request('/api/config/sandbox', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'invalid' }),
    });
    expect(patch.status).toBe(400);
  });

  it('POST /api/config/sandbox/allowlist 添加规则', async () => {
    const { createApp } = await import('../server.js');
    const app = createApp();

    const post = await app.request('/api/config/sandbox/allowlist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rule: 'example.com' }),
    });
    expect(post.status).toBe(200);
    const body = await post.json();
    expect(body.allowlist).toContain('example.com');
  });

  it('DELETE /api/config/sandbox/allowlist/:rule 删除规则', async () => {
    const { createApp } = await import('../server.js');
    const app = createApp();

    // 先添加
    await app.request('/api/config/sandbox/allowlist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rule: 'to-delete.com' }),
    });

    const del = await app.request(
      `/api/config/sandbox/allowlist/${encodeURIComponent('to-delete.com')}`,
      { method: 'DELETE' }
    );
    expect(del.status).toBe(200);
    const body = await del.json();
    expect(body.allowlist).not.toContain('to-delete.com');
  });
});
