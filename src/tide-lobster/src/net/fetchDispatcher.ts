/**
 * LLM / bridge 共用的 undici dispatcher：按 URL 决定直连或走 HTTP(S)_PROXY，并遵守 NO_PROXY。
 *
 * 须显式传入 fetch({ dispatcher })，否则仅用 index.ts 的 setGlobalDispatcher(ProxyAgent) 时，
 * 「省略 dispatcher」仍会走全局代理，NO_PROXY 对某主机应直连时无法生效，易出现 TLS ECONNRESET。
 */

import { Agent, ProxyAgent, setGlobalDispatcher } from 'undici';
import type { Dispatcher } from 'undici';

function shouldBypassProxy(hostname: string, noProxyRaw: string): boolean {
  const h = hostname.toLowerCase();
  for (const part of noProxyRaw.split(',')) {
    const pat = part.trim().toLowerCase();
    if (!pat) continue;
    if (pat === '*') return true;
    if (pat.startsWith('.')) {
      const root = pat.slice(1);
      if (h === root || h.endsWith(pat)) return true;
    } else if (h === pat || h.endsWith(`.${pat}`)) return true;
  }
  return false;
}

function proxyUrlForTarget(targetUrl: string): string | undefined {
  let hostname: string;
  try {
    hostname = new URL(targetUrl).hostname;
  } catch {
    return undefined;
  }
  const noProxy = process.env.NO_PROXY ?? process.env.no_proxy ?? '';
  if (noProxy && shouldBypassProxy(hostname, noProxy)) return undefined;

  const isHttps = targetUrl.startsWith('https:');
  const raw = isHttps
    ? (process.env.HTTPS_PROXY ??
      process.env.https_proxy ??
      process.env.ALL_PROXY ??
      process.env.all_proxy)
    : (process.env.HTTP_PROXY ??
      process.env.http_proxy ??
      process.env.ALL_PROXY ??
      process.env.all_proxy);
  const trimmed = raw?.trim();
  return trimmed || undefined;
}

const directDispatcher = new Agent();

let cachedProxyUrl: string | undefined;
let cachedProxyAgent: ProxyAgent | undefined;

/** 每个请求 URL 对应：直连 Agent 或缓存的 ProxyAgent（覆盖全局 dispatcher 语义） */
export function getFetchDispatcherForUrl(url: string): Dispatcher {
  const proxyUrl = proxyUrlForTarget(url);
  if (!proxyUrl) return directDispatcher;
  if (cachedProxyUrl === proxyUrl && cachedProxyAgent) return cachedProxyAgent;
  void cachedProxyAgent?.close();
  cachedProxyAgent = new ProxyAgent(proxyUrl);
  cachedProxyUrl = proxyUrl;
  return cachedProxyAgent;
}

/**
 * 设置全局 undici dispatcher，使所有 native fetch 调用（包括 grammy 等三方库）自动走代理。
 * 仅当 HTTPS_PROXY / HTTP_PROXY 等变量存在时生效；不影响已显式传入 dispatcher 的调用。
 */
export function setupGlobalProxy(): void {
  const proxyUrl =
    process.env.HTTPS_PROXY ??
    process.env.https_proxy ??
    process.env.HTTP_PROXY ??
    process.env.http_proxy;
  if (!proxyUrl?.trim()) return;
  setGlobalDispatcher(new ProxyAgent(proxyUrl.trim()));
  console.log('[proxy] global dispatcher set:', proxyUrl.trim());
}
