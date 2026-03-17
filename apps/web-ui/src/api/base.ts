/**
 * API 基础地址，供前端请求后端（swell-lobster serve）。
 * 开发时默认 http://127.0.0.1:18900
 */
const API_BASE =
  (typeof import.meta !== 'undefined' &&
    (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE) ||
  'http://127.0.0.1:18900';

export function getApiBase(): string {
  return API_BASE.replace(/\/$/, '');
}

export async function apiGet<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`);
  if (!res.ok) throw new Error(`API ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function apiPost<T = unknown>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}
