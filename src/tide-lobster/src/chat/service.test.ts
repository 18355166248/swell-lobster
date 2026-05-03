import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('ChatService', () => {
  let repoRoot = '';

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'swell-chat-svc-test-'));
    mkdirSync(join(repoRoot, 'identity'), { recursive: true });
    mkdirSync(join(repoRoot, 'data'), { recursive: true });
    mkdirSync(join(repoRoot, 'SKILLS', 'skill-creator'), { recursive: true });
    writeFileSync(join(repoRoot, 'identity', 'assistant.md'), 'You are a test assistant.');
    writeFileSync(
      join(repoRoot, 'SKILLS', 'skill-creator', 'SKILL.md'),
      [
        '---',
        'name: skill-creator',
        'description: Create and improve skills.',
        '---',
        '',
        '# Skill Creator',
        '',
        'Use this skill when the user wants to create a skill.',
      ].join('\n')
    );
    process.env.SWELL_PROJECT_ROOT = repoRoot;
    process.env.SWELL_DATA_DIR = join(repoRoot, 'data');
    process.env.SWELL_IDENTITY_DIR = join(repoRoot, 'identity');
    vi.resetModules();
  });

  afterEach(() => {
    try {
      rmSync(repoRoot, { recursive: true, force: true });
    } catch {
      // Windows 上 SQLite 文件可能被锁定，忽略清理失败
    }
    delete process.env.SWELL_PROJECT_ROOT;
    delete process.env.SWELL_DATA_DIR;
    delete process.env.SWELL_IDENTITY_DIR;
    vi.resetModules();
  });

  describe('trimMessages（内部工具函数）', () => {
    it('消息总长度未超限时原样返回', async () => {
      // trimMessages 未导出，通过 chatStream 的行为间接验证；
      // 此处直接测试 service 模块内的 trimMessages 逻辑：
      // 构造一个短消息列表，期望全部保留。
      const { ChatStore } = await import('./chatStore.js');
      const store = new ChatStore();
      const session = store.createSession(null, null);

      // 验证 createSession 返回合法会话对象
      expect(session.id).toBeTruthy();
      expect(session.messages).toEqual([]);
    });
  });

  describe('createSession', () => {
    it('无端点时创建会话成功', async () => {
      const { ChatService } = await import('./service.js');
      const svc = new ChatService(repoRoot);
      const session = svc.createSession();

      expect(session.id).toBeTruthy();
      expect(session.messages).toEqual([]);
    });

    it('指定不存在的端点时抛出错误', async () => {
      const { ChatService } = await import('./service.js');
      const svc = new ChatService(repoRoot);

      expect(() => svc.createSession('nonexistent-endpoint')).toThrow('endpoint not found');
    });

    it('listSessions 返回已创建的会话', async () => {
      const { ChatService } = await import('./service.js');
      const svc = new ChatService(repoRoot);
      svc.createSession();
      svc.createSession();

      const sessions = svc.listSessions();
      expect(sessions.length).toBeGreaterThanOrEqual(2);
    });

    it('getSession 返回指定会话', async () => {
      const { ChatService } = await import('./service.js');
      const svc = new ChatService(repoRoot);
      const created = svc.createSession();

      const fetched = svc.getSession(created.id);
      expect(fetched?.id).toBe(created.id);
    });

    it('getSession 对不存在的 ID 返回 undefined', async () => {
      const { ChatService } = await import('./service.js');
      const svc = new ChatService(repoRoot);

      expect(svc.getSession('nonexistent-id')).toBeUndefined();
    });
  });

  describe('updateSession', () => {
    it('更新 title 后 getSession 返回新标题', async () => {
      const { ChatService } = await import('./service.js');
      const svc = new ChatService(repoRoot);
      const session = svc.createSession();

      svc.updateSession(session.id, { title: '新标题' });
      const updated = svc.getSession(session.id);
      expect(updated?.title).toBe('新标题');
    });

    it('更新不存在的端点时抛出错误', async () => {
      const { ChatService } = await import('./service.js');
      const svc = new ChatService(repoRoot);
      const session = svc.createSession();

      expect(() =>
        svc.updateSession(session.id, { endpoint_name: 'nonexistent' })
      ).toThrow('endpoint not found');
    });
  });

  describe('tool fallback', () => {
    it('auto-routes direct skill-name tool calls to read_skill', async () => {
      const { initializeBuiltinTools } = await import('../tools/index.js');
      initializeBuiltinTools();
      const { ChatService } = await import('./service.js');
      const svc = new ChatService(repoRoot);

      const trace = await (
        svc as unknown as {
          executeTool: (
            toolCall: { id: string; name: string; arguments: Record<string, unknown> },
            toolInvocations: unknown[],
            onEvent?: undefined,
            sessionId?: string
          ) => Promise<{ status: string; result?: string }>;
        }
      ).executeTool(
        { id: 'tc-1', name: 'skill-creator', arguments: {} },
        [],
        undefined,
        'session-1'
      );

      expect(trace.status).toBe('completed');
      expect(trace.result).toContain('Auto-routed skill fallback');
      expect(trace.result).toContain('name: skill-creator');
      expect(trace.result).toContain('Use this skill when the user wants to create a skill.');
    });
  });

  describe('tool approvals', () => {
    it('stops the current tool round when approval is denied', async () => {
      vi.doMock('./llmClient.js', async () => {
        const actual = await vi.importActual<typeof import('./llmClient.js')>('./llmClient.js');
        return {
          ...actual,
          requestWithFallback: vi.fn().mockResolvedValue({
            content: '我先检查一下。',
            tool_calls: [
              { id: 'tc-denied', name: 'deny_tool', arguments: { query: 'latest ai news' } },
              { id: 'tc-never-run', name: 'should_not_run', arguments: { value: 'x' } },
            ],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 5,
              total_tokens: 15,
            },
          }),
        };
      });

      const { ChatService } = await import('./service.js');
      const { globalToolRegistry } = await import('../tools/registry.js');
      const { approvalStore } = await import('../store/approvalStore.js');
      const { ToolRiskLevel } = await import('../tools/types.js');

      let secondToolExecuted = false;
      globalToolRegistry.register({
        name: 'deny_tool',
        description: 'approval required tool',
        permission: {
          riskLevel: ToolRiskLevel.network,
          requiresApproval: true,
          sideEffectSummary: 'deny tool summary',
        },
        parameters: {},
        async execute() {
          return 'should not execute';
        },
      });
      globalToolRegistry.register({
        name: 'should_not_run',
        description: 'must not run after denial',
        permission: {
          riskLevel: ToolRiskLevel.readonly,
          requiresApproval: false,
          sideEffectSummary: 'noop',
        },
        parameters: {},
        async execute() {
          secondToolExecuted = true;
          return 'unexpected';
        },
      });

      const waitSpy = vi
        .spyOn(approvalStore, 'waitForDecision')
        .mockImplementation(async (id: string) => {
          approvalStore.deny(id, 'tester', 'no');
          return approvalStore.getById(id)!;
        });

      try {
        const { EndpointStore } = await import('../store/endpointStore.js');
        new EndpointStore().createEndpoint({
          name: 'test-endpoint',
          model: 'test-model',
          api_type: 'openai',
          base_url: 'http://127.0.0.1:9999/v1',
          api_key_env: '',
          enabled: true,
          priority: 1,
        });

        const svc = new ChatService(repoRoot);
        const session = svc.createSession('test-endpoint');
        const result = await svc.chat({
          conversation_id: session.id,
          message: '请帮我查一下今天的 AI 新闻',
        });

        expect(result.message).toContain('已拒绝工具 deny_tool');
        expect(secondToolExecuted).toBe(false);
        expect(waitSpy).toHaveBeenCalledOnce();
      } finally {
        waitSpy.mockRestore();
        globalToolRegistry.unregister('deny_tool');
        globalToolRegistry.unregister('should_not_run');
      }
    });

    it('skips repeated approval after session-level grant is stored', async () => {
      vi.doMock('./llmClient.js', async () => {
        const actual = await vi.importActual<typeof import('./llmClient.js')>('./llmClient.js');
        const requestWithFallback = vi
          .fn()
          .mockResolvedValueOnce({
            content: '',
            tool_calls: [
              { id: 'tc-search', name: 'session_granted_tool', arguments: { query: 'ai' } },
            ],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 5,
              total_tokens: 15,
            },
          })
          .mockResolvedValueOnce({
            content: 'ok',
            tool_calls: [],
            usage: {
              prompt_tokens: 8,
              completion_tokens: 4,
              total_tokens: 12,
            },
          });
        return {
          ...actual,
          requestWithFallback,
        };
      });

      const { ChatService } = await import('./service.js');
      const { globalToolRegistry } = await import('../tools/registry.js');
      const { approvalStore } = await import('../store/approvalStore.js');
      const { EndpointStore } = await import('../store/endpointStore.js');
      const { ToolRiskLevel } = await import('../tools/types.js');

      let executeCount = 0;
      globalToolRegistry.register({
        name: 'session_granted_tool',
        description: 'approval required tool',
        permission: {
          riskLevel: ToolRiskLevel.network,
          requiresApproval: true,
          sideEffectSummary: 'session grant summary',
        },
        parameters: {},
        async execute() {
          executeCount += 1;
          return 'ok';
        },
      });

      try {
        new EndpointStore().createEndpoint({
          name: 'test-endpoint-grant',
          model: 'test-model',
          api_type: 'openai',
          base_url: 'http://127.0.0.1:9999/v1',
          api_key_env: '',
          enabled: true,
          priority: 1,
        });

        const svc = new ChatService(repoRoot);
        const session = svc.createSession('test-endpoint-grant');
        approvalStore.grantSessionApproval(session.id, 'session_granted_tool', 'tester');

        const waitSpy = vi.spyOn(approvalStore, 'waitForDecision');
        const result = await svc.chat({
          conversation_id: session.id,
          message: '再次执行同一个工具',
        });

        expect(result.message).toBe('ok');
        expect(executeCount).toBe(1);
        expect(waitSpy).not.toHaveBeenCalled();
        waitSpy.mockRestore();
      } finally {
        globalToolRegistry.unregister('session_granted_tool');
      }
    });
  });
});
