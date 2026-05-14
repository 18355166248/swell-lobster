import { KeyValueStore } from './keyValueStore.js';

export type OutboundMode = 'open' | 'allowlist';

export interface SandboxConfig {
  mode: OutboundMode;
  allowlist: string[];
}

const KEY_MODE = 'sandbox.outbound.mode';
const KEY_ALLOWLIST = 'sandbox.outbound.allowlist';

const kv = new KeyValueStore();

export function getSandboxConfig(): SandboxConfig {
  const rawMode = kv.getValue(KEY_MODE);
  const mode: OutboundMode =
    rawMode === 'allowlist' ? 'allowlist' : 'open';

  let allowlist: string[] = [];
  const rawList = kv.getValue(KEY_ALLOWLIST);
  if (rawList) {
    try {
      const parsed = JSON.parse(rawList);
      if (Array.isArray(parsed)) {
        allowlist = parsed.filter((v): v is string => typeof v === 'string');
      }
    } catch {
      allowlist = [];
    }
  }

  return { mode, allowlist };
}

export function setSandboxMode(mode: OutboundMode): void {
  kv.setValue(KEY_MODE, mode);
}

export function getSandboxAllowlist(): string[] {
  return getSandboxConfig().allowlist;
}

export function addAllowlistRule(rule: string): void {
  const trimmed = rule.trim();
  if (!trimmed) return;
  const list = getSandboxAllowlist();
  if (!list.includes(trimmed)) {
    list.push(trimmed);
    kv.setValue(KEY_ALLOWLIST, JSON.stringify(list));
  }
}

export function removeAllowlistRule(rule: string): void {
  const trimmed = rule.trim();
  const list = getSandboxAllowlist().filter((r) => r !== trimmed);
  kv.setValue(KEY_ALLOWLIST, JSON.stringify(list));
}
