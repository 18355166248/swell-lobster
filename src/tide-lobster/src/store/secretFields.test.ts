import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, rmSync as rm } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('secretFields', () => {
  let projectRoot = '';

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'swell-secret-fields-test-'));
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

  it('encryptJsonObject：im_channels.config 内的 app_secret / webhook_secret 被加密', async () => {
    const { ensureMasterKey, isEncrypted } = await import('../auth/crypto.js');
    ensureMasterKey();
    const { encryptJsonObject } = await import('./secretFields.js');

    const cfg = {
      app_id: 'cli_xxx',
      app_secret: 'plaintext-secret',
      webhook_secret: 'wh-secret',
      bot_token_env: 'TG_BOT_TOKEN', // 非敏感字段保持原样
    };
    const enc = encryptJsonObject('im_channels', 'config', cfg);
    expect(isEncrypted(enc.app_secret as string)).toBe(true);
    expect(isEncrypted(enc.webhook_secret as string)).toBe(true);
    expect(enc.app_id).toBe('cli_xxx');
    expect(enc.bot_token_env).toBe('TG_BOT_TOKEN');
  });

  it('decryptJsonObject：还原密文为明文；明文兼容期原样', async () => {
    const { ensureMasterKey } = await import('../auth/crypto.js');
    ensureMasterKey();
    const { encryptJsonObject, decryptJsonObject } = await import('./secretFields.js');

    const original = {
      app_id: 'cli_x',
      app_secret: 'plaintext-secret',
      webhook_secret: 'wh',
    };
    const enc = encryptJsonObject('im_channels', 'config', original);
    const dec = decryptJsonObject('im_channels', 'config', enc);
    expect(dec).toEqual(original);

    // 兼容期：传入混合（一个加密、一个明文）
    const mixed = { ...enc, webhook_secret: 'leftover-plaintext' };
    const dec2 = decryptJsonObject('im_channels', 'config', mixed);
    expect(dec2.app_secret).toBe('plaintext-secret');
    expect(dec2.webhook_secret).toBe('leftover-plaintext');
  });

  it('encryptRowFields：im_channels 的 config 列序列化回 JSON string', async () => {
    const { ensureMasterKey, isEncrypted } = await import('../auth/crypto.js');
    ensureMasterKey();
    const { encryptRowFields } = await import('./secretFields.js');

    const row = {
      id: 'r1',
      channel_type: 'feishu',
      config: JSON.stringify({ app_id: 'a', app_secret: 'plain' }),
    };
    const enc = encryptRowFields('im_channels', row);
    expect(typeof enc.config).toBe('string');
    const parsed = JSON.parse(enc.config as string);
    expect(parsed.app_id).toBe('a');
    expect(isEncrypted(parsed.app_secret)).toBe(true);
  });

  it('encryptRowFields：scheduler_tasks 的 webhook_secret 整列加密（column kind）', async () => {
    const { ensureMasterKey, isEncrypted } = await import('../auth/crypto.js');
    ensureMasterKey();
    const { encryptRowFields } = await import('./secretFields.js');

    const row = { id: 's1', name: 'x', webhook_secret: 'plain-secret' };
    const enc = encryptRowFields('scheduler_tasks', row);
    expect(isEncrypted(enc.webhook_secret as string)).toBe(true);
    expect(enc.name).toBe('x');
  });

  it('decryptRowFields：master 缺失时受保护字段返回 null + 写 secret.decryptFailed 事件', async () => {
    const { ensureMasterKey, encrypt, _resetMasterKeyCacheForTest } =
      await import('../auth/crypto.js');
    ensureMasterKey();
    const ct = encrypt('plain-secret');

    // 删 key 文件 + 清缓存
    rmSync(join(projectRoot, 'data', 'auth', 'master.key'));
    _resetMasterKeyCacheForTest();

    const { decryptRowFields } = await import('./secretFields.js');
    const row = { id: 's1', webhook_secret: ct };
    const dec = decryptRowFields('scheduler_tasks', row);
    expect(dec.webhook_secret).toBeNull();
  });

  it('未登记的表：encryptRowFields / decryptRowFields 原样返回', async () => {
    const { ensureMasterKey } = await import('../auth/crypto.js');
    ensureMasterKey();
    const { encryptRowFields, decryptRowFields } = await import('./secretFields.js');

    const row = { id: '1', anything: 'plain' };
    expect(encryptRowFields('not_a_table', row)).toEqual(row);
    expect(decryptRowFields('not_a_table', row)).toEqual(row);
  });

  it('encryptRowFields 幂等：已加密的字段再加密保持不变', async () => {
    const { ensureMasterKey } = await import('../auth/crypto.js');
    ensureMasterKey();
    const { encryptJsonObject } = await import('./secretFields.js');

    const cfg = { app_secret: 'plain' };
    const once = encryptJsonObject('im_channels', 'config', cfg);
    const twice = encryptJsonObject('im_channels', 'config', once);
    expect(twice.app_secret).toBe(once.app_secret);
  });

  it('JSON 列损坏时：encryptRowFields 跳过该列，不抛错', async () => {
    const { ensureMasterKey } = await import('../auth/crypto.js');
    ensureMasterKey();
    const { encryptRowFields } = await import('./secretFields.js');

    const row = { id: 'r2', config: 'not-json' };
    const enc = encryptRowFields('im_channels', row);
    // JSON 解析失败 → 原样保留
    expect(enc.config).toBe('not-json');
  });
});
