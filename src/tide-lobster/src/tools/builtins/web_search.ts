import { getFetchDispatcherForUrl } from '../../net/fetchDispatcher.js';
import type { ToolDef } from '../types.js';

type SearchResult = { title: string; url: string; snippet: string };

async function searchDuckDuckGo(query: string, limit: number): Promise<SearchResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SwellLobster/1.0)' },
    // @ts-expect-error undici dispatcher
    dispatcher: getFetchDispatcherForUrl(url),
  });
  if (!res.ok) throw new Error(`DuckDuckGo HTTP ${res.status}`);
  const html = await res.text();

  const results: SearchResult[] = [];
  // 解析 DuckDuckGo HTML 结果：<a class="result__a" href="...">title</a> + <a class="result__snippet">snippet</a>
  const linkRe = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const snippetRe = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

  const links: Array<{ url: string; title: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null && links.length < limit) {
    const rawUrl = m[1];
    const title = m[2].replace(/<[^>]+>/g, '').trim();
    // DuckDuckGo 重定向 URL 格式：//duckduckgo.com/l/?uddg=<encoded>
    let finalUrl = rawUrl;
    if (rawUrl.includes('uddg=')) {
      try {
        finalUrl = decodeURIComponent(rawUrl.split('uddg=')[1]?.split('&')[0] ?? rawUrl);
      } catch {
        finalUrl = rawUrl;
      }
    }
    if (title && finalUrl.startsWith('http')) links.push({ url: finalUrl, title });
  }

  const snippets: string[] = [];
  while ((m = snippetRe.exec(html)) !== null && snippets.length < limit) {
    snippets.push(m[1].replace(/<[^>]+>/g, '').trim());
  }

  for (let i = 0; i < links.length; i++) {
    results.push({ title: links[i].title, url: links[i].url, snippet: snippets[i] ?? '' });
  }
  return results;
}

async function searchBrave(query: string, limit: number, apiKey: string): Promise<SearchResult[]> {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey },
    // @ts-expect-error undici dispatcher
    dispatcher: getFetchDispatcherForUrl(url),
  });
  if (!res.ok) throw new Error(`Brave Search HTTP ${res.status}`);
  const data = (await res.json()) as {
    web?: { results?: Array<{ title: string; url: string; description?: string }> };
  };
  return (data.web?.results ?? []).slice(0, limit).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.description ?? '',
  }));
}

async function searchTavily(query: string, limit: number, apiKey: string): Promise<SearchResult[]> {
  const url = 'https://api.tavily.com/search';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey, query, max_results: limit }),
    // @ts-expect-error undici dispatcher
    dispatcher: getFetchDispatcherForUrl(url),
  });
  if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`);
  const data = (await res.json()) as {
    results?: Array<{ title: string; url: string; content?: string }>;
  };
  return (data.results ?? []).slice(0, limit).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.content ?? '',
  }));
}

export const webSearchTool: ToolDef = {
  name: 'web_search',
  description: '搜索互联网获取最新信息。优先使用 Brave Search 或 Tavily（需配置 API key），默认使用 DuckDuckGo（免费）。',
  parameters: {
    query: {
      type: 'string',
      description: '搜索查询词',
      required: true,
    },
    limit: {
      type: 'number',
      description: '返回结果数量（默认 5，最多 10）',
      required: false,
    },
  },
  async execute({ query, limit }) {
    const keyword = String(query ?? '').trim();
    if (!keyword) return '未提供搜索关键词';

    const maxResults = Math.min(Number(limit ?? 5), 10);
    const braveKey = process.env.BRAVE_SEARCH_API_KEY?.trim();
    const tavilyKey = process.env.TAVILY_API_KEY?.trim();

    let results: SearchResult[];
    let provider: string;

    try {
      if (braveKey) {
        results = await searchBrave(keyword, maxResults, braveKey);
        provider = 'Brave Search';
      } else if (tavilyKey) {
        results = await searchTavily(keyword, maxResults, tavilyKey);
        provider = 'Tavily';
      } else {
        results = await searchDuckDuckGo(keyword, maxResults);
        provider = 'DuckDuckGo';
      }
    } catch (err) {
      // 主提供商失败时降级到 DuckDuckGo
      if (provider! !== 'DuckDuckGo') {
        try {
          results = await searchDuckDuckGo(keyword, maxResults);
          provider = 'DuckDuckGo (fallback)';
        } catch {
          return `搜索失败：${err instanceof Error ? err.message : String(err)}`;
        }
      } else {
        return `搜索失败：${err instanceof Error ? err.message : String(err)}`;
      }
    }

    if (results.length === 0) return `[${provider!}] 未找到相关结果`;

    const lines = results.map(
      (r, i) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet}`
    );
    return `[${provider!}] 搜索"${keyword}"的结果：\n\n${lines.join('\n\n')}`;
  },
};
