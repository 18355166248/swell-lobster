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

  afterEach(() => {
    try {
      rmSync(projectRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
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
});
