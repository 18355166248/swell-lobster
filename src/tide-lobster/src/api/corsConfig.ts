/**
 * 阶段 15a-3：CORS 配置
 *
 * 替换原 `origin: '*'`，按白名单放行。
 *
 * 默认白名单：
 *   - http://localhost:5173      （Vite dev）
 *   - tauri://localhost          （Tauri webview）
 *   - http://127.0.0.1:18900     （直连 sidecar）
 *
 * 追加：`SWELL_CORS_ORIGINS` env，逗号分隔。
 *
 * 安全约束（与 openclaw `origin-check.ts` 对齐）：
 *   - `null` origin（来自 file:// / sandboxed iframe）直接拒绝
 *   - 不做 `Host` header 兜底（本仓没有 control-ui 多入口需求）
 *   - `credentials: true` 仅在远程模式（SWELL_REMOTE=1）开启
 *   - `allowHeaders` 含 `X-Auth-Token`
 */

const DEFAULT_ORIGINS: readonly string[] = [
  'http://localhost:5173',
  'tauri://localhost',
  'http://127.0.0.1:18900',
] as const;

export interface CorsOptions {
  /** 允许的 origin 列表（精确匹配） */
  allowedOrigins: string[];
  /** 是否带 cookie/credentials；远程模式才开 */
  credentials: boolean;
  allowHeaders: string[];
  allowMethods: string[];
}

function parseOriginsEnv(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function getCorsOptions(): CorsOptions {
  const extras = parseOriginsEnv(process.env.SWELL_CORS_ORIGINS);
  const merged = Array.from(new Set([...DEFAULT_ORIGINS, ...extras]));
  return {
    allowedOrigins: merged,
    credentials: process.env.SWELL_REMOTE === '1',
    allowHeaders: ['Content-Type', 'Authorization', 'X-Auth-Token'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  };
}

/**
 * Hono `cors` 的 origin 函数：
 * - 命中白名单 → 返回原 origin（让浏览器认账）
 * - 不命中 / null origin / 缺失 → 返回 null（hono cors 在收到 null 时会不发 ACAO 头，浏览器拒）
 *
 * 同源请求（无 Origin header）：直接返回 null —— 这种请求浏览器不要 ACAO 头也能继续，不会拒绝。
 */
export function createCorsOriginCheck(allowedOrigins: string[]) {
  const allow = new Set(allowedOrigins);
  return (origin: string | undefined): string | null => {
    // origin 缺失：同源或非浏览器请求；不发 ACAO 头即可
    if (origin === undefined || origin === '') return null;
    // 字面量 'null'：来自 file:// / sandboxed iframe，必须显式拒
    if (origin === 'null') return null;
    if (allow.has(origin)) return origin;
    return null;
  };
}
