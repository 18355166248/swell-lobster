import { readConfiguredEnvValue, type SearchProvider } from '../../config.js';
import { getFetchDispatcherForUrl } from '../../net/fetchDispatcher.js';
import { ToolRiskLevel, type ToolDef } from '../types.js';

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

function getSearchConfig(): {
  provider: SearchProvider;
  braveEnvKey: string;
  braveKey: string;
  tavilyEnvKey: string;
  tavilyKey: string;
} {
  const providerRaw = readConfiguredEnvValue('SWELL_SEARCH_PROVIDER');
  const provider: SearchProvider =
    providerRaw === 'brave' ||
    providerRaw === 'tavily' ||
    providerRaw === 'duckduckgo' ||
    providerRaw === 'auto'
      ? providerRaw
      : 'auto';
  const braveEnvKey = readConfiguredEnvValue('SWELL_BRAVE_SEARCH_API_KEY_ENV') || 'BRAVE_SEARCH_API_KEY';
  const tavilyEnvKey = readConfiguredEnvValue('SWELL_TAVILY_API_KEY_ENV') || 'TAVILY_API_KEY';
  return {
    provider,
    braveEnvKey,
    braveKey: readConfiguredEnvValue(braveEnvKey),
    tavilyEnvKey,
    tavilyKey: readConfiguredEnvValue(tavilyEnvKey),
  };
}

export const webSearchTool: ToolDef = {
  name: 'web_search',
  description:
    '搜索互联网获取最新信息。支持 auto、Brave Search、Tavily、DuckDuckGo 四种模式；auto 会自动选择可用提供商并回退。',
  permission: {
    riskLevel: ToolRiskLevel.network,
    requiresApproval: true,
    networkScopes: ['brave', 'tavily', 'duckduckgo'],
    sideEffectSummary:
      'Sends outbound search requests to configured web search providers and returns summarized results.',
  },
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
    const { provider: configuredProvider, braveEnvKey, braveKey, tavilyEnvKey, tavilyKey } =
      getSearchConfig();

    let results: SearchResult[];
    let providerLabel = '';

    try {
      if (configuredProvider === 'brave') {
        if (!braveKey) {
          return `搜索失败：当前已强制使用 Brave Search，但未配置 ${braveEnvKey}`;
        }
        providerLabel = 'Brave Search';
        results = await searchBrave(keyword, maxResults, braveKey);
      } else if (configuredProvider === 'tavily') {
        if (!tavilyKey) {
          return `搜索失败：当前已强制使用 Tavily，但未配置 ${tavilyEnvKey}`;
        }
        providerLabel = 'Tavily';
        results = await searchTavily(keyword, maxResults, tavilyKey);
      } else if (configuredProvider === 'duckduckgo') {
        providerLabel = 'DuckDuckGo';
        results = await searchDuckDuckGo(keyword, maxResults);
      } else {
        if (braveKey) {
          providerLabel = 'Brave Search';
          results = await searchBrave(keyword, maxResults, braveKey);
        } else if (tavilyKey) {
          providerLabel = 'Tavily';
          results = await searchTavily(keyword, maxResults, tavilyKey);
        } else {
          providerLabel = 'DuckDuckGo';
          results = await searchDuckDuckGo(keyword, maxResults);
        }
      }
    } catch (err) {
      // auto 模式下才执行回退，显式模式保持失败透明
      if (configuredProvider === 'auto' && providerLabel !== 'DuckDuckGo') {
        try {
          results = await searchDuckDuckGo(keyword, maxResults);
          providerLabel = 'DuckDuckGo (fallback)';
        } catch {
          return `搜索失败：${err instanceof Error ? err.message : String(err)}`;
        }
      } else {
        return `搜索失败：${err instanceof Error ? err.message : String(err)}`;
      }
    }

    if (results.length === 0) return `[${providerLabel}] 未找到相关结果`;

    const lines = results.map(
      (r, i) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet}`
    );
    return `[${providerLabel}] 搜索"${keyword}"的结果：\n\n${lines.join('\n\n')}`;
  },
};
