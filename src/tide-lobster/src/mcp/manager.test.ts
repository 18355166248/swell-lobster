import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MCPServerConfig } from './types.js';

vi.mock('./store.js', () => ({
  mcpStore: {
    setStatus: vi.fn(),
  },
}));

vi.mock('./toolBridge.js', () => ({
  mcpToolBridge: {
    registerMCPTool: vi.fn(),
    unregisterServerTools: vi.fn(),
  },
}));

function makeConfig(patch: Partial<MCPServerConfig> = {}): MCPServerConfig {
  return {
    id: 'server-1',
    name: 'Example',
    type: 'stdio',
    command: 'npx',
    args: ['-y', 'example-mcp@latest'],
    env: {},
    headers: {},
    enabled: true,
    status: 'stopped',
    created_at: '2026-04-30T00:00:00.000Z',
    updated_at: '2026-04-30T00:00:00.000Z',
    ...patch,
  };
}

describe('mcp manager timeout helpers', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('detects npx servers as ephemeral package executors', async () => {
    const { usesEphemeralPackageExecutor } = await import('./manager.js');

    expect(usesEphemeralPackageExecutor(makeConfig())).toBe(true);
    expect(
      usesEphemeralPackageExecutor(
        makeConfig({
          command: 'pnpm',
          args: ['dlx', 'example-mcp@latest'],
        })
      )
    ).toBe(true);
    expect(
      usesEphemeralPackageExecutor(
        makeConfig({
          command: 'node',
          args: ['dist/server.js'],
        })
      )
    ).toBe(false);
  });

  it('uses a longer default timeout for ephemeral package executors', async () => {
    const { resolveConnectTimeoutMs } = await import('./manager.js');

    expect(resolveConnectTimeoutMs(makeConfig(), {})).toBe(60_000);
    expect(
      resolveConnectTimeoutMs(
        makeConfig({
          command: 'node',
          args: ['dist/server.js'],
        }),
        {}
      )
    ).toBe(15_000);
  });

  it('respects explicit timeout overrides from the environment', async () => {
    const { resolveConnectTimeoutMs } = await import('./manager.js');

    expect(
      resolveConnectTimeoutMs(makeConfig(), {
        SWELL_MCP_CONNECT_TIMEOUT_MS: '30000',
      })
    ).toBe(60_000);
    expect(
      resolveConnectTimeoutMs(
        makeConfig(),
        {
          SWELL_MCP_CONNECT_TIMEOUT_MS: '30000',
          SWELL_MCP_EPHEMERAL_CONNECT_TIMEOUT_MS: '90000',
        }
      )
    ).toBe(90_000);
  });

  it('reads an explicit MCP npx registry override from the environment', async () => {
    const { resolveEphemeralRegistryOverride } = await import('./manager.js');

    expect(
      resolveEphemeralRegistryOverride(
        makeConfig({
          command: 'npx',
          args: ['-y', 'example-mcp@latest'],
        }),
        {
          SWELL_MCP_NPX_REGISTRY: 'https://registry.npmjs.org/',
        }
      )
    ).toBe('https://registry.npmjs.org/');
    expect(
      resolveEphemeralRegistryOverride(
        makeConfig({
          command: 'node',
          args: ['dist/server.js'],
        }),
        {
          SWELL_MCP_NPX_REGISTRY: 'https://registry.npmjs.org/',
        }
      )
    ).toBe('');
  });

  it('adds actionable hints to timeout messages', async () => {
    const { buildTimeoutMessage } = await import('./manager.js');

    expect(buildTimeoutMessage(makeConfig(), 'connect', 60_000)).toContain(
      'SWELL_MCP_EPHEMERAL_CONNECT_TIMEOUT_MS'
    );
    expect(
      buildTimeoutMessage(
        makeConfig({
          type: 'http',
          command: '',
          url: 'https://example.com/mcp',
        }),
        'listTools',
        15_000
      )
    ).toContain('endpoint URL');
  });
});
