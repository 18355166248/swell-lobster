import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * 端到端：通过 imStore.create 写入含 app_secret 的飞书 config，
 * 检查 DB 实际存储为密文，但通过 imStore.list/get 读出仍是明文。
 */
describe('imStore 加密接入', () => {
  let projectRoot = '';

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'swell-im-store-enc-test-'));
    process.env.SWELL_PROJECT_ROOT = projectRoot;
    process.env.SWELL_DATA_DIR = join(projectRoot, 'data');
    process.env.SWELL_GLOBAL_ENV_DIR = projectRoot;
    delete process.env.SWELL_MASTER_KEY;
    vi.resetModules();
  });

  afterEach(async () => {
    const { closeDb } = await import('../db/index.js');
    closeDb();
    rmSync(projectRoot, { recursive: true, force: true });
    delete process.env.SWELL_PROJECT_ROOT;
    delete process.env.SWELL_DATA_DIR;
    delete process.env.SWELL_GLOBAL_ENV_DIR;
    delete process.env.SWELL_MASTER_KEY;
    vi.resetModules();
  });

  it('create 后 DB 内 app_secret 是 enc:v1，业务读路径返回明文', async () => {
    const { ensureMasterKey, isEncrypted } = await import('../auth/crypto.js');
    ensureMasterKey();
    const { imStore } = await import('./store.js');
    const { getDb } = await import('../db/index.js');

    const created = imStore.create({
      channel_type: 'feishu',
      name: 'fs',
      config: { app_id: 'cli_x', app_secret: 'plain-secret' },
      enabled: false,
    });

    // 业务读：明文
    expect(created.config.app_secret).toBe('plain-secret');
    expect(imStore.get(created.id)?.config.app_secret).toBe('plain-secret');

    // DB 直读：密文
    const raw = getDb().prepare(`SELECT config FROM im_channels WHERE id = ?`).get(created.id) as {
      config: string;
    };
    const parsed = JSON.parse(raw.config);
    expect(isEncrypted(parsed.app_secret)).toBe(true);
    expect(parsed.app_id).toBe('cli_x');
  });

  it('update 接受新明文 → DB 存密文', async () => {
    const { ensureMasterKey, isEncrypted } = await import('../auth/crypto.js');
    ensureMasterKey();
    const { imStore } = await import('./store.js');
    const { getDb } = await import('../db/index.js');

    const created = imStore.create({
      channel_type: 'feishu',
      name: 'fs',
      config: { app_id: 'a' },
    });
    const updated = imStore.update(created.id, {
      config: { app_id: 'a', app_secret: 'rotated' },
    });
    expect(updated?.config.app_secret).toBe('rotated');

    const raw = getDb().prepare(`SELECT config FROM im_channels WHERE id = ?`).get(created.id) as {
      config: string;
    };
    const parsed = JSON.parse(raw.config);
    expect(isEncrypted(parsed.app_secret)).toBe(true);
  });

  it('list 自动解密所有行', async () => {
    const { ensureMasterKey } = await import('../auth/crypto.js');
    ensureMasterKey();
    const { imStore } = await import('./store.js');

    imStore.create({
      channel_type: 'feishu',
      name: 'fs1',
      config: { app_secret: 's1' },
    });
    imStore.create({
      channel_type: 'feishu',
      name: 'fs2',
      config: { app_secret: 's2' },
    });
    const list = imStore.list();
    expect(list.length).toBe(2);
    const secrets = list.map((r) => r.config.app_secret).sort();
    expect(secrets).toEqual(['s1', 's2']);
  });

  it('master key 丢失：list 返回的 app_secret 为 null（旁路），不抛错', async () => {
    const { ensureMasterKey, _resetMasterKeyCacheForTest } = await import('../auth/crypto.js');
    ensureMasterKey();
    const { imStore } = await import('./store.js');
    imStore.create({
      channel_type: 'feishu',
      name: 'fs',
      config: { app_id: 'a', app_secret: 'plain' },
    });

    // 模拟主密钥丢失
    rmSync(join(projectRoot, 'data', 'auth', 'master.key'));
    _resetMasterKeyCacheForTest();

    const list = imStore.list();
    expect(list[0].config.app_id).toBe('a');
    expect(list[0].config.app_secret).toBeNull();
  });
});
