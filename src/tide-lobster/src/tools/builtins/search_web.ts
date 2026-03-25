import type { ToolDef } from '../types.js';

type TavilyResult = {
  title: string;
  url: string;
  content: string;
  score?: number;
};

type TavilyResponse = {
  answer?: string;
  results: TavilyResult[];
};

export const searchWebTool: ToolDef = {
  name: 'search_web',
  description: '搜索网页公开信息',
  parameters: {
    query: {
      type: 'string',
      description: '搜索关键词',
      required: true,
    },
  },
  async execute({ query }) {
    const keyword = String(query ?? '').trim();
    if (!keyword) return '未提供搜索关键词';

    const apiKey = process.env.TAVILY_API_KEY ?? process.env.SWELL_TAVILY_API_KEY ?? '';
    if (!apiKey) return '搜索失败：未配置 TAVILY_API_KEY';

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);

    try {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          query: keyword,
          search_depth: 'basic',
          max_results: 5,
          include_answer: true,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        return `搜索失败：${res.status} ${res.statusText}`;
      }

      const data = (await res.json()) as TavilyResponse;
      const parts: string[] = [];

      if (data.answer) {
        parts.push(`【摘要】${data.answer}`);
      }

      if (Array.isArray(data.results)) {
        for (const item of data.results) {
          const snippet = item.content ? item.content.slice(0, 200) : '';
          parts.push(`【${item.title}】${snippet}\n${item.url}`);
        }
      }

      return parts.length > 0 ? parts.join('\n\n') : '未找到相关网页结果';
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return '搜索失败：请求超时';
      }
      return `搜索失败：${error instanceof Error ? error.message : String(error)}`;
    } finally {
      clearTimeout(timer);
    }
  },
};
