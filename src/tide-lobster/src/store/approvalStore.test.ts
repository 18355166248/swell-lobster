import { afterEach, describe, expect, it } from 'vitest';
import { getDb } from '../db/index.js';
import { ApprovalStore } from './approvalStore.js';

const SESSION_PREFIX = 'test-approval-store-';

function cleanup(): void {
  getDb()
    .prepare(`DELETE FROM tool_approval_requests WHERE session_id LIKE ?`)
    .run(`${SESSION_PREFIX}%`);
}

afterEach(() => {
  cleanup();
  getDb().prepare(`DELETE FROM tool_approval_session_grants WHERE session_id LIKE ?`).run(
    `${SESSION_PREFIX}%`
  );
});

describe('ApprovalStore', () => {
  it('waits for approve and resolves the pending request', async () => {
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
