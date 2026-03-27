import { memoryStore } from '../../memory/store.js';
import type { ToolDef } from '../types.js';

export const deleteMemoryTool: ToolDef = {
  name: 'delete_memory',
  description: '删除一条不再有效的记忆（用于纠正过时信息）',
  parameters: {
    query: {
      type: 'string',
      description: '要删除的记忆关键词',
      required: true,
    },
  },
  async execute({ query }) {
    const found = memoryStore.search(String(query), 1);
    if (!found.length) return '未找到匹配的记忆';
    memoryStore.delete(found[0].id);
    // 返回被删内容作为"最终确认"，AI 可在回复中告知用户删了哪条
    return `已删除记忆：${found[0].content}`;
  },
};
