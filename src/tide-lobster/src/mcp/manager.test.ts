import { describe, expect, it } from 'vitest';
import {
  buildTimeoutMessage,
  resolveConnectTimeoutMs,
  resolveEphemeralRegistryOverride,
  usesEphemeralPackageExecutor,
} from './manager.js';
import type { MCPServerConfig } from './types.js';

function makeConfig(
  patch: Partial<MCPServerConfig> = {}
): MCPServerConfig {
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
  it('detects npx servers as ephemeral package executors', () => {
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

  it('uses a longer default timeout for ephemeral package executors', () => {
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

  it('respects explicit timeout overrides from the environment', () => {
    expect(
      resolveConnectTimeoutMs(makeConfig(), {
        SWELL_MCP_CONNECT_TIMEOUT_MS: '30000',
      })
    ).toBe(60_000);
    expect(
      resolveConnectTimeoutMs(makeConfig(), {
        SWELL_MCP_CONNECT_TIMEOUT_MS: '30000',
        SWELL_MCP_EPHEMERAL_CONNECT_TIMEOUT_MS: '90000',
      })
    ).toBe(90_000);
  });

  it('reads an explicit MCP npx registry override from the environment', () => {
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

  it('adds actionable hints to timeout messages', () => {
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
