import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * middleware 集成测：用临时 dataDir 启 token store + middleware，
 * 用 forceEnabled: true 绕过 VITEST 自动 bypass。
 */
describe('requireAuthToken middleware', () => {
  let projectRoot = '';

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'swell-auth-mw-test-'));
    process.env.SWELL_PROJECT_ROOT = projectRoot;
    process.env.SWELL_DATA_DIR = join(projectRoot, 'data');
    process.env.SWELL_GLOBAL_ENV_DIR = projectRoot;
    delete process.env.SWELL_REMOTE;
    delete process.env.SWELL_AUTH_DISABLED;
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
    delete process.env.SWELL_REMOTE;
    delete process.env.SWELL_AUTH_DISABLED;
    vi.resetModules();
  });

  async function buildApp(rateLimiter?: unknown) {
    const { Hono } = await import('hono');
    const { requireAuthToken } = await import('./middleware.js');
    const app = new Hono();
    app.use(
      '/api/*',
      requireAuthToken({
        exempt: ['/api/health'],
        forceEnabled: true,
        // 让所有请求看起来都来自远程 IP，避免 loopback 豁免
        getClientIp: (c) => c.req.header('x-test-ip') ?? '203.0.113.7',
        rateLimiter: rateLimiter as never,
      })
    );
    app.get('/api/health', (c) => c.json({ ok: true }));
    app.get('/api/echo', (c) =>
      c.json({
        ok: true,
        auth: (c as unknown as { get: (k: string) => unknown }).get('authResult'),
      })
    );
    app.post('/api/echo', (c) => c.json({ ok: true }));
    return app;
  }

  it('豁免路径无需 token 即可放行', async () => {
    const app = await buildApp();
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
  });

  it('OPTIONS 预检不进鉴权，直接进入下一中间件（这里没有 cors 所以会 404）', async () => {
    const app = await buildApp();
    const res = await app.request('/api/echo', { method: 'OPTIONS' });
    // hono 默认 405/404，但应该不是 401（说明绕过了 auth）
    expect(res.status).not.toBe(401);
  });

  it('未带 token → 401 + AUTH_REQUIRED', async () => {
    const app = await buildApp();
    const res = await app.request('/api/echo');
    expect(res.status).toBe(401);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe('AUTH_REQUIRED');
  });

  it('错误 token → 401 + AUTH_INVALID', async () => {
    const app = await buildApp();
    const res = await app.request('/api/echo', {
      headers: { 'X-Auth-Token': 'wrong-token' },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe('AUTH_INVALID');
  });

  it('正确的本机 token → 200 + authResult.kind=local', async () => {
    const { ensureLocalToken } = await import('./tokenStore.js');
    const localToken = ensureLocalToken();
    const app = await buildApp();
    const res = await app.request('/api/echo', {
      headers: { 'X-Auth-Token': localToken },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; auth: { kind: string } };
    expect(body.ok).toBe(true);
    expect(body.auth.kind).toBe('local');
  });

  it('正确的远程 token → 200 + authResult.kind=remote 且 last_used_at 被刷新', async () => {
    const { createRemoteToken, listRemoteTokens } = await import('./tokenStore.js');
    const created = createRemoteToken({ label: 'mac' });
    const app = await buildApp();
    const res = await app.request('/api/echo', {
      headers: { 'X-Auth-Token': created.token },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { auth: { kind: string; tokenId: number } };
    expect(body.auth.kind).toBe('remote');
    expect(body.auth.tokenId).toBe(created.id);

    // last_used_at 被刷新
    const list = listRemoteTokens();
    expect(list[0].lastUsedAt).not.toBeNull();
  });

  it('?token=query 兼容', async () => {
    const { ensureLocalToken } = await import('./tokenStore.js');
    const t = ensureLocalToken();
    const app = await buildApp();
    const res = await app.request(`/api/echo?token=${encodeURIComponent(t)}`);
    expect(res.status).toBe(200);
  });

  it('连续 N 次错误 token 后第 N 次返回 429 + Retry-After', async () => {
    const { AuthRateLimiter } = await import('./rateLimit.js');
    const limiter = new AuthRateLimiter({
      maxFails: 3,
      windowMs: 60_000,
      blockMs: 60_000,
      loopbackExempt: false,
    });
    const app = await buildApp(limiter);

    // 前 2 次：401（错 token）
    for (let i = 0; i < 2; i++) {
      const r = await app.request('/api/echo', { headers: { 'X-Auth-Token': 'x' } });
      expect(r.status).toBe(401);
    }
    // 第 3 次：触发封锁，仍然 429（中间件先 register 后判断 blocked）
    const third = await app.request('/api/echo', { headers: { 'X-Auth-Token': 'x' } });
    expect(third.status).toBe(429);
    expect(third.headers.get('Retry-After')).toMatch(/^\d+$/);

    // 之后任何请求（包括正确 token）都被 429 阻挡（封锁针对 IP 而非 token）
    const { ensureLocalToken } = await import('./tokenStore.js');
    const t = ensureLocalToken();
    const blocked = await app.request('/api/echo', { headers: { 'X-Auth-Token': t } });
    expect(blocked.status).toBe(429);
  });

  it('SWELL_AUTH_DISABLED=1 时 bypass（无需 token）', async () => {
    process.env.SWELL_AUTH_DISABLED = '1';
    const { Hono } = await import('hono');
    const { requireAuthToken } = await import('./middleware.js');
    const app = new Hono();
    // 注意：这里不强制 forceEnabled，让 SWELL_AUTH_DISABLED 生效
    app.use(
      '/api/*',
      requireAuthToken({
        exempt: [],
        getClientIp: () => '203.0.113.7',
      })
    );
    app.get('/api/echo', (c) => c.json({ ok: true }));
    const res = await app.request('/api/echo');
    expect(res.status).toBe(200);
  });
});
