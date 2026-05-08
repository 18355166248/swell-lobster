/**
 * 阶段 15a-4：字段级加密（AES-256-GCM）
 *
 * 主密钥来源（优先级降序）：
 *   1. `SWELL_MASTER_KEY` 环境变量（base64url，32 字节解码）—— 远程模式或运维注入
 *   2. `data/auth/master.key` 文件（base64url 持久化，权限 0600；首启自动生成）
 *
 * 密文格式：`enc:v1:<iv-b64u>:<ciphertext-b64u>:<authTag-b64u>`，所有字段 base64url。
 * - iv 12 字节（GCM 推荐）；密文长度 = 明文长度；authTag 16 字节
 * - 兼容期判定：不以 `enc:` 开头视作明文
 *
 * 模块状态：内存缓存 masterKey；首次调用按上述顺序加载。
 * 主密钥丢失（文件不存在 + env 未设）时仍允许加载（loadMasterKey 返回 null），
 * 上层 secretFields 旁路返回空，避免启动崩溃。
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { settings } from '../config.js';

const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const FILE_MODE_0600 = 0o600;
const DIR_MODE_0700 = 0o700;
const ENC_PREFIX = 'enc:v1:';

let cachedKey: Buffer | null = null;
let cachedKeyAttempted = false;

function masterKeyPath(): string {
  return join(settings.dataDir, 'auth', 'master.key');
}

function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: DIR_MODE_0700 });
  }
}

function decodeBase64url(s: string): Buffer {
  return Buffer.from(s, 'base64url');
}

function encodeBase64url(buf: Buffer): string {
  return buf.toString('base64url');
}

/**
 * 加载主密钥。返回 null 表示既无 env 也无文件——上层走旁路。
 *
 * 重置规则：调用 `resetMasterKeyCacheForTest()` 后下次会重新加载。
 */
export function loadMasterKey(): Buffer | null {
  if (cachedKey) return cachedKey;
  if (cachedKeyAttempted) return null;
  cachedKeyAttempted = true;

  const fromEnv = process.env.SWELL_MASTER_KEY?.trim();
  if (fromEnv) {
    const buf = decodeBase64url(fromEnv);
    if (buf.length !== KEY_BYTES) {
      throw new Error(`SWELL_MASTER_KEY must decode to ${KEY_BYTES} bytes (got ${buf.length})`);
    }
    cachedKey = buf;
    return cachedKey;
  }

  const path = masterKeyPath();
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, 'utf8').trim();
  if (!raw) return null;
  const buf = decodeBase64url(raw);
  if (buf.length !== KEY_BYTES) {
    throw new Error(`master.key must decode to ${KEY_BYTES} bytes (got ${buf.length})`);
  }
  cachedKey = buf;
  return cachedKey;
}

/**
 * 确保主密钥就位：env 优先；否则从文件读，文件不存在则生成并落 0600。
 * 返回主密钥 Buffer。
 *
 * 与 `loadMasterKey` 的区别：本函数会在首启自动生成；用于 sidecar 启动序列。
 */
export function ensureMasterKey(): Buffer {
  const existing = loadMasterKey();
  if (existing) return existing;

  // 没有 env 也没有文件 —— 首启路径，生成并落盘
  const path = masterKeyPath();
  ensureDir(path);
  const key = randomBytes(KEY_BYTES);
  writeFileSync(path, encodeBase64url(key), { mode: FILE_MODE_0600 });
  try {
    chmodSync(path, FILE_MODE_0600);
  } catch {
    // 非 POSIX 平台忽略
  }
  cachedKey = key;
  cachedKeyAttempted = true;
  return key;
}

/** 仅供测试：清缓存，让下次调用重新读 env / 文件 */
export function _resetMasterKeyCacheForTest(): void {
  cachedKey = null;
  cachedKeyAttempted = false;
}

/** 主密钥状态（前端 Settings/Security 用） */
export type MasterKeyStatus = 'present' | 'missing';

export function getMasterKeyStatus(): MasterKeyStatus {
  return loadMasterKey() ? 'present' : 'missing';
}

/** 判断字符串是否为本模块产出的密文 */
export function isEncrypted(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX);
}

/**
 * 加密：明文 string → 密文 `enc:v1:...`。
 * 主密钥未就位时抛错（调用者应先 `ensureMasterKey()` 或检查 `getMasterKeyStatus()`）。
 */
export function encrypt(plaintext: string): string {
  const key = loadMasterKey();
  if (!key) throw new Error('master key not initialized; call ensureMasterKey() first');
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  if (tag.length !== TAG_BYTES) {
    throw new Error(`unexpected auth tag length: ${tag.length}`);
  }
  return `${ENC_PREFIX}${encodeBase64url(iv)}:${encodeBase64url(ct)}:${encodeBase64url(tag)}`;
}

/**
 * 解密：密文 `enc:v1:...` → 明文。
 * 失败原因（按抛错顺序）：
 *   - master key 未就位 → 'master-key-missing'
 *   - 格式不匹配 → 'format-invalid'
 *   - GCM auth tag 不通过（密文/key/iv/tag 任一被改）→ 'auth-tag-invalid'
 */
export function decrypt(ciphertext: string): string {
  if (!isEncrypted(ciphertext)) {
    throw new Error('format-invalid: not an encrypted value');
  }
  const key = loadMasterKey();
  if (!key) throw new Error('master-key-missing');

  const body = ciphertext.slice(ENC_PREFIX.length);
  const parts = body.split(':');
  if (parts.length !== 3) throw new Error('format-invalid: expected 3 base64url parts');

  const [ivB64, ctB64, tagB64] = parts;
  let iv: Buffer;
  let ct: Buffer;
  let tag: Buffer;
  try {
    iv = decodeBase64url(ivB64);
    ct = decodeBase64url(ctB64);
    tag = decodeBase64url(tagB64);
  } catch (e) {
    throw new Error(`format-invalid: base64url decode failed: ${(e as Error).message}`);
  }
  if (iv.length !== IV_BYTES) throw new Error(`format-invalid: iv length ${iv.length}`);
  if (tag.length !== TAG_BYTES) throw new Error(`format-invalid: tag length ${tag.length}`);

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  try {
    const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
    return plain.toString('utf8');
  } catch (e) {
    throw new Error(`auth-tag-invalid: ${(e as Error).message}`);
  }
}

/** 兼容期：明文直读，密文解密；其他类型原样返回 */
export function decryptOrPassthrough(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  if (!isEncrypted(value)) return value; // 兼容期：不以 enc: 开头视作明文
  return decrypt(value);
}

/** 兼容期：明文加密，已加密的原样返回 */
export function encryptOrPassthrough(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  if (isEncrypted(value)) return value;
  return encrypt(value);
}
