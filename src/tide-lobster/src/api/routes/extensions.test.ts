import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

type ExtensionSummary = {
  id: string;
  source: string;
  metadata?: Record<string, unknown>;
};

describe('extensionsRouter', () => {
  let repoRoot = '';

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'swell-extensions-route-test-'));
    mkdirSync(join(repoRoot, 'identity'), { recursive: true });
    mkdirSync(join(repoRoot, 'data'), { recursive: true });
    mkdirSync(join(repoRoot, 'SKILLS', 'release-helper'), { recursive: true });
    writeFileSync(join(repoRoot, 'identity', 'assistant.md'), 'You are a test assistant.');
    writeFileSync(
      join(repoRoot, 'SKILLS', 'release-helper', 'SKILL.md'),
      [
        '---',
        'name: release-helper',
        'display_name: Release Helper',
        'description: Prepare release checklists.',
        'tags:',
        '  - release',
        '  - docs',
        '---',
        '',
        '# Release Helper',
        '',
        'Use this skill for release preparation.',
      ].join('\n')
    );
    process.env.SWELL_GLOBAL_ENV_DIR = repoRoot;
    process.env.SWELL_PROJECT_ROOT = repoRoot;
    process.env.SWELL_DATA_DIR = join(repoRoot, 'data');
    process.env.SWELL_IDENTITY_DIR = join(repoRoot, 'identity');
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    const { closeDb } = await import('../../db/index.js');
    closeDb();
    rmSync(repoRoot, { recursive: true, force: true });
    delete process.env.SWELL_GLOBAL_ENV_DIR;
    delete process.env.SWELL_PROJECT_ROOT;
    delete process.env.SWELL_DATA_DIR;
    delete process.env.SWELL_IDENTITY_DIR;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('lists builtin, skill, and mcp extensions in one catalog', async () => {
    const { initializeBuiltinTools } = await import('../../tools/index.js');
    const { mcpStore } = await import('../../mcp/store.js');
    const { mcpManager } = await import('../../mcp/manager.js');
    const { createApp } = await import('../server.js');

    initializeBuiltinTools();

    const server = mcpStore.create({
      name: 'Docs MCP',
      type: 'stdio',
      command: 'node',
      args: ['docs-mcp.mjs'],
      enabled: true,
    });
    mcpStore.setStatus(server.id, 'running');
    vi.spyOn(mcpManager, 'getTools').mockResolvedValue([
      { name: 'search_docs', description: 'Search docs' },
    ]);

    const app = createApp();
    const response = await app.request('/api/extensions');

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.total).toBeGreaterThan(2);

    const byId = new Map<string, ExtensionSummary>(
      (payload.extensions as ExtensionSummary[]).map((item) => [item.id, item])
    );

    expect(byId.get('builtin:read_memory')?.source).toBe('builtin');
    expect(byId.get('builtin:docx_writer')?.source).toBe('builtin');
    expect(byId.get('builtin:xlsx_writer')?.source).toBe('builtin');
    expect(byId.get('builtin:pptx_writer')?.source).toBe('builtin');
    expect(byId.get('builtin:browser_automation')?.source).toBe('builtin');
    expect(byId.get('builtin:email_send')?.source).toBe('builtin');
    expect(byId.get('skill:release-helper')?.source).toBe('skill');
    expect(byId.get(`mcp:${server.id}`)?.source).toBe('mcp');
    expect(byId.get(`mcp:${server.id}`)?.metadata?.toolCount).toBe(1);
  });

  it('toggles a skill extension through the unified route', async () => {
    const { createApp } = await import('../server.js');
    const app = createApp();
    const extensionId = encodeURIComponent('skill:release-helper');

    const disableResponse = await app.request(`/api/extensions/${extensionId}/disable`, {
      method: 'POST',
    });
    expect(disableResponse.status).toBe(200);
    const disabledPayload = await disableResponse.json();
    expect(disabledPayload.extension.enabled).toBe(false);

    const enableResponse = await app.request(`/api/extensions/${extensionId}/enable`, {
      method: 'POST',
    });
    expect(enableResponse.status).toBe(200);
    const enabledPayload = await enableResponse.json();
    expect(enabledPayload.extension.enabled).toBe(true);
  });

  it('routes mcp lifecycle actions through the unified route', async () => {
    const { mcpStore } = await import('../../mcp/store.js');
    const { mcpManager } = await import('../../mcp/manager.js');
    const { createApp } = await import('../server.js');

    const server = mcpStore.create({
      name: 'Ops MCP',
      type: 'stdio',
      command: 'node',
      args: ['ops-mcp.mjs'],
      enabled: true,
    });
    mcpStore.setStatus(server.id, 'running');

    const startSpy = vi.spyOn(mcpManager, 'startServer').mockImplementation(async (config) => {
      mcpStore.setStatus(config.id, 'running');
    });
    const stopSpy = vi.spyOn(mcpManager, 'stopServer').mockImplementation(async (serverId) => {
      mcpStore.setStatus(serverId, 'stopped');
    });
    const reloadSpy = vi.spyOn(mcpManager, 'reloadServer').mockImplementation(async (serverId) => {
      mcpStore.setStatus(serverId, 'running');
    });

    const app = createApp();
    const extensionId = encodeURIComponent(`mcp:${server.id}`);

    const disableResponse = await app.request(`/api/extensions/${extensionId}/disable`, {
      method: 'POST',
    });
    expect(disableResponse.status).toBe(200);
    expect(stopSpy).toHaveBeenCalledWith(server.id);
    expect((await disableResponse.json()).extension.enabled).toBe(false);

    const enableResponse = await app.request(`/api/extensions/${extensionId}/enable`, {
      method: 'POST',
    });
    expect(enableResponse.status).toBe(200);
    expect(startSpy).toHaveBeenCalled();
    expect((await enableResponse.json()).extension.enabled).toBe(true);

    const reloadResponse = await app.request(`/api/extensions/${extensionId}/reload`, {
      method: 'POST',
    });
    expect(reloadResponse.status).toBe(200);
    expect(reloadSpy).toHaveBeenCalledWith(server.id);
  });

  it('rejects builtin lifecycle mutations', async () => {
    const { createApp } = await import('../server.js');
    const app = createApp();
    const extensionId = encodeURIComponent('builtin:read_memory');

    const response = await app.request(`/api/extensions/${extensionId}/disable`, {
      method: 'POST',
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      detail: 'builtin extensions cannot be toggled',
    });
  });
});
