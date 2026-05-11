import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('authRouter (zod 校验)', () => {
  let projectRoot = '';

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'swell-auth-route-test-'));
    process.env.SWELL_PROJECT_ROOT = projectRoot;
    process.env.SWELL_DATA_DIR = join(projectRoot, 'data');
    process.env.SWELL_GLOBAL_ENV_DIR = projectRoot;
    vi.resetModules();
  });

  afterEach(async () => {
    const { closeDb } = await import('../../db/index.js');
    closeDb();
    rmSync(projectRoot, { recursive: true, force: true });
    delete process.env.SWELL_PROJECT_ROOT;
    delete process.env.SWELL_DATA_DIR;
    delete process.env.SWELL_GLOBAL_ENV_DIR;
    vi.resetModules();
  });

  it('POST /api/auth/tokens 缺 label → 400 VALIDATION_FAILED + issues 含 label', async () => {
    const { authRouter } = await import('./auth.js');
    const res = await authRouter.request('/api/auth/tokens', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      code: string;
      issues: { path: string; message: string }[];
    };
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.issues.some((i) => i.path === 'label')).toBe(true);
  });

  it('POST：label 超过 80 字符 → VALIDATION_FAILED', async () => {
    const { authRouter } = await import('./auth.js');
    const res = await authRouter.request('/api/auth/tokens', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label: 'x'.repeat(81) }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('VALIDATION_FAILED');
  });

  it('POST：scope 非 full → VALIDATION_FAILED', async () => {
    const { authRouter } = await import('./auth.js');
    const res = await authRouter.request('/api/auth/tokens', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label: 'mac', scope: 'admin' }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      code: string;
      issues: { path: string }[];
    };
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.issues.some((i) => i.path === 'scope')).toBe(true);
  });

  it('POST：合法入参 → 201 + 明文 token', async () => {
    const { authRouter } = await import('./auth.js');
    const res = await authRouter.request('/api/auth/tokens', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label: 'mac' }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: number; token: string; scope: string };
    expect(body.id).toBeGreaterThan(0);
    expect(body.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(body.scope).toBe('full');
  });

  it('DELETE：非数字 :id → VALIDATION_FAILED', async () => {
    const { authRouter } = await import('./auth.js');
    const res = await authRouter.request('/api/auth/tokens/abc', { method: 'DELETE' });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('VALIDATION_FAILED');
  });

  it('DELETE：合法 id 撤销，再次 DELETE 幂等 revoked=false', async () => {
    const { authRouter } = await import('./auth.js');
    // 先创建一个
    const create = await authRouter.request('/api/auth/tokens', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label: 'r1' }),
    });
    const created = (await create.json()) as { id: number };

    const first = await authRouter.request(`/api/auth/tokens/${created.id}`, {
      method: 'DELETE',
    });
    expect(first.status).toBe(200);
    expect((await first.json()) as { revoked: boolean }).toEqual({
      ok: true,
      revoked: true,
    });

    const second = await authRouter.request(`/api/auth/tokens/${created.id}`, {
      method: 'DELETE',
    });
    expect((await second.json()) as { revoked: boolean }).toEqual({
      ok: true,
      revoked: false,
    });
  });

  it('GET /api/auth/master-key/status：missing → present 切换', async () => {
    const { authRouter } = await import('./auth.js');
    const before = await authRouter.request('/api/auth/master-key/status');
    expect(before.status).toBe(200);
    expect(((await before.json()) as { status: string }).status).toBe('missing');

    const { ensureMasterKey, _resetMasterKeyCacheForTest } = await import('../../auth/crypto.js');
    ensureMasterKey();
    _resetMasterKeyCacheForTest();
    const after = await authRouter.request('/api/auth/master-key/status');
    expect(((await after.json()) as { status: string }).status).toBe('present');
  });

  it('GET /api/auth/local-token：loopback 来源返回 token', async () => {
    const { ensureLocalToken } = await import('../../auth/tokenStore.js');
    const token = ensureLocalToken();
    const { authRouter } = await import('./auth.js');
    const res = await authRouter.request('http://127.0.0.1/api/auth/local-token');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string };
    expect(body.token).toBe(token);
  });

  it('GET /api/auth/local-token：非 loopback host → 403 AUTH_DENIED', async () => {
    const { ensureLocalToken } = await import('../../auth/tokenStore.js');
    ensureLocalToken();
    const { authRouter } = await import('./auth.js');
    const res = await authRouter.request('http://example.com/api/auth/local-token');
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('AUTH_DENIED');
  });

  it('POST /api/auth/local-token/reset：返回新 token；与原 token 不同', async () => {
    const { ensureLocalToken } = await import('../../auth/tokenStore.js');
    const before = ensureLocalToken();
    const { authRouter } = await import('./auth.js');
    const res = await authRouter.request('http://127.0.0.1/api/auth/local-token/reset', {
      method: 'POST',
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string };
    expect(body.token).not.toBe(before);
    expect(body.token.length).toBeGreaterThanOrEqual(40);
  });

  it('GET /api/auth/remote-mode：默认 enabled=false', async () => {
    const { authRouter } = await import('./auth.js');
    const res = await authRouter.request('/api/auth/remote-mode');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { enabled: boolean }).enabled).toBe(false);
  });

  it('POST /api/auth/remote-mode：启用→关闭循环；关闭时撤销所有 token', async () => {
    const { authRouter } = await import('./auth.js');
    // 先创建两个 token
    await authRouter.request('/api/auth/tokens', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label: 't1' }),
    });
    await authRouter.request('/api/auth/tokens', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label: 't2' }),
    });

    // 启用
    const enable = await authRouter.request('/api/auth/remote-mode', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
    expect(((await enable.json()) as { enabled: boolean }).enabled).toBe(true);

    // 状态查询应该是 enabled=true
    const status = await authRouter.request('/api/auth/remote-mode');
    expect(((await status.json()) as { enabled: boolean }).enabled).toBe(true);

    // 关闭并撤销所有
    const disable = await authRouter.request('/api/auth/remote-mode', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: false, revokeAllTokens: true }),
    });
    const dRes = (await disable.json()) as { enabled: boolean; revokedTokens: number };
    expect(dRes.enabled).toBe(false);
    expect(dRes.revokedTokens).toBe(2);

    // 再查 token 列表应为空（默认排除已撤销）
    const list = await authRouter.request('/api/auth/tokens');
    expect(((await list.json()) as { tokens: unknown[] }).tokens.length).toBe(0);
  });

  it('POST /api/auth/remote-mode：enabled 字段缺失 → VALIDATION_FAILED', async () => {
    const { authRouter } = await import('./auth.js');
    const res = await authRouter.request('/api/auth/remote-mode', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe('VALIDATION_FAILED');
  });
});
