import { trackGlobalLoading } from '../store/globalLoading';
import { reportFrontendError } from '../logging/frontend';
import { clearTokenCache, resolveAuthToken } from './authToken';

const API_BASE =
  (typeof import.meta !== 'undefined' &&
    (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE) ||
  'http://127.0.0.1:18900';

type RequestOptions = {
  trackLoading?: boolean;
};

export function getApiBase(): string {
  return API_BASE.replace(/\/$/, '');
}

/** 带 X-Auth-Token 的 fetch 包装；用于不走 requestJson 的裸流式请求 */
export async function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = await resolveAuthToken(getApiBase());
  const headers = new Headers(init.headers);
  if (token) headers.set('X-Auth-Token', token);
  return fetch(url, { ...init, headers });
}

export class AuthRequiredError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'AuthRequiredError';
    this.code = code;
  }
}

/** 401 跳转到 Settings/Security 让用户输入 token；可由路由层订阅 */
type AuthListener = (code: string) => void;
const authListeners = new Set<AuthListener>();
export function onAuthRequired(listener: AuthListener): () => void {
  authListeners.add(listener);
  return () => authListeners.delete(listener);
}

async function parseApiError(path: string, res: Response): Promise<never> {
  let detail = '';
  let code = '';
  try {
    const payload = (await res.json()) as { detail?: string; message?: string; code?: string };
    detail = payload.detail || payload.message || '';
    code = payload.code || '';
  } catch {
    detail = '';
  }
  if (res.status === 401) {
    clearTokenCache();
    for (const l of authListeners) {
      try {
        l(code || 'AUTH_REQUIRED');
      } catch {
        // ignore listener errors
      }
    }
    throw new AuthRequiredError(code || 'AUTH_REQUIRED', detail || '未授权，请重新登录');
  }
  const message = detail ? `API ${path}: ${detail}` : `API ${path}: ${res.status}`;
  void reportFrontendError({
    path,
    message,
    context: { status: res.status, statusText: res.statusText, code },
  }).catch(() => {});
  throw new Error(message);
}

export async function apiGet<T = unknown>(path: string, options?: RequestOptions): Promise<T> {
  return requestJson<T>(path, { method: 'GET' }, options);
}

export async function apiPost<T = unknown>(
  path: string,
  body: unknown,
  options?: RequestOptions
): Promise<T> {
  return requestJson<T>(
    path,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    options
  );
}

export async function apiPatch<T = unknown>(
  path: string,
  body: unknown,
  options?: RequestOptions
): Promise<T> {
  return requestJson<T>(
    path,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    options
  );
}

export async function apiPut<T = unknown>(
  path: string,
  body: unknown,
  options?: RequestOptions
): Promise<T> {
  return requestJson<T>(
    path,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    options
  );
}

export async function apiDelete<T = unknown>(path: string, options?: RequestOptions): Promise<T> {
  return requestJson<T>(
    path,
    {
      method: 'DELETE',
    },
    options
  );
}

async function requestJson<T = unknown>(
  path: string,
  init: RequestInit,
  options?: RequestOptions
): Promise<T> {
  const runFetch = async () => {
    // 阶段 15a-5：注入 X-Auth-Token（健康检查与 shutdown 不需要，但顺手注入也无妨）
    const apiBase = getApiBase();
    const token = await resolveAuthToken(apiBase);
    const headers = new Headers(init.headers);
    if (token) headers.set('X-Auth-Token', token);
    const enrichedInit: RequestInit = { ...init, headers };

    let res: Response;
    try {
      res = await fetch(`${apiBase}${path}`, enrichedInit);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void reportFrontendError({
        path,
        message: `API ${path}: network request failed`,
        context: { error: message },
      }).catch(() => {});
      throw error;
    }
    if (!res.ok) return parseApiError(path, res);
    return res.json() as Promise<T>;
  };

  if (options?.trackLoading === false) {
    return runFetch();
  }

  return trackGlobalLoading(runFetch());
}
