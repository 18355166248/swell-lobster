import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockDispatcher = Symbol('dispatcher');
const mockGetFetchDispatcherForUrl = vi.fn(() => mockDispatcher);
const mockEnv: Record<string, string> = {};

vi.mock('../../net/fetchDispatcher.js', () => ({
  getFetchDispatcherForUrl: mockGetFetchDispatcherForUrl,
}));

vi.mock('../../config.js', () => ({
  readConfiguredEnvValue: (envName: string) => mockEnv[envName] ?? '',
}));

describe('webSearchTool', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(mockEnv)) delete mockEnv[key];
    mockEnv.SWELL_SEARCH_PROVIDER = 'auto';
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('uses Brave Search when BRAVE_SEARCH_API_KEY is configured', async () => {
    mockEnv.BRAVE_SEARCH_API_KEY = 'brave-key';
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        web: {
          results: [
            {
              title: 'Brave result',
              url: 'https://example.com/brave',
              description: 'from brave',
            },
          ],
        },
      }),
    }) as typeof fetch;

    const { webSearchTool } = await import('./web_search.js');
    const result = await webSearchTool.execute({ query: 'latest ai', limit: 1 });

    expect(global.fetch).toHaveBeenCalledOnce();
    expect(result).toContain('[Brave Search]');
    expect(result).toContain('Brave result');
  });

  it('falls back to DuckDuckGo when Brave Search fails', async () => {
    mockEnv.BRAVE_SEARCH_API_KEY = 'brave-key';
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          '<a class="result__a" href="https://example.com/ddg">Duck result</a><a class="result__snippet">fallback snippet</a>',
      }) as typeof fetch;

    const { webSearchTool } = await import('./web_search.js');
    const result = await webSearchTool.execute({ query: 'fallback case' });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(result).toContain('[DuckDuckGo (fallback)]');
    expect(result).toContain('Duck result');
  });

  it('uses Tavily when Brave is absent and Tavily key is configured', async () => {
    mockEnv.TAVILY_API_KEY = 'tavily-key';
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            title: 'Tavily result',
            url: 'https://example.com/tavily',
            content: 'from tavily',
          },
        ],
      }),
    }) as typeof fetch;

    const { webSearchTool } = await import('./web_search.js');
    const result = await webSearchTool.execute({ query: 'semantic search' });

    expect(result).toContain('[Tavily]');
    expect(result).toContain('Tavily result');
  });

  it('uses explicit duckduckgo provider without checking paid keys', async () => {
    mockEnv.SWELL_SEARCH_PROVIDER = 'duckduckgo';
    mockEnv.BRAVE_SEARCH_API_KEY = 'brave-key';
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        '<a class="result__a" href="https://example.com/ddg">Duck only</a><a class="result__snippet">free search</a>',
    }) as typeof fetch;

    const { webSearchTool } = await import('./web_search.js');
    const result = await webSearchTool.execute({ query: 'forced ddg', limit: 1 });

    expect(global.fetch).toHaveBeenCalledOnce();
    expect(result).toContain('[DuckDuckGo]');
    expect(result).toContain('Duck only');
  });

  it('returns configuration error when explicit brave provider has no key', async () => {
    mockEnv.SWELL_SEARCH_PROVIDER = 'brave';
    global.fetch = vi.fn() as typeof fetch;

    const { webSearchTool } = await import('./web_search.js');
    const result = await webSearchTool.execute({ query: 'forced brave' });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(result).toContain('未配置 BRAVE_SEARCH_API_KEY');
  });
});
