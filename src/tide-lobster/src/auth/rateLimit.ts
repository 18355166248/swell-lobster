/**
 * 阶段 15a-2：暴破限流（auth rate-limit）
 *
 * 内存滑动窗口，按 clientIp 计数鉴权失败次数；达阈值后封锁该 IP 一段时间。
 * 参照 openclaw `src/gateway/auth-rate-limit.ts` 的最小可用子集，**只算失败**——
 * 命中成功直接清零，不串扰正常请求。
 *
 * 中间件挂载与事件写入在 middleware.ts 完成；本模块只暴露纯函数。
 */

const DEFAULT_WINDOW_MS = 60_000; // 60s
const DEFAULT_MAX_FAILS = 10;
const DEFAULT_BLOCK_MS = 5 * 60_000; // 5min
const BUCKET_MAX_ENTRIES = 10_000; // 防 DoS 自爆

interface BucketEntry {
  /** 失败时间戳列表（毫秒），仅保留 windowMs 内的 */
  fails: number[];
  /** 当前封锁结束时间戳（毫秒）；0 表示未封锁 */
  blockUntil: number;
}

export interface RateLimitConfig {
  windowMs: number;
  maxFails: number;
  blockMs: number;
  /** loopback IP 默认豁免（127.0.0.1 / ::1）；远程模式可关闭 */
  loopbackExempt: boolean;
}

export interface CheckResult {
  blocked: boolean;
  /** 当前窗口内失败次数（含本次） */
  fails: number;
  /** 若 blocked，封锁至该绝对时间戳 */
  blockUntil: number;
  /** 距解封剩余秒数（向上取整），用于 Retry-After 头 */
  retryAfterSec: number;
}

function loadDefaultConfig(): RateLimitConfig {
  const num = (raw: string | undefined, fallback: number): number => {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return {
    windowMs: num(process.env.SWELL_AUTH_RL_WINDOW_MS, DEFAULT_WINDOW_MS),
    maxFails: num(process.env.SWELL_AUTH_RL_MAX, DEFAULT_MAX_FAILS),
    blockMs: num(process.env.SWELL_AUTH_RL_BLOCK_MS, DEFAULT_BLOCK_MS),
    loopbackExempt: process.env.SWELL_REMOTE !== '1',
  };
}

const LOOPBACK_IPS = new Set(['127.0.0.1', '::1', 'localhost']);

export function isLoopback(ip: string): boolean {
  return LOOPBACK_IPS.has(ip);
}

/**
 * 限流器实例：在中间件里持有一个全局单例；测试可显式 new 一个新的避免串扰。
 */
export class AuthRateLimiter {
  private buckets = new Map<string, BucketEntry>();
  private config: RateLimitConfig;

  constructor(config?: Partial<RateLimitConfig>) {
    const def = loadDefaultConfig();
    this.config = { ...def, ...config };
  }

  /** 暴露给测试：动态调整配置 */
  reconfigure(patch: Partial<RateLimitConfig>): void {
    this.config = { ...this.config, ...patch };
  }

  getConfig(): Readonly<RateLimitConfig> {
    return this.config;
  }

  /** 仅供测试：清空所有桶 */
  reset(): void {
    this.buckets.clear();
  }

  /**
   * 记录一次鉴权失败；返回当前 IP 的状态（含是否触发封锁）。
   * loopback 豁免时直接返回 unblocked 且不计入桶。
   */
  registerFailure(clientIp: string, now: number = Date.now()): CheckResult {
    if (this.shouldExempt(clientIp)) {
      return { blocked: false, fails: 0, blockUntil: 0, retryAfterSec: 0 };
    }
    this.gcIfNeeded();

    const bucket = this.getOrCreateBucket(clientIp);
    if (bucket.blockUntil > now) {
      // 封锁期内再来失败也不延长封锁时间，但仍报已封锁
      return this.toResult(true, bucket.fails.length, bucket.blockUntil, now);
    }

    // 清掉窗口外的失败
    const cutoff = now - this.config.windowMs;
    bucket.fails = bucket.fails.filter((t) => t > cutoff);
    bucket.fails.push(now);

    if (bucket.fails.length >= this.config.maxFails) {
      bucket.blockUntil = now + this.config.blockMs;
      return this.toResult(true, bucket.fails.length, bucket.blockUntil, now);
    }
    return this.toResult(false, bucket.fails.length, 0, now);
  }

  /**
   * 仅检查当前 IP 是否在封锁期，不修改状态。
   * 用于在收到请求时先校验，避免封锁期内反复跑校验逻辑。
   */
  checkBlocked(clientIp: string, now: number = Date.now()): CheckResult {
    if (this.shouldExempt(clientIp)) {
      return { blocked: false, fails: 0, blockUntil: 0, retryAfterSec: 0 };
    }
    const bucket = this.buckets.get(clientIp);
    if (!bucket) return { blocked: false, fails: 0, blockUntil: 0, retryAfterSec: 0 };
    if (bucket.blockUntil > now) {
      return this.toResult(true, bucket.fails.length, bucket.blockUntil, now);
    }
    return this.toResult(false, bucket.fails.length, 0, now);
  }

  /** 鉴权成功后调用：清空该 IP 的失败计数（不解封正在封锁的桶——封锁期不变）。 */
  registerSuccess(clientIp: string): void {
    if (this.shouldExempt(clientIp)) return;
    const bucket = this.buckets.get(clientIp);
    if (!bucket) return;
    if (bucket.blockUntil > Date.now()) return; // 封锁期内不清零，等过期
    this.buckets.delete(clientIp);
  }

  private shouldExempt(clientIp: string): boolean {
    return this.config.loopbackExempt && isLoopback(clientIp);
  }

  private getOrCreateBucket(clientIp: string): BucketEntry {
    let bucket = this.buckets.get(clientIp);
    if (!bucket) {
      bucket = { fails: [], blockUntil: 0 };
      this.buckets.set(clientIp, bucket);
    }
    return bucket;
  }

  /**
   * 桶过多时清掉已过期且未封锁的条目，避免占内存。
   * 不在每次失败都做完整 GC（O(n)），只在 size 超阈值时触发。
   */
  private gcIfNeeded(): void {
    if (this.buckets.size < BUCKET_MAX_ENTRIES) return;
    const now = Date.now();
    const cutoff = now - this.config.windowMs;
    for (const [ip, bucket] of this.buckets) {
      if (bucket.blockUntil > now) continue;
      if (bucket.fails.length === 0 || bucket.fails[bucket.fails.length - 1] <= cutoff) {
        this.buckets.delete(ip);
      }
    }
  }

  private toResult(blocked: boolean, fails: number, blockUntil: number, now: number): CheckResult {
    const retryAfterSec = blocked ? Math.max(1, Math.ceil((blockUntil - now) / 1000)) : 0;
    return { blocked, fails, blockUntil, retryAfterSec };
  }
}

/** 全局单例（middleware 用），测试可不通过此单例直接 new 实例 */
let sharedLimiter: AuthRateLimiter | null = null;

export function getAuthRateLimiter(): AuthRateLimiter {
  if (!sharedLimiter) sharedLimiter = new AuthRateLimiter();
  return sharedLimiter;
}

/** 仅供测试：替换全局单例 */
export function _setSharedAuthRateLimiterForTest(limiter: AuthRateLimiter | null): void {
  sharedLimiter = limiter;
}
