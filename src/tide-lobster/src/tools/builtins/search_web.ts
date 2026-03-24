import type { ToolDef } from '../types.js';

type DuckDuckGoTopic = {
  Text?: string;
  FirstURL?: string;
  Topics?: DuckDuckGoTopic[];
};

function flattenTopics(topics: DuckDuckGoTopic[]): DuckDuckGoTopic[] {
  return topics.flatMap((topic) => (Array.isArray(topic.Topics) ? flattenTopics(topic.Topics) : [topic]));
}

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

    try {
      // 这里使用零配置的公开搜索接口，便于在未接入正式搜索服务前先打通工具链路。
      const url = new URL('https://api.duckduckgo.com/');
      url.searchParams.set('q', keyword);
      url.searchParams.set('format', 'json');
      url.searchParams.set('no_html', '1');
      url.searchParams.set('skip_disambig', '1');

      const res = await fetch(url, {
        headers: { accept: 'application/json' },
      });
      if (!res.ok) {
        return `搜索失败：${res.status}`;
      }

      const data = (await res.json()) as {
        AbstractText?: string;
        AbstractURL?: string;
        RelatedTopics?: DuckDuckGoTopic[];
      };

      const results: string[] = [];
      if (data.AbstractText) {
        results.push(`${data.AbstractText}${data.AbstractURL ? ` (${data.AbstractURL})` : ''}`);
      }

      const related = flattenTopics(data.RelatedTopics ?? [])
        .filter((item) => item.Text)
        .slice(0, 5)
        .map((item) => `${item.Text}${item.FirstURL ? ` (${item.FirstURL})` : ''}`);
      results.push(...related);

      return results.length > 0 ? results.join('\n') : '未找到相关网页结果';
    } catch (error) {
      return `搜索失败：${error instanceof Error ? error.message : String(error)}`;
    }
  },
};
