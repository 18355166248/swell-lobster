import { describe, expect, it } from 'vitest';
import { ToolRegistry } from './registry.js';
import { ToolRiskLevel, type ToolDef } from './types.js';

function buildTool(overrides?: Partial<ToolDef>): ToolDef {
  return {
    name: 'demo_tool',
    description: 'demo',
    permission: {
      riskLevel: ToolRiskLevel.readonly,
      requiresApproval: false,
      sideEffectSummary: '  demo summary  ',
    },
    parameters: {},
    async execute() {
      return 'ok';
    },
    ...overrides,
  };
}

describe('ToolRegistry', () => {
  it('normalizes permission metadata on register', () => {
    const registry = new ToolRegistry();
    registry.register(
      buildTool({
        permission: {
          riskLevel: ToolRiskLevel.network,
          requiresApproval: true,
          sideEffectSummary: '  reaches remote provider  ',
          networkScopes: [' tavily ', ''],
        },
      })
    );

    const tool = registry.get('demo_tool');
    expect(tool?.permission.sideEffectSummary).toBe('reaches remote provider');
    expect(tool?.permission.networkScopes).toEqual(['tavily']);
  });

  it('rejects tools without a side effect summary', () => {
    const registry = new ToolRegistry();
    expect(() =>
      registry.register(
        buildTool({
          permission: {
            riskLevel: ToolRiskLevel.execute,
            requiresApproval: true,
            sideEffectSummary: '   ',
          },
        })
      )
    ).toThrow('missing sideEffectSummary');
  });
});
