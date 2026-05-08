import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('migrateExistingSecrets', () => {
  let projectRoot = '';

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'swell-migrate-test-'));
    process.env.SWELL_PROJECT_ROOT = projectRoot;
    process.env.SWELL_DATA_DIR = join(projectRoot, 'data');
    process.env.SWELL_GLOBAL_ENV_DIR = projectRoot;
    delete process.env.SWELL_MASTER_KEY;
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
    delete process.env.SWELL_MASTER_KEY;
    vi.resetModules();
  });

  it('master key 未就位 → status=skipped', async () => {
    // 不调 ensureMasterKey
    const { migrateExistingSecrets } = await import('./migrateSecrets.js');
    const r = migrateExistingSecrets();
    expect(r.status).toBe('skipped');
    expect(r.encryptedCount).toBe(0);
  });

  it('im_channels 表里有明文 app_secret → 迁移后 enc:v1，并保持 app_id 等明文不变', async () => {
    const { ensureMasterKey, isEncrypted, decrypt } = await import('../auth/crypto.js');
    ensureMasterKey();
    const { getDb } = await import('../db/index.js');
    const db = getDb();

    // 直接写一条明文 config（绕过 imStore，模拟旧数据）
    db.prepare(
      `INSERT INTO im_channels (id, channel_type, name, config, enabled, status, created_at)
       VALUES (?, ?, ?, ?, 1, 'stopped', ?)`
    ).run(
      'r1',
      'feishu',
      'fs',
      JSON.stringify({
        app_id: 'cli_x',
        app_secret: 'plaintext-app-secret',
        webhook_secret: 'plaintext-webhook',
      }),
      new Date().toISOString()
    );

    const { migrateExistingSecrets } = await import('./migrateSecrets.js');
    const r = migrateExistingSecrets();
    expect(r.status).toBe('ok');
    expect(r.encryptedCount).toBe(2); // app_secret + webhook_secret
    expect(r.sampledCount).toBeGreaterThanOrEqual(1);

    // DB 里 config 列内的两个字段应是密文
    const stored = db.prepare(`SELECT config FROM im_channels WHERE id = ?`).get('r1') as {
      config: string;
    };
    const parsed = JSON.parse(stored.config) as Record<string, string>;
    expect(parsed.app_id).toBe('cli_x'); // 非敏感字段保持
    expect(isEncrypted(parsed.app_secret)).toBe(true);
    expect(isEncrypted(parsed.webhook_secret)).toBe(true);
    expect(decrypt(parsed.app_secret)).toBe('plaintext-app-secret');
    expect(decrypt(parsed.webhook_secret)).toBe('plaintext-webhook');
  });

  it('再次调用幂等：已加密字段不再重复加密', async () => {
    const { ensureMasterKey } = await import('../auth/crypto.js');
    ensureMasterKey();
    const { getDb } = await import('../db/index.js');
    const db = getDb();
    db.prepare(
      `INSERT INTO im_channels (id, channel_type, name, config, enabled, status, created_at)
       VALUES (?, ?, ?, ?, 1, 'stopped', ?)`
    ).run('r2', 'feishu', 'fs', JSON.stringify({ app_secret: 'x' }), new Date().toISOString());

    const { migrateExistingSecrets } = await import('./migrateSecrets.js');
    const first = migrateExistingSecrets();
    expect(first.encryptedCount).toBe(1);

    const second = migrateExistingSecrets();
    expect(second.status).toBe('ok');
    expect(second.encryptedCount).toBe(0);
  });

  it('scheduler_tasks 历史明文 webhook_secret 也被迁移', async () => {
    const { ensureMasterKey, isEncrypted, decrypt } = await import('../auth/crypto.js');
    ensureMasterKey();
    const { getDb } = await import('../db/index.js');
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO scheduler_tasks (id, name, task_type, trigger_type, trigger_config, prompt, enabled, created_at, updated_at, webhook_secret)
       VALUES (?, ?, 'task', 'cron', '{}', '', 1, ?, ?, ?)`
    ).run('s1', 'task1', now, now, 'plain-secret');

    const { migrateExistingSecrets } = await import('./migrateSecrets.js');
    const r = migrateExistingSecrets();
    expect(r.status).toBe('ok');
    expect(r.encryptedCount).toBe(1);

    const stored = db
      .prepare(`SELECT webhook_secret FROM scheduler_tasks WHERE id = ?`)
      .get('s1') as { webhook_secret: string };
    expect(isEncrypted(stored.webhook_secret)).toBe(true);
    expect(decrypt(stored.webhook_secret)).toBe('plain-secret');
  });

  it('多表混合：im + scheduler 同时迁移', async () => {
    const { ensureMasterKey } = await import('../auth/crypto.js');
    ensureMasterKey();
    const { getDb } = await import('../db/index.js');
    const db = getDb();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO im_channels (id, channel_type, name, config, enabled, status, created_at)
       VALUES (?, ?, ?, ?, 1, 'stopped', ?)`
    ).run('r1', 'feishu', 'fs', JSON.stringify({ app_secret: 'a' }), now);

    db.prepare(
      `INSERT INTO scheduler_tasks (id, name, task_type, trigger_type, trigger_config, prompt, enabled, created_at, updated_at, webhook_secret)
       VALUES (?, ?, 'task', 'cron', '{}', '', 1, ?, ?, ?)`
    ).run('s1', 'task1', now, now, 'b');

    const { migrateExistingSecrets } = await import('./migrateSecrets.js');
    const r = migrateExistingSecrets();
    expect(r.status).toBe('ok');
    expect(r.encryptedCount).toBe(2);
  });

  it('空表：status=ok, encryptedCount=0', async () => {
    const { ensureMasterKey } = await import('../auth/crypto.js');
    ensureMasterKey();
    const { migrateExistingSecrets } = await import('./migrateSecrets.js');
    const r = migrateExistingSecrets();
    expect(r.status).toBe('ok');
    expect(r.encryptedCount).toBe(0);
  });
});
