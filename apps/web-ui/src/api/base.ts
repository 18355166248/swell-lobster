import { trackGlobalLoading } from '../store/globalLoading';
import { reportFrontendError } from '../logging/frontend';

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

async function parseApiError(path: string, res: Response): Promise<never> {
  let detail = '';
  try {
    const payload = (await res.json()) as { detail?: string; message?: string };
    detail = payload.detail || payload.message || '';
  } catch {
    detail = '';
  }
  const message = detail ? `API ${path}: ${detail}` : `API ${path}: ${res.status}`;
  void reportFrontendError({
    path,
    message,
    context: { status: res.status, statusText: res.statusText },
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
    let res: Response;
    try {
      res = await fetch(`${getApiBase()}${path}`, init);
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
