import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const SESSION_PREFIX = 'test-approval-store-';

describe('ApprovalStore', () => {
  let repoRoot = '';

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'swell-approval-store-test-'));
    mkdirSync(join(repoRoot, 'identity'), { recursive: true });
    mkdirSync(join(repoRoot, 'data'), { recursive: true });
    writeFileSync(join(repoRoot, 'identity', 'assistant.md'), 'You are a test assistant.');
    process.env.SWELL_PROJECT_ROOT = repoRoot;
    process.env.SWELL_DATA_DIR = join(repoRoot, 'data');
    process.env.SWELL_IDENTITY_DIR = join(repoRoot, 'identity');
    vi.resetModules();
  });

  afterEach(async () => {
    const { getDb } = await import('../db/index.js');
    getDb()
      .prepare(`DELETE FROM tool_approval_requests WHERE session_id LIKE ?`)
      .run(`${SESSION_PREFIX}%`);
    getDb().prepare(`DELETE FROM tool_approval_session_grants WHERE session_id LIKE ?`).run(
      `${SESSION_PREFIX}%`
    );

    try {
      rmSync(repoRoot, { recursive: true, force: true });
    } catch {
      // ignore locked files on Windows
    }
    delete process.env.SWELL_PROJECT_ROOT;
    delete process.env.SWELL_DATA_DIR;
    delete process.env.SWELL_IDENTITY_DIR;
    vi.resetModules();
  });

  it('waits for approve and resolves the pending request', async () => {
    const { ApprovalStore } = await import('./approvalStore.js');
    const store = new ApprovalStore();
    const request = store.createRequest({
      sessionId: `${SESSION_PREFIX}approve`,
      toolName: 'web_search',
      riskLevel: 'network',
      arguments: { query: 'latest ai news' },
      summary: 'network search',
    });

    setTimeout(() => {
      store.approve(request.id, 'tester', 'looks good');
    }, 10);

    const resolved = await store.waitForDecision(request.id, { timeoutMs: 200 });
    expect(resolved.status).toBe('approved');
    expect(resolved.resolved_by).toBe('tester');
  });

  it('expires pending requests on timeout', async () => {
    const { ApprovalStore } = await import('./approvalStore.js');
    const store = new ApprovalStore();
    const request = store.createRequest({
      sessionId: `${SESSION_PREFIX}timeout`,
      toolName: 'run_script',
      riskLevel: 'execute',
      arguments: { script_path: '/tmp/demo.mjs' },
      summary: 'execute local script',
    });

    const resolved = await store.waitForDecision(request.id, { timeoutMs: 20 });
    expect(resolved.status).toBe('expired');
    expect(resolved.resolution_note).toBe('approval timed out');
  });

  it('stores and reuses session approval grants', async () => {
    const { ApprovalStore } = await import('./approvalStore.js');
    const store = new ApprovalStore();
    const grant = store.grantSessionApproval(
      `${SESSION_PREFIX}grant`,
      'web_search',
      'tester'
    );

    expect(grant.tool_name).toBe('web_search');
    expect(store.hasSessionGrant(`${SESSION_PREFIX}grant`, 'web_search')).toBe(true);
    expect(store.getSessionGrant(`${SESSION_PREFIX}grant`, 'web_search')?.created_by).toBe(
      'tester'
    );
  });
});
