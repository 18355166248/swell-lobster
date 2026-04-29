import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockRequestWithFallback = vi.fn();
const mockMemoryStoreCreate = vi.fn();
const mockGetSession = vi.fn();
const mockListEndpoints = vi.fn().mockReturnValue([]);

vi.mock('../chat/llmClient.js', () => ({
  requestWithFallback: mockRequestWithFallback,
}));

vi.mock('./store.js', () => ({
  memoryStore: { create: mockMemoryStoreCreate },
}));

vi.mock('../chat/chatStore.js', () => ({
  ChatStore: vi.fn().mockImplementation(() => ({
    getSession: mockGetSession,
  })),
}));

vi.mock('../store/endpointStore.js', () => ({
  EndpointStore: vi.fn().mockImplementation(() => ({
    listEndpoints: mockListEndpoints,
  })),
}));

const mockEndpoint = {
  id: 'ep1',
  name: 'test',
  model: 'gpt-4',
  api_type: 'openai',
  base_url: 'https://api.openai.com/v1',
  api_key_env: 'OPENAI_API_KEY',
  timeout: 120,
  max_tokens: 0,
};

/** 足够长的对话，不会被 isTooShort 过滤 */
const longMessages = [
  { role: 'user', content: '我喜欢喝咖啡，每天早上一杯，这是我多年坚持的习惯，感觉很好' },
  { role: 'assistant', content: '好的，我记住了您喜欢喝咖啡，这是个很好的习惯' },
  { role: 'user', content: '我喜欢喝咖啡，每天早上一杯，这是我多年坚持的习惯，感觉很好' },
];

describe('MemoryExtractorService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockReturnValue({ messages: longMessages });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('extractFromSession — EXPLICIT_RE 显式触发', () => {
    it('匹配"记住"关键词时直接保存，不调用 LLM', async () => {
      mockGetSession.mockReturnValue({
        messages: [{ role: 'user', content: '记住：我不喜欢辣的食物' }],
      });

      const { MemoryExtractorService } = await import('./extractorService.js');
      const svc = new MemoryExtractorService();
      await svc.extractFromSession('s1', mockEndpoint, 'key');

      expect(mockMemoryStoreCreate).toHaveBeenCalledOnce();
      expect(mockMemoryStoreCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          content: '我不喜欢辣的食物',
          is_explicit: true,
          confidence: 1.0,
        })
      );
      expect(mockRequestWithFallback).not.toHaveBeenCalled();
    });

    it('匹配"帮我记"关键词时直接保存', async () => {
      mockGetSession.mockReturnValue({
        messages: [{ role: 'user', content: '帮我记，我的生日是3月15日' }],
      });

      const { MemoryExtractorService } = await import('./extractorService.js');
      const svc = new MemoryExtractorService();
      await svc.extractFromSession('s1', mockEndpoint, 'key');

      expect(mockMemoryStoreCreate).toHaveBeenCalledOnce();
      expect(mockMemoryStoreCreate).toHaveBeenCalledWith(
        expect.objectContaining({ content: '我的生日是3月15日', is_explicit: true })
      );
    });
  });

  describe('extractFromSession — pre-filter 丢弃规则', () => {
    it('会话内容过短时跳过 LLM 调用', async () => {
      mockGetSession.mockReturnValue({
        messages: [
          { role: 'user', content: '你好' },
          { role: 'assistant', content: '你好！' },
        ],
      });

      const { MemoryExtractorService } = await import('./extractorService.js');
      const svc = new MemoryExtractorService();
      await svc.extractFromSession('s1', mockEndpoint, 'key');

      expect(mockRequestWithFallback).not.toHaveBeenCalled();
      expect(mockMemoryStoreCreate).not.toHaveBeenCalled();
    });

    it('最后一条用户消息为礼貌应答时跳过', async () => {
      mockGetSession.mockReturnValue({
        messages: [
          { role: 'user', content: '我喜欢喝咖啡，每天早上一杯，这是我多年坚持的习惯' },
          { role: 'assistant', content: '好的，我记住了您喜欢喝咖啡' },
          { role: 'user', content: '好的' },
        ],
      });

      const { MemoryExtractorService } = await import('./extractorService.js');
      const svc = new MemoryExtractorService();
      await svc.extractFromSession('s1', mockEndpoint, 'key');

      expect(mockRequestWithFallback).not.toHaveBeenCalled();
    });

    it('最后一条用户消息含临时性词汇时跳过', async () => {
      mockGetSession.mockReturnValue({
        messages: [
          { role: 'user', content: '我喜欢喝咖啡，每天早上一杯，这是我多年坚持的习惯' },
          { role: 'assistant', content: '好的' },
          { role: 'user', content: '今天这个bug真的很烦' },
        ],
      });

      const { MemoryExtractorService } = await import('./extractorService.js');
      const svc = new MemoryExtractorService();
      await svc.extractFromSession('s1', mockEndpoint, 'key');

      expect(mockRequestWithFallback).not.toHaveBeenCalled();
    });
  });

  describe('extractFromSession — LLM 响应解析', () => {
    it('正常 JSON 数组响应时保存记忆', async () => {
      mockRequestWithFallback.mockResolvedValue({
        content: JSON.stringify([
          { content: '用户喜欢喝咖啡', memory_type: 'preference', importance: 7, tags: ['饮食'] },
        ]),
      });

      const { MemoryExtractorService } = await import('./extractorService.js');
      const svc = new MemoryExtractorService();
      await svc.extractFromSession('s1', mockEndpoint, 'key');

      expect(mockMemoryStoreCreate).toHaveBeenCalledOnce();
      expect(mockMemoryStoreCreate).toHaveBeenCalledWith(
        expect.objectContaining({ content: '用户喜欢喝咖啡', memory_type: 'preference' })
      );
    });

    it('```json 代码块包裹时正确解析', async () => {
      mockRequestWithFallback.mockResolvedValue({
        content:
          '```json\n[{"content":"用户喜欢喝咖啡","memory_type":"preference","importance":7,"tags":[]}]\n```',
      });

      const { MemoryExtractorService } = await import('./extractorService.js');
      const svc = new MemoryExtractorService();
      await svc.extractFromSession('s1', mockEndpoint, 'key');

      expect(mockMemoryStoreCreate).toHaveBeenCalledOnce();
    });

    it('<think> 思维链被剥离后正确解析', async () => {
      mockRequestWithFallback.mockResolvedValue({
        content:
          '<think>让我分析一下这段对话...</think>\n[{"content":"用户喜欢喝咖啡","memory_type":"preference","importance":7,"tags":[]}]',
      });

      const { MemoryExtractorService } = await import('./extractorService.js');
      const svc = new MemoryExtractorService();
      await svc.extractFromSession('s1', mockEndpoint, 'key');

      expect(mockMemoryStoreCreate).toHaveBeenCalledOnce();
    });

    it('返回空数组时不保存任何记忆', async () => {
      mockRequestWithFallback.mockResolvedValue({ content: '[]' });

      const { MemoryExtractorService } = await import('./extractorService.js');
      const svc = new MemoryExtractorService();
      await svc.extractFromSession('s1', mockEndpoint, 'key');

      expect(mockMemoryStoreCreate).not.toHaveBeenCalled();
    });

    it('非法 JSON 时静默跳过，不抛出', async () => {
      mockRequestWithFallback.mockResolvedValue({ content: '[invalid json' });

      const { MemoryExtractorService } = await import('./extractorService.js');
      const svc = new MemoryExtractorService();
      await expect(svc.extractFromSession('s1', mockEndpoint, 'key')).resolves.toBeUndefined();
      expect(mockMemoryStoreCreate).not.toHaveBeenCalled();
    });
  });

  describe('extractFromJournal — pre-filter', () => {
    it('日记内容过短时跳过 LLM 调用', async () => {
      const { MemoryExtractorService } = await import('./extractorService.js');
      const svc = new MemoryExtractorService();
      await svc.extractFromJournal(1, '今天很好', '日记', '2026-04-29', mockEndpoint, 'key');

      expect(mockRequestWithFallback).not.toHaveBeenCalled();
    });

    it('日记内容足够长时调用 LLM', async () => {
      mockRequestWithFallback.mockResolvedValue({ content: '[]' });

      const { MemoryExtractorService } = await import('./extractorService.js');
      const svc = new MemoryExtractorService();
      await svc.extractFromJournal(
        1,
        '今天去了咖啡馆，点了一杯拿铁，感觉非常放松，以后要多来这里，这里的环境很好，适合工作和思考，下次还要带朋友一起来',
        '周末日记',
        '2026-04-29',
        mockEndpoint,
        'key'
      );

      expect(mockRequestWithFallback).toHaveBeenCalledOnce();
    });
  });
});
