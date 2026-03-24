import { memoryStore } from '../../memory/store.js';
import type { ToolDef } from '../types.js';

export const readMemoryTool: ToolDef = {
  name: 'read_memory',
  description: '搜索用户的长期记忆',
  parameters: {
    query: {
      type: 'string',
      description: '搜索关键词',
      required: true,
    },
    limit: {
      type: 'number',
      description: '返回条数（默认 5）',
      required: false,
    },
  },
  async execute({ query, limit }) {
    const keyword = String(query ?? '').trim();
    if (!keyword) return '未提供搜索关键词';

    const memories = memoryStore.search(keyword, Number(limit ?? 5));
    if (memories.length === 0) return '未找到相关记忆';
    return memories.map((item) => `[${item.memory_type}] ${item.content}`).join('\n');
  },
};
