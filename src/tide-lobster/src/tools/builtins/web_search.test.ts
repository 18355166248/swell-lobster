import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockDispatcher = Symbol('dispatcher');
const mockGetFetchDispatcherForUrl = vi.fn(() => mockDispatcher);

vi.mock('../../net/fetchDispatcher.js', () => ({
  getFetchDispatcherForUrl: mockGetFetchDispatcherForUrl,
}));

describe('webSearchTool', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.BRAVE_SEARCH_API_KEY;
    delete process.env.TAVILY_API_KEY;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.BRAVE_SEARCH_API_KEY;
    delete process.env.TAVILY_API_KEY;
  });

  it('uses Brave Search when BRAVE_SEARCH_API_KEY is configured', async () => {
    process.env.BRAVE_SEARCH_API_KEY = 'brave-key';
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
    process.env.BRAVE_SEARCH_API_KEY = 'brave-key';
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
    process.env.TAVILY_API_KEY = 'tavily-key';
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
});
