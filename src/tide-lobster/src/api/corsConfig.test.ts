import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createCorsOriginCheck, getCorsOptions } from './corsConfig.js';

describe('corsConfig', () => {
  const oldOrigins = process.env.SWELL_CORS_ORIGINS;
  const oldRemote = process.env.SWELL_REMOTE;

  beforeEach(() => {
    delete process.env.SWELL_CORS_ORIGINS;
    delete process.env.SWELL_REMOTE;
  });

  afterEach(() => {
    if (oldOrigins === undefined) delete process.env.SWELL_CORS_ORIGINS;
    else process.env.SWELL_CORS_ORIGINS = oldOrigins;
    if (oldRemote === undefined) delete process.env.SWELL_REMOTE;
    else process.env.SWELL_REMOTE = oldRemote;
  });

  it('默认白名单含 vite/tauri/127.0.0.1', () => {
    const opts = getCorsOptions();
    expect(opts.allowedOrigins).toContain('http://localhost:5173');
    expect(opts.allowedOrigins).toContain('tauri://localhost');
    expect(opts.allowedOrigins).toContain('http://127.0.0.1:18900');
  });

  it('SWELL_CORS_ORIGINS 追加且去重', () => {
    process.env.SWELL_CORS_ORIGINS =
      'https://my-tablet.local, http://localhost:5173 ,https://other.app';
    const opts = getCorsOptions();
    expect(opts.allowedOrigins).toContain('https://my-tablet.local');
    expect(opts.allowedOrigins).toContain('https://other.app');
    // 重复的 vite 默认值不会出现两次
    const occurrences = opts.allowedOrigins.filter((o) => o === 'http://localhost:5173');
    expect(occurrences.length).toBe(1);
  });

  it('credentials 默认 false；远程模式才打开', () => {
    expect(getCorsOptions().credentials).toBe(false);
    process.env.SWELL_REMOTE = '1';
    expect(getCorsOptions().credentials).toBe(true);
  });

  it('allowHeaders 含 X-Auth-Token', () => {
    expect(getCorsOptions().allowHeaders).toContain('X-Auth-Token');
  });

  it('createCorsOriginCheck：白名单内 origin → 原样返回', () => {
    const check = createCorsOriginCheck(['http://localhost:5173']);
    expect(check('http://localhost:5173')).toBe('http://localhost:5173');
  });

  it('createCorsOriginCheck：非白名单 → null', () => {
    const check = createCorsOriginCheck(['http://localhost:5173']);
    expect(check('https://evil.example')).toBeNull();
  });

  it('createCorsOriginCheck：null origin（字面量字符串）直接拒绝', () => {
    const check = createCorsOriginCheck(['http://localhost:5173']);
    expect(check('null')).toBeNull();
  });

  it('createCorsOriginCheck：缺失 origin（同源 / curl）→ null（不发 ACAO 头即可）', () => {
    const check = createCorsOriginCheck(['http://localhost:5173']);
    expect(check(undefined)).toBeNull();
    expect(check('')).toBeNull();
  });
});
