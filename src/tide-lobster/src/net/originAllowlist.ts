import { readConfiguredEnvValueAny } from '../config.js';

const DEFAULT_ALLOWED_HOSTS = ['localhost', '127.0.0.1', '::1'] as const;
const ALLOWLIST_ENV_NAMES = [
  'SWELL_BROWSER_ALLOWED_ORIGINS',
  'SWELL_AUTOMATION_ALLOWED_ORIGINS',
  'SWELL_CORS_ORIGINS',
] as const;

interface OriginRule {
  protocol?: string;
  hostname: string;
  wildcard: boolean;
  port?: string;
}

function parseCommaSeparated(raw: string): string[] {
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
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

function buildRules(): OriginRule[] {
  const configured = ALLOWLIST_ENV_NAMES.flatMap((envName) =>
    parseCommaSeparated(readConfiguredEnvValueAny([envName]))
  );
  const merged = Array.from(new Set([...DEFAULT_ALLOWED_HOSTS, ...configured]));
  return merged.map(normalizeRule).filter((rule): rule is OriginRule => Boolean(rule));
}

function hostnameMatches(rule: OriginRule, hostname: string): boolean {
  if (rule.wildcard) {
    return hostname === rule.hostname || hostname.endsWith(`.${rule.hostname}`);
  }
  return hostname === rule.hostname;
}

export function isOriginAllowed(targetUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(targetUrl);
  } catch {
    return false;
  }

  const hostname = url.hostname.toLowerCase();
  const port = url.port || undefined;
  const protocol = url.protocol;

  return buildRules().some((rule) => {
    if (rule.protocol && rule.protocol !== protocol) return false;
    if (rule.port && rule.port !== port) return false;
    return hostnameMatches(rule, hostname);
  });
}

