import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('tokenStore', () => {
  let dataDir = '';

  beforeEach(() => {
    const root = mkdtempSync(join(tmpdir(), 'swell-token-store-test-'));
    dataDir = join(root, 'data');
    process.env.SWELL_PROJECT_ROOT = root;
    process.env.SWELL_DATA_DIR = dataDir;
    process.env.SWELL_GLOBAL_ENV_DIR = root;
    vi.resetModules();
  });

  afterEach(() => {
    try {
      rmSync(process.env.SWELL_PROJECT_ROOT ?? '', { recursive: true, force: true });
    } catch {
      // ignore
    }
    delete process.env.SWELL_PROJECT_ROOT;
    delete process.env.SWELL_DATA_DIR;
    delete process.env.SWELL_GLOBAL_ENV_DIR;
    vi.resetModules();
  });

  it('ensureLocalToken 首次生成且权限 0600；二次调用幂等', async () => {
    const { ensureLocalToken } = await import('./tokenStore.js');
    const t1 = ensureLocalToken();
    expect(t1).toMatch(/^[A-Za-z0-9_-]+$/); // base64url
    expect(t1.length).toBeGreaterThanOrEqual(40);

    const tokenFile = join(dataDir, 'auth', 'local-token');
    expect(existsSync(tokenFile)).toBe(true);
    if (process.platform !== 'win32') {
      const mode = statSync(tokenFile).mode & 0o777;
      expect(mode).toBe(0o600);
    }

    const t2 = ensureLocalToken();
    expect(t2).toBe(t1);
    expect(readFileSync(tokenFile, 'utf8').trim()).toBe(t1);
  });

  it('createRemoteToken 默认 scope=full，明文 token 仅返回一次', async () => {
    const store = await import('./tokenStore.js');
    const created = store.createRemoteToken({ label: 'remote-mac' });
    expect(created.scope).toBe('full');
    expect(created.label).toBe('remote-mac');
    expect(created.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(created.id).toBeGreaterThan(0);
    expect(created.lastUsedAt).toBeNull();
    expect(created.revokedAt).toBeNull();

    const list = store.listRemoteTokens();
    expect(list.length).toBe(1);
    // listRemoteTokens 不暴露 token / token_hash
    expect((list[0] as unknown as { token?: string }).token).toBeUndefined();
  });

  it('createRemoteToken 拒绝空 label / 超长 label / 非法 scope', async () => {
    const store = await import('./tokenStore.js');
    expect(() => store.createRemoteToken({ label: '' })).toThrow(/label/);
    expect(() => store.createRemoteToken({ label: '   ' })).toThrow(/label/);
    expect(() => store.createRemoteToken({ label: 'a'.repeat(81) })).toThrow(/too long/);
    expect(() => store.createRemoteToken({ label: 'x', scope: 'admin' as never })).toThrow(/scope/);
  });

  it('verifyToken 命中本机 token / 远程 token；明文不命中返回 null', async () => {
    const store = await import('./tokenStore.js');
    const local = store.ensureLocalToken();
    const remote = store.createRemoteToken({ label: 'r1' });

    const localHit = store.verifyToken(local);
    expect(localHit?.kind).toBe('local');
    expect(localHit?.scope).toBe('full');

    const remoteHit = store.verifyToken(remote.token);
    expect(remoteHit?.kind).toBe('remote');
    if (remoteHit?.kind === 'remote') {
      expect(remoteHit.tokenId).toBe(remote.id);
      expect(remoteHit.label).toBe('r1');
    }

    expect(store.verifyToken('not-a-real-token')).toBeNull();
    expect(store.verifyToken('')).toBeNull();
  });

  it('revokeRemoteToken 后该 token verify 返回 null；幂等', async () => {
    const store = await import('./tokenStore.js');
    const remote = store.createRemoteToken({ label: 'r2' });
    expect(store.verifyToken(remote.token)).not.toBeNull();

    expect(store.revokeRemoteToken(remote.id)).toBe(true);
    expect(store.verifyToken(remote.token)).toBeNull();
    expect(store.revokeRemoteToken(remote.id)).toBe(false); // 幂等

    // 默认 list 不含已撤销
    expect(store.listRemoteTokens().length).toBe(0);
    // include_revoked 时可见
    const all = store.listRemoteTokens({ includeRevoked: true });
    expect(all.length).toBe(1);
    expect(all[0].revokedAt).not.toBeNull();
  });

  it('touchRemoteToken 节流：同一 token 1s 内只更新一次 last_used_at', async () => {
    const store = await import('./tokenStore.js');
    const remote = store.createRemoteToken({ label: 'r3' });

    const t0 = 1_700_000_000_000;
    store.touchRemoteToken(remote.id, t0);
    const after1 = store.listRemoteTokens()[0];
    expect(after1.lastUsedAt).toBe(t0);

    // 节流窗口内（< 1000ms）
    store.touchRemoteToken(remote.id, t0 + 500);
    const after2 = store.listRemoteTokens()[0];
    expect(after2.lastUsedAt).toBe(t0);

    // 跨窗口
    store.touchRemoteToken(remote.id, t0 + 1500);
    const after3 = store.listRemoteTokens()[0];
    expect(after3.lastUsedAt).toBe(t0 + 1500);
  });

  it('resetLocalToken 生成新值，旧值不再命中 verify', async () => {
    const store = await import('./tokenStore.js');
    const t1 = store.ensureLocalToken();
    const t2 = store.resetLocalToken();
    expect(t2).not.toBe(t1);

    expect(store.verifyToken(t1)).toBeNull();
    expect(store.verifyToken(t2)?.kind).toBe('local');
  });
});
