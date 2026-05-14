import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('outboundPolicy', () => {
  let repoRoot = '';

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'swell-outbound-policy-test-'));
    mkdirSync(join(repoRoot, 'identity'), { recursive: true });
    mkdirSync(join(repoRoot, 'data'), { recursive: true });
    writeFileSync(join(repoRoot, 'identity', 'assistant.md'), 'You are a test assistant.');
    process.env.SWELL_GLOBAL_ENV_DIR = repoRoot;
    process.env.SWELL_PROJECT_ROOT = repoRoot;
    process.env.SWELL_DATA_DIR = join(repoRoot, 'data');
    process.env.SWELL_IDENTITY_DIR = join(repoRoot, 'identity');
    vi.resetModules();
  });

  afterEach(async () => {
    // 重置沙箱模式，防止状态污染到下一个测试
    const { setSandboxMode, getSandboxAllowlist, removeAllowlistRule } = await import('../store/sandboxConfig.js');
    setSandboxMode('open');
    const list = getSandboxAllowlist();
    for (const rule of list) removeAllowlistRule(rule);

    const { closeDb } = await import('../db/index.js');
    closeDb();
    rmSync(repoRoot, { recursive: true, force: true });
    delete process.env.SWELL_GLOBAL_ENV_DIR;
    delete process.env.SWELL_PROJECT_ROOT;
    delete process.env.SWELL_DATA_DIR;
    delete process.env.SWELL_IDENTITY_DIR;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('open 模式下 checkOutbound 不抛异常', async () => {
    const { checkOutbound } = await import('./outboundPolicy.js');
    expect(() => checkOutbound('https://api.openai.com/v1/chat')).not.toThrow();
    expect(() => checkOutbound('https://example.com/api')).not.toThrow();
  });

  it('open 模式下 isOutboundAllowed 始终返回 true', async () => {
    const { isOutboundAllowed } = await import('./outboundPolicy.js');
    expect(isOutboundAllowed('https://arbitrary-domain.xyz')).toBe(true);
  });

  it('allowlist 模式下，localhost 始终允许', async () => {
    const { setSandboxMode } = await import('../store/sandboxConfig.js');
    const { checkOutbound } = await import('./outboundPolicy.js');
    setSandboxMode('allowlist');
    expect(() => checkOutbound('http://localhost:5173')).not.toThrow();
    expect(() => checkOutbound('http://127.0.0.1:18900/api')).not.toThrow();
  });

  it('allowlist 模式下，非白名单 URL 抛 AppError', async () => {
    const { setSandboxMode } = await import('../store/sandboxConfig.js');
    const { checkOutbound } = await import('./outboundPolicy.js');
    const { AppError } = await import('../types/errors.js');
    setSandboxMode('allowlist');
    expect(() => checkOutbound('https://api.openai.com/v1/chat')).toThrow(AppError);
  });

  it('allowlist 模式下，白名单规则匹配则放行', async () => {
    const { setSandboxMode, addAllowlistRule } = await import('../store/sandboxConfig.js');
    const { checkOutbound } = await import('./outboundPolicy.js');
    setSandboxMode('allowlist');
    addAllowlistRule('api.example.com');
    expect(() => checkOutbound('https://api.example.com/v1/data')).not.toThrow();
  });

  it('allowlist 模式下，通配子域规则匹配', async () => {
    const { setSandboxMode, addAllowlistRule } = await import('../store/sandboxConfig.js');
    const { checkOutbound } = await import('./outboundPolicy.js');
    setSandboxMode('allowlist');
    addAllowlistRule('*.example.com');
    expect(() => checkOutbound('https://api.example.com/endpoint')).not.toThrow();
    expect(() => checkOutbound('https://sub.api.example.com/path')).not.toThrow();
  });

  it('allowlist 模式下，ErrorCode 为 OUTBOUND_POLICY_DENIED', async () => {
    const { setSandboxMode } = await import('../store/sandboxConfig.js');
    const { checkOutbound } = await import('./outboundPolicy.js');
    const { AppError, ErrorCode } = await import('../types/errors.js');
    setSandboxMode('allowlist');
    try {
      checkOutbound('https://blocked.example.org');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as InstanceType<typeof AppError>).code).toBe(ErrorCode.OUTBOUND_POLICY_DENIED);
    }
  });
});
