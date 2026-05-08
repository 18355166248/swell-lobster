/**
 * 阶段 15a-5：本机访问令牌客户端缓存
 *
 * 优先级：
 *   1. Tauri 模式：`window.__TAURI_INTERNALS__.invoke('get_local_token')` —— 桌面端 sidecar 写文件、Rust 命令读文件
 *   2. 同源 / 反代：GET /api/auth/local-token —— 仅 loopback 来源放行
 *   3. 上述失败：fallback 到 `localStorage.swell_token`（用户在 Settings/Security 手动输入）
 *
 * 内存缓存一份，避免每次请求都走 invoke / 网络。401 时调 `clearTokenCache()` 强制刷新。
 */

const STORAGE_KEY = 'swell_token';

let cached: string | null = null;
let inflight: Promise<string | null> | null = null;

declare global {
  interface Window {
    __TAURI_INTERNALS__?: {
      invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
    };
  }
}

function readStorage(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string): void {
  cached = token.trim() || null;
  try {
    if (cached) localStorage.setItem(STORAGE_KEY, cached);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore (privacy mode)
  }
}

export function clearTokenCache(): void {
  cached = null;
  inflight = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

async function fromTauri(): Promise<string | null> {
  const tauri = window.__TAURI_INTERNALS__;
  if (!tauri) return null;
  try {
    const t = await tauri.invoke('get_local_token');
    return typeof t === 'string' && t.length > 0 ? t : null;
  } catch {
    return null;
  }
}

async function fromHttp(apiBase: string): Promise<string | null> {
  try {
    const res = await fetch(`${apiBase}/api/auth/local-token`, { method: 'GET' });
    if (!res.ok) return null;
    const body = (await res.json()) as { token?: string };
    return typeof body.token === 'string' && body.token.length > 0 ? body.token : null;
  } catch {
    return null;
  }
}

/**
 * 解析当前可用的访问令牌；走优先级链。
 * 多次并发调用共享同一 in-flight Promise，避免重复请求。
 */
export async function resolveAuthToken(apiBase: string): Promise<string | null> {
  if (cached) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    const fromStorage = readStorage();
    if (fromStorage) {
      cached = fromStorage;
      return cached;
    }
    const fromTauriResult = await fromTauri();
    if (fromTauriResult) {
      cached = fromTauriResult;
      return cached;
    }
    const fromHttpResult = await fromHttp(apiBase);
    if (fromHttpResult) {
      cached = fromHttpResult;
      return cached;
    }
    return null;
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}
