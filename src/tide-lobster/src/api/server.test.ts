import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('createApp health route', () => {
  let projectRoot = '';

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'swell-server-test-'));
    process.env.SWELL_PROJECT_ROOT = projectRoot;
    process.env.SWELL_DATA_DIR = join(projectRoot, 'data');
    process.env.SWELL_GLOBAL_ENV_DIR = projectRoot;
    delete process.env.SWELL_REMOTE;
    delete process.env.API_HOST;
    vi.resetModules();
  });

  afterEach(async () => {
    const { closeDb } = await import('../db/index.js');
    closeDb();
    rmSync(projectRoot, { recursive: true, force: true });
    delete process.env.SWELL_PROJECT_ROOT;
    delete process.env.SWELL_DATA_DIR;
    delete process.env.SWELL_GLOBAL_ENV_DIR;
    delete process.env.SWELL_REMOTE;
    delete process.env.API_HOST;
    vi.resetModules();
  });

  it('reports desired and active remote mode in health payload', async () => {
    const flagDir = join(projectRoot, 'data', 'auth');
    mkdirSync(flagDir, { recursive: true });
    writeFileSync(join(flagDir, 'remote.enabled'), new Date().toISOString());
    process.env.SWELL_REMOTE = '1';
    process.env.API_HOST = '0.0.0.0';

    const { createApp } = await import('./server.js');
    const app = createApp();
    const res = await app.request('/api/health');

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      listen_host: string;
      listen_port: number;
      remote_mode_desired: boolean;
      remote_mode_active: boolean;
    };
    expect(body.listen_host).toBe('0.0.0.0');
    expect(body.listen_port).toBe(18900);
    expect(body.remote_mode_desired).toBe(true);
    expect(body.remote_mode_active).toBe(true);
  });
});
