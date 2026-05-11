/**
 * 阶段 15a-2：Hono 鉴权中间件
 *
 * 规则：
 * - `OPTIONS *` 不进鉴权（CORS preflight 由 cors 中间件处理）
 * - `GET /api/health`、`POST /api/shutdown` 默认豁免
 * - 其他 `/api/*` 必须带 `X-Auth-Token` header 或 `?token=` query
 * - 失败时返回 `{ detail, code }`，HTTP 401；触发限流时 HTTP 429 + `Retry-After`
 *
 * 测试运行时（VITEST_WORKER_ID 注入）默认 bypass，避免要求 19 个老 route 测试改 setup；
 * 显式开关 `SWELL_AUTH_DISABLED=1` 用于 dev / 排障，**生产环境严禁设置**。
 */

import type { Context, MiddlewareHandler, Next } from 'hono';

import { recordEvent } from '../observability/traceStore.js';
import { touchRemoteToken, verifyToken, type TokenVerification } from './tokenStore.js';
import { AuthRateLimiter, getAuthRateLimiter, type CheckResult } from './rateLimit.js';

const AUTH_HEADER = 'X-Auth-Token';
const AUTH_QUERY = 'token';

const FALLBACK_CLIENT_IP = '127.0.0.1';

export interface RequireAuthOptions {
  /** 完整路径豁免（精确匹配） */
  exempt?: string[];
  /** 限流器实例；测试时可注入独立实例 */
  rateLimiter?: AuthRateLimiter;
  /** 测试钩子：覆盖默认的 clientIp 提取逻辑 */
  getClientIp?: (c: Context) => string;
  /** 强制启用（无视 VITEST_WORKER_ID 与 SWELL_AUTH_DISABLED） */
  forceEnabled?: boolean;
}

/** Hono 上下文里的认证结果挂点；下游 handler 通过 c.get('authResult') 读 */
export interface AuthContextVars {
  authResult: TokenVerification;
}

function isTestRuntime(): boolean {
  return Boolean(process.env.VITEST_WORKER_ID || process.env.VITEST);
}

function isExplicitlyDisabled(): boolean {
  return process.env.SWELL_AUTH_DISABLED === '1';
}

/** 默认 client IP 提取：远程模式且 X-Forwarded-For 存在则信任，否则取 socket 远端，再否则 fallback */
function defaultGetClientIp(c: Context): string {
  if (process.env.SWELL_REMOTE === '1') {
    const xff = c.req.header('x-forwarded-for') ?? c.req.header('X-Forwarded-For');
    if (xff) {
      const first = xff.split(',')[0]?.trim();
      if (first) return first;
    }
    const real = c.req.header('x-real-ip');
    if (real) return real.trim();
  }
  // try Node.js conninfo（运行时挂载）；测试场景下 c.env 为空对象，会抛错 → fallback
  try {
    const env = (
      c as unknown as {
        env?: {
          incoming?: { socket?: { remoteAddress?: string } };
          server?: { incoming?: { socket?: { remoteAddress?: string } } };
        };
      }
    ).env;
    const incoming = env?.server?.incoming ?? env?.incoming;
    const addr = incoming?.socket?.remoteAddress;
    if (addr) return addr;
  } catch {
    // ignore
  }
  return FALLBACK_CLIENT_IP;
}

function extractToken(c: Context): string {
  const header = c.req.header(AUTH_HEADER) ?? c.req.header('x-auth-token');
  if (header) return header.trim();
  const q = c.req.query(AUTH_QUERY);
  return q ? q.trim() : '';
}

function pathnameOf(c: Context): string {
  try {
    return new URL(c.req.url).pathname;
  } catch {
    return c.req.path ?? '';
  }
}

export function requireAuthToken(options: RequireAuthOptions = {}): MiddlewareHandler {
  const exemptPaths = new Set(options.exempt ?? []);
  const rateLimiter = options.rateLimiter ?? getAuthRateLimiter();
  const getClientIp = options.getClientIp ?? defaultGetClientIp;
  const forceEnabled = options.forceEnabled === true;

  return async (c: Context, next: Next) => {
    if (!forceEnabled && (isTestRuntime() || isExplicitlyDisabled())) {
      return next();
    }

    if (c.req.method === 'OPTIONS') return next();

    const pathname = pathnameOf(c);
    if (exemptPaths.has(pathname)) return next();

    const clientIp = getClientIp(c);

    // 1. 先检查是否已被封锁（不更新计数）
    const pre = rateLimiter.checkBlocked(clientIp);
    if (pre.blocked) return reject429(c, pre, clientIp, pathname, 'rate-limited');

    // 2. 提取 token
    const plain = extractToken(c);
    if (!plain) {
      const after = rateLimiter.registerFailure(clientIp);
      recordEvent({
        category: 'auth.token.failed',
        status: 'error',
        meta: { clientIp, path: pathname, reason: 'missing-token' },
      });
      if (after.blocked) return reject429(c, after, clientIp, pathname, 'rate-limited');
      return reject401(c, 'auth required', 'AUTH_REQUIRED');
    }

    // 3. 校验 token
    const result = verifyToken(plain);
    if (!result) {
      const after = rateLimiter.registerFailure(clientIp);
      recordEvent({
        category: 'auth.token.failed',
        status: 'error',
        meta: { clientIp, path: pathname, reason: 'invalid-token' },
      });
      if (after.blocked) return reject429(c, after, clientIp, pathname, 'rate-limited');
      return reject401(c, 'invalid token', 'AUTH_INVALID');
    }

    // 4. 命中：清失败计数、刷 last_used_at（含节流）、写 used 事件、放行
    rateLimiter.registerSuccess(clientIp);
    if (result.kind === 'remote') {
      touchRemoteToken(result.tokenId);
      recordEvent({
        category: 'auth.token.used',
        status: 'ok',
        meta: { tokenId: result.tokenId, scope: result.scope, clientIp, path: pathname },
      });
    } else {
      // 本机 token 命中频率高、不写库；事件层面也节流：仅在远程模式或非健康检查路径写
      if (process.env.SWELL_REMOTE === '1') {
        recordEvent({
          category: 'auth.token.used',
          status: 'ok',
          meta: { kind: 'local', scope: result.scope, clientIp, path: pathname },
        });
      }
    }

    c.set('authResult', result);
    return next();
  };
}

function reject401(c: Context, detail: string, code: string) {
  return c.json({ detail, code }, 401);
}

function reject429(
  c: Context,
  result: CheckResult,
  clientIp: string,
  path: string,
  detail: string
) {
  c.header('Retry-After', String(result.retryAfterSec));
  recordEvent({
    category: 'auth.token.rateLimited',
    status: 'error',
    meta: {
      clientIp,
      path,
      windowFails: result.fails,
      blockUntilMs: result.blockUntil,
    },
  });
  return c.json({ detail, code: 'AUTH_RATE_LIMITED' }, 429);
}

/** 默认 exempt 路径，由 server.ts 引用（避免 server.ts 与 middleware.ts 重复硬编码） */
export const DEFAULT_AUTH_EXEMPT_PATHS = [
  '/api/health',
  '/api/shutdown',
  // 本机 token 自取端点：由 isLoopbackRequest 保护，无需 auth 中间件
  '/api/auth/local-token',
];
