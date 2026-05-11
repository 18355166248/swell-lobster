import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('executionAuditService', () => {
  let repoRoot = '';

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'swell-audit-test-'));
    mkdirSync(join(repoRoot, 'identity'), { recursive: true });
    mkdirSync(join(repoRoot, 'data'), { recursive: true });
    process.env.SWELL_GLOBAL_ENV_DIR = repoRoot;
    process.env.SWELL_PROJECT_ROOT = repoRoot;
    process.env.SWELL_DATA_DIR = join(repoRoot, 'data');
    process.env.SWELL_IDENTITY_DIR = join(repoRoot, 'identity');
    vi.resetModules();
  });

  afterEach(async () => {
    const { closeDb } = await import('../db/index.js');
    closeDb();
    rmSync(repoRoot, { recursive: true, force: true });
    delete process.env.SWELL_GLOBAL_ENV_DIR;
    delete process.env.SWELL_PROJECT_ROOT;
    delete process.env.SWELL_DATA_DIR;
    delete process.env.SWELL_IDENTITY_DIR;
    vi.resetModules();
  });

  it('persists extension_source / extension_id and supports source filter', async () => {
    const { executionAuditService } = await import('./executionAudit.js');
    const { ExtensionSource } = await import('../extensions/types.js');
    const { ToolRiskLevel } = await import('./types.js');

    executionAuditService.record({
      sessionId: 'session-1',
      toolName: 'read_memory',
      riskLevel: ToolRiskLevel.readonly,
      decision: 'skipped',
      durationMs: 5,
      status: 'success',
      outputSummary: 'ok',
      extensionSource: ExtensionSource.builtin,
      extensionId: 'builtin:read_memory',
    });
    executionAuditService.record({
      sessionId: 'session-1',
      toolName: 'mcp_server_a_search_docs',
      riskLevel: ToolRiskLevel.network,
      decision: 'approved',
      durationMs: 12,
      status: 'success',
      outputSummary: 'hit',
      extensionSource: ExtensionSource.mcp,
      extensionId: 'mcp:server-a',
    });
    // 来源未知（旧逻辑或反查失败）：写入 null 不报错
    executionAuditService.record({
      sessionId: 'session-1',
      toolName: 'unknown_tool',
      riskLevel: ToolRiskLevel.readonly,
      decision: 'skipped',
      durationMs: 0,
      status: 'failed',
      outputSummary: 'not found',
    });

    const all = executionAuditService.listRecent({ sessionId: 'session-1' });
    expect(all).toHaveLength(3);
    const byTool = new Map(all.map((row) => [row.tool_name, row]));
    expect(byTool.get('read_memory')?.extension_source).toBe('builtin');
    expect(byTool.get('read_memory')?.extension_id).toBe('builtin:read_memory');
    expect(byTool.get('mcp_server_a_search_docs')?.extension_source).toBe('mcp');
    expect(byTool.get('mcp_server_a_search_docs')?.extension_id).toBe('mcp:server-a');
    expect(byTool.get('unknown_tool')?.extension_source).toBeNull();
    expect(byTool.get('unknown_tool')?.extension_id).toBeNull();

    const onlyMcp = executionAuditService.listRecent({
      sessionId: 'session-1',
      source: ExtensionSource.mcp,
    });
    expect(onlyMcp.map((row) => row.tool_name)).toEqual(['mcp_server_a_search_docs']);
  });
});

describe('approvalsRouter /api/approvals/audit source filter', () => {
  let repoRoot = '';

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'swell-approvals-audit-test-'));
    mkdirSync(join(repoRoot, 'identity'), { recursive: true });
    mkdirSync(join(repoRoot, 'data'), { recursive: true });
    process.env.SWELL_GLOBAL_ENV_DIR = repoRoot;
    process.env.SWELL_PROJECT_ROOT = repoRoot;
    process.env.SWELL_DATA_DIR = join(repoRoot, 'data');
    process.env.SWELL_IDENTITY_DIR = join(repoRoot, 'identity');
    vi.resetModules();
  });

  afterEach(async () => {
    const { closeDb } = await import('../db/index.js');
    closeDb();
    rmSync(repoRoot, { recursive: true, force: true });
    delete process.env.SWELL_GLOBAL_ENV_DIR;
    delete process.env.SWELL_PROJECT_ROOT;
    delete process.env.SWELL_DATA_DIR;
    delete process.env.SWELL_IDENTITY_DIR;
    vi.resetModules();
  });

  it('filters audit records by source', async () => {
    const { executionAuditService } = await import('./executionAudit.js');
    const { ExtensionSource } = await import('../extensions/types.js');
    const { ToolRiskLevel } = await import('./types.js');
    const { approvalsRouter } = await import('../api/routes/approvals.js');

    executionAuditService.record({
      sessionId: 's1',
      toolName: 'mcp_a_x',
      riskLevel: ToolRiskLevel.network,
      decision: 'approved',
      durationMs: 1,
      status: 'success',
      outputSummary: 'mcp ok',
      extensionSource: ExtensionSource.mcp,
      extensionId: 'mcp:a',
    });
    executionAuditService.record({
      sessionId: 's1',
      toolName: 'read_memory',
      riskLevel: ToolRiskLevel.readonly,
      decision: 'skipped',
      durationMs: 1,
      status: 'success',
      outputSummary: 'builtin ok',
      extensionSource: ExtensionSource.builtin,
      extensionId: 'builtin:read_memory',
    });

    const mcpResp = await approvalsRouter.request('/api/approvals/audit?sessionId=s1&source=mcp');
    expect(mcpResp.status).toBe(200);
    const mcpPayload = (await mcpResp.json()) as { records: Array<{ tool_name: string }> };
    expect(mcpPayload.records.map((r) => r.tool_name)).toEqual(['mcp_a_x']);

    const allResp = await approvalsRouter.request('/api/approvals/audit?sessionId=s1');
    const allPayload = (await allResp.json()) as { records: Array<{ tool_name: string }> };
    expect(allPayload.records).toHaveLength(2);

    const badResp = await approvalsRouter.request('/api/approvals/audit?source=ftp');
    expect(badResp.status).toBe(400);
  });
});
