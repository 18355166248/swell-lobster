import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { settings } from '../config.js';

export function remoteFlagPath(): string {
  return join(settings.dataDir, 'auth', 'remote.enabled');
}

export function readRemoteFlag(): boolean {
  return existsSync(remoteFlagPath());
}

export function writeRemoteFlag(enabled: boolean): void {
  const path = remoteFlagPath();
  if (enabled) {
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(path, new Date().toISOString(), { mode: 0o600 });
  } else if (existsSync(path)) {
    rmSync(path);
  }
}

export function isRemoteRuntimeActive(): boolean {
  return process.env.SWELL_REMOTE === '1';
}
