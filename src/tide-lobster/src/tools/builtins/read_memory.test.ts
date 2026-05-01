import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockEmbed = vi.fn();
const mockSemanticSearch = vi.fn();
const mockKeywordSearch = vi.fn();
const mockGetEmbeddingService = vi.fn();
const mockSettings = { memorySemanticMinScore: 0.75 };

vi.mock('../../config.js', () => ({
  settings: mockSettings,
}));

vi.mock('../../memory/embeddingService.js', () => ({
  getEmbeddingService: mockGetEmbeddingService,
}));

vi.mock('../../memory/store.js', () => ({
  memoryStore: {
    semanticSearch: mockSemanticSearch,
    search: mockKeywordSearch,
  },
}));

describe('readMemoryTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEmbeddingService.mockReset();
    mockSemanticSearch.mockReset();
    mockKeywordSearch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('prefers semantic search when embedding is available', async () => {
    mockGetEmbeddingService.mockReturnValue({ embed: mockEmbed });
    mockEmbed.mockResolvedValue([0.1, 0.2, 0.3]);
    mockSemanticSearch.mockReturnValue([
      { memory_type: 'preference', content: '喜欢喝咖啡', score: 0.91 },
    ]);

    const { readMemoryTool } = await import('./read_memory.js');
    const result = await readMemoryTool.execute({ query: '我的饮品偏好' });

    expect(mockEmbed).toHaveBeenCalledWith('我的饮品偏好');
    expect(mockSemanticSearch).toHaveBeenCalledWith([0.1, 0.2, 0.3], 5, 0.75);
    expect(result).toContain('相似度: 0.910');
    expect(mockKeywordSearch).not.toHaveBeenCalled();
  });

  it('falls back to keyword search when semantic results miss the threshold', async () => {
    mockGetEmbeddingService.mockReturnValue({ embed: mockEmbed });
    mockEmbed.mockResolvedValue([0.5, 0.6, 0.7]);
    mockSemanticSearch.mockReturnValue([]);
    mockKeywordSearch.mockReturnValue([{ memory_type: 'fact', content: '喜欢乌龙茶' }]);

    const { readMemoryTool } = await import('./read_memory.js');
    const result = await readMemoryTool.execute({ query: '我的口味偏好' });

    expect(mockSemanticSearch).toHaveBeenCalledWith([0.5, 0.6, 0.7], 5, 0.75);
    expect(mockKeywordSearch).toHaveBeenCalledWith('我的口味偏好', 5);
    expect(result).toContain('喜欢乌龙茶');
  });

  it('falls back to keyword search when embedding fails', async () => {
    mockGetEmbeddingService.mockReturnValue({ embed: mockEmbed });
    mockEmbed.mockRejectedValue(new Error('embedding failed'));
    mockKeywordSearch.mockReturnValue([{ memory_type: 'fact', content: '常住上海' }]);

    const { readMemoryTool } = await import('./read_memory.js');
    const result = await readMemoryTool.execute({ query: '我住在哪里', limit: 3 });

    expect(mockKeywordSearch).toHaveBeenCalledWith('我住在哪里', 3);
    expect(result).toContain('常住上海');
  });

  it('uses keyword search directly when no embedding service is configured', async () => {
    mockGetEmbeddingService.mockReturnValue(null);
    mockKeywordSearch.mockReturnValue([]);

    const { readMemoryTool } = await import('./read_memory.js');
    const result = await readMemoryTool.execute({ query: '偏好' });

    expect(mockKeywordSearch).toHaveBeenCalledWith('偏好', 5);
    expect(result).toBe('未找到相关记忆');
  });
});
