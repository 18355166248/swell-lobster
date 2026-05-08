import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import { AuthRateLimiter, isLoopback } from './rateLimit.js';

describe('AuthRateLimiter', () => {
  const remoteEnv = process.env.SWELL_REMOTE;

  beforeEach(() => {
    delete process.env.SWELL_REMOTE;
  });

  afterEach(() => {
    if (remoteEnv === undefined) delete process.env.SWELL_REMOTE;
    else process.env.SWELL_REMOTE = remoteEnv;
  });

  it('isLoopback 识别 127.0.0.1 / ::1 / localhost', () => {
    expect(isLoopback('127.0.0.1')).toBe(true);
    expect(isLoopback('::1')).toBe(true);
    expect(isLoopback('localhost')).toBe(true);
    expect(isLoopback('203.0.113.1')).toBe(false);
  });

  it('loopback 默认豁免：失败不计入桶', () => {
    const rl = new AuthRateLimiter({ maxFails: 3, windowMs: 60_000, blockMs: 60_000 });
    for (let i = 0; i < 10; i++) {
      const r = rl.registerFailure('127.0.0.1');
      expect(r.blocked).toBe(false);
      expect(r.fails).toBe(0);
    }
  });

  it('远程 IP 累计失败，到阈值触发封锁，返回 retryAfterSec ≥ 1', () => {
    const rl = new AuthRateLimiter({ maxFails: 3, windowMs: 60_000, blockMs: 60_000 });
    expect(rl.registerFailure('1.2.3.4').blocked).toBe(false);
    expect(rl.registerFailure('1.2.3.4').blocked).toBe(false);
    const trigger = rl.registerFailure('1.2.3.4');
    expect(trigger.blocked).toBe(true);
    expect(trigger.fails).toBe(3);
    expect(trigger.retryAfterSec).toBeGreaterThanOrEqual(1);
    expect(trigger.blockUntil).toBeGreaterThan(Date.now());
  });

  it('封锁期内 checkBlocked 持续返回 blocked', () => {
    const rl = new AuthRateLimiter({ maxFails: 1, windowMs: 60_000, blockMs: 60_000 });
    rl.registerFailure('1.2.3.4');
    expect(rl.checkBlocked('1.2.3.4').blocked).toBe(true);
    // 不影响其他 IP
    expect(rl.checkBlocked('5.6.7.8').blocked).toBe(false);
  });

  it('滑动窗口：windowMs 之外的失败不再计入', () => {
    const rl = new AuthRateLimiter({ maxFails: 3, windowMs: 1000, blockMs: 60_000 });
    const t0 = 1_700_000_000_000;
    rl.registerFailure('1.2.3.4', t0);
    rl.registerFailure('1.2.3.4', t0 + 100);
    // t0+2000 已经超出窗口，前两条应被丢弃
    const r = rl.registerFailure('1.2.3.4', t0 + 2000);
    expect(r.fails).toBe(1);
    expect(r.blocked).toBe(false);
  });

  it('registerSuccess 清失败计数，但不解封正在封锁的桶', () => {
    const rl = new AuthRateLimiter({ maxFails: 2, windowMs: 60_000, blockMs: 60_000 });
    rl.registerFailure('1.2.3.4');
    rl.registerSuccess('1.2.3.4');
    // 清零后再来一次失败，仍未达阈值
    expect(rl.registerFailure('1.2.3.4').blocked).toBe(false);

    // 再次触发封锁
    expect(rl.registerFailure('1.2.3.4').blocked).toBe(true);
    rl.registerSuccess('1.2.3.4'); // 封锁期内不应解封
    expect(rl.checkBlocked('1.2.3.4').blocked).toBe(true);
  });

  it('远程模式可以关闭 loopback 豁免', () => {
    process.env.SWELL_REMOTE = '1';
    const rl = new AuthRateLimiter({ maxFails: 2, windowMs: 60_000, blockMs: 60_000 });
    expect(rl.getConfig().loopbackExempt).toBe(false);
    rl.registerFailure('127.0.0.1');
    const second = rl.registerFailure('127.0.0.1');
    expect(second.blocked).toBe(true);
  });

  it('reconfigure 可动态调整阈值', () => {
    const rl = new AuthRateLimiter({ maxFails: 100 });
    rl.reconfigure({ maxFails: 1 });
    const r = rl.registerFailure('9.9.9.9');
    expect(r.blocked).toBe(true);
  });
});
