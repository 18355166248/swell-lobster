/**
 * 统一出站网络策略层
 *
 * 支持两种模式：
 *   open      — 默认，允许所有出站请求（与阶段 15 之前行为一致）
 *   allowlist — 仅允许白名单中的主机/Origin；不在列表内的目标抛 AppError
 *
 * 白名单规则格式（同 originAllowlist.ts，向后兼容）：
 *   - 纯主机名：           example.com
 *   - 带端口：             example.com:8080
 *   - 通配子域：           *.example.com
 *   - 含协议：             https://example.com
 *   - 含协议 + 通配子域：  https://*.example.com
 *
 * 默认内置白名单（allowlist 模式下始终有效）：
 *   localhost、127.0.0.1、::1
 */

import { AppError, ErrorCode } from '../types/errors.js';
import { getSandboxConfig } from '../store/sandboxConfig.js';

interface OriginRule {
  protocol?: string;
  hostname: string;
  wildcard: boolean;
  port?: string;
}

function normalizeRule(input: string): OriginRule | null {
  if (!input) return null;

  if (input.includes('://')) {
    try {
      const url = new URL(input);
      const hostname = url.hostname.toLowerCase();
      const wildcard = hostname.startsWith('*.');
      return {
        protocol: url.protocol,
        hostname: wildcard ? hostname.slice(2) : hostname,
        wildcard,
        port: url.port || undefined,
      };
    } catch {
      return null;
    }
  }

  const [hostPart, portPart] = input.split(':');
  const hostname = hostPart?.trim().toLowerCase();
  if (!hostname) return null;
  const wildcard = hostname.startsWith('*.');
  return {
    hostname: wildcard ? hostname.slice(2) : hostname,
    wildcard,
    port: portPart?.trim() || undefined,
  };
}

function hostnameMatches(rule: OriginRule, hostname: string): boolean {
  if (rule.wildcard) {
    return hostname === rule.hostname || hostname.endsWith(`.${rule.hostname}`);
  }
  return hostname === rule.hostname;
}

const DEFAULT_ALLOWED_HOSTS = ['localhost', '127.0.0.1', '::1'];

function isUrlAllowedByRules(targetUrl: string, rules: OriginRule[]): boolean {
  let url: URL;
  try {
    url = new URL(targetUrl);
  } catch {
    return false;
  }

  const hostname = url.hostname.toLowerCase();
  const port = url.port || undefined;
  const protocol = url.protocol;

  return rules.some((rule) => {
    if (rule.protocol && rule.protocol !== protocol) return false;
    if (rule.port && rule.port !== port) return false;
    return hostnameMatches(rule, hostname);
  });
}

/**
 * 统一出站策略检查。
 *
 * - open 模式：无操作，直接返回
 * - allowlist 模式：URL 不在白名单则抛 AppError(403, PERMISSION_DENIED)
 *
 * 调用方应在发出 HTTP 请求或建立 TCP 连接前调用此函数。
 */
export function checkOutbound(targetUrl: string, toolName?: string): void {
  const config = getSandboxConfig();
  if (config.mode === 'open') return;

  const customRules = [
    ...DEFAULT_ALLOWED_HOSTS,
    ...config.allowlist,
  ]
    .map(normalizeRule)
    .filter((r): r is OriginRule => r !== null);

  if (!isUrlAllowedByRules(targetUrl, customRules)) {
    const tool = toolName ? ` (工具：${toolName})` : '';
    throw new AppError(
      `出站策略拒绝：目标 ${targetUrl} 不在允许列表中${tool}。请在"安全 → 沙箱与网络"中添加白名单规则，或切换为开放模式。`,
      ErrorCode.OUTBOUND_POLICY_DENIED,
      403
    );
  }
}

/**
 * 仅检查，不抛异常，返回布尔值。
 * 用于日志记录或条件判断场景。
 */
export function isOutboundAllowed(targetUrl: string): boolean {
  const config = getSandboxConfig();
  if (config.mode === 'open') return true;

  const customRules = [
    ...DEFAULT_ALLOWED_HOSTS,
    ...config.allowlist,
  ]
    .map(normalizeRule)
    .filter((r): r is OriginRule => r !== null);

  return isUrlAllowedByRules(targetUrl, customRules);
}
