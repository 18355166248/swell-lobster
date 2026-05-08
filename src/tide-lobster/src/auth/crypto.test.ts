import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

describe('crypto (AES-256-GCM)', () => {
  let projectRoot = '';

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'swell-crypto-test-'));
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

  it('ensureMasterKey 首启生成 0600 文件，二次调用幂等', async () => {
    const { ensureMasterKey, _resetMasterKeyCacheForTest } = await import('./crypto.js');
    const k1 = ensureMasterKey();
    expect(k1.length).toBe(32);

    const keyFile = join(projectRoot, 'data', 'auth', 'master.key');
    expect(existsSync(keyFile)).toBe(true);
    if (process.platform !== 'win32') {
      const mode = statSync(keyFile).mode & 0o777;
      expect(mode).toBe(0o600);
    }

    const k2 = ensureMasterKey();
    expect(Buffer.compare(k1, k2)).toBe(0);

    // 重置内存缓存后从文件再读，仍应一致
    _resetMasterKeyCacheForTest();
    const k3 = ensureMasterKey();
    expect(Buffer.compare(k1, k3)).toBe(0);
  });

  it('SWELL_MASTER_KEY env 优先于文件', async () => {
    const envKey = randomBytes(32).toString('base64url');
    process.env.SWELL_MASTER_KEY = envKey;
    const { ensureMasterKey } = await import('./crypto.js');
    const k = ensureMasterKey();
    expect(k.toString('base64url')).toBe(envKey);
    // 不应在 dataDir 下落文件（env 已就位）
    const keyFile = join(projectRoot, 'data', 'auth', 'master.key');
    expect(existsSync(keyFile)).toBe(false);
  });

  it('encrypt → decrypt 往返一致；同一明文每次密文不同（IV 随机）', async () => {
    const { ensureMasterKey, encrypt, decrypt } = await import('./crypto.js');
    ensureMasterKey();
    const plain = 'super-secret-token';
    const c1 = encrypt(plain);
    const c2 = encrypt(plain);
    expect(c1).not.toBe(c2);
    expect(c1.startsWith('enc:v1:')).toBe(true);
    expect(decrypt(c1)).toBe(plain);
    expect(decrypt(c2)).toBe(plain);
  });

  it('isEncrypted 正确识别', async () => {
    const { ensureMasterKey, encrypt, isEncrypted } = await import('./crypto.js');
    ensureMasterKey();
    expect(isEncrypted(encrypt('x'))).toBe(true);
    expect(isEncrypted('plain')).toBe(false);
    expect(isEncrypted('')).toBe(false);
    expect(isEncrypted(null)).toBe(false);
  });

  it('用错的 master key 解密 → auth-tag-invalid', async () => {
    const { ensureMasterKey, encrypt, _resetMasterKeyCacheForTest, decrypt } =
      await import('./crypto.js');
    ensureMasterKey();
    const ct = encrypt('hello');

    // 换一把 key（覆盖文件）
    const keyFile = join(projectRoot, 'data', 'auth', 'master.key');
    writeFileSync(keyFile, randomBytes(32).toString('base64url'));
    _resetMasterKeyCacheForTest();

    expect(() => decrypt(ct)).toThrow(/auth-tag-invalid/);
  });

  it('密文格式异常 → format-invalid', async () => {
    const { ensureMasterKey, decrypt } = await import('./crypto.js');
    ensureMasterKey();
    expect(() => decrypt('plain')).toThrow(/format-invalid/);
    expect(() => decrypt('enc:v1:onlyone')).toThrow(/format-invalid/);
    expect(() => decrypt('enc:v1:bad@@:bad@@:bad@@')).toThrow(/format-invalid/);
  });

  it('master key 不存在时 decrypt → master-key-missing', async () => {
    const { encrypt, ensureMasterKey, _resetMasterKeyCacheForTest, decrypt } =
      await import('./crypto.js');
    ensureMasterKey();
    const ct = encrypt('hello');

    // 删 key 文件 + 清缓存（模拟主密钥丢失场景）
    const keyFile = join(projectRoot, 'data', 'auth', 'master.key');
    rmSync(keyFile);
    _resetMasterKeyCacheForTest();

    expect(() => decrypt(ct)).toThrow(/master-key-missing/);
  });

  it('encryptOrPassthrough / decryptOrPassthrough 兼容期：明文直读、密文还原', async () => {
    const { ensureMasterKey, encryptOrPassthrough, decryptOrPassthrough, isEncrypted } =
      await import('./crypto.js');
    ensureMasterKey();
    const plain = 'abc';
    const ct = encryptOrPassthrough(plain) as string;
    expect(isEncrypted(ct)).toBe(true);
    // 已加密的再加密保持原样
    expect(encryptOrPassthrough(ct)).toBe(ct);
    // 明文 decrypt 直读
    expect(decryptOrPassthrough('plain')).toBe('plain');
    // 密文 decrypt 还原
    expect(decryptOrPassthrough(ct)).toBe(plain);
    // 非字符串原样
    expect(decryptOrPassthrough(123)).toBe(123);
    expect(decryptOrPassthrough(null)).toBe(null);
  });

  it('getMasterKeyStatus：missing → present 切换', async () => {
    const { getMasterKeyStatus, ensureMasterKey, _resetMasterKeyCacheForTest } =
      await import('./crypto.js');
    expect(getMasterKeyStatus()).toBe('missing');
    ensureMasterKey();
    _resetMasterKeyCacheForTest();
    expect(getMasterKeyStatus()).toBe('present');
  });

  it('SWELL_MASTER_KEY 长度不对 → 抛错', async () => {
    process.env.SWELL_MASTER_KEY = 'too-short';
    const { loadMasterKey } = await import('./crypto.js');
    expect(() => loadMasterKey()).toThrow(/32 bytes/);
  });

  it('master.key 文件保存的内容能往返读出（现有数据）', async () => {
    const { ensureMasterKey, encrypt, _resetMasterKeyCacheForTest, decrypt } =
      await import('./crypto.js');
    ensureMasterKey();
    const ct = encrypt('persistent');

    // 重置缓存模拟进程重启，但文件保留
    _resetMasterKeyCacheForTest();
    expect(decrypt(ct)).toBe('persistent');

    const keyFile = join(projectRoot, 'data', 'auth', 'master.key');
    expect(readFileSync(keyFile, 'utf8').trim()).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
