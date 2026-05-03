import { settings } from '../../config.js';
import { getEmbeddingService } from '../../memory/embeddingService.js';
import { memoryStore } from '../../memory/store.js';
import { ToolRiskLevel, type ToolDef } from '../types.js';

export const readMemoryTool: ToolDef = {
  name: 'read_memory',
  description: '搜索用户的长期记忆',
  permission: {
    riskLevel: ToolRiskLevel.readonly,
    requiresApproval: false,
    sideEffectSummary: 'Reads the local long-term memory store and returns matching entries.',
  },
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

    const k = Number(limit ?? 5);
    const embSvc = getEmbeddingService();

    if (embSvc) {
      try {
        const vec = await embSvc.embed(keyword);
        const results = memoryStore.semanticSearch(vec, k, settings.memorySemanticMinScore);
        if (results.length > 0) {
          return results
            .map((m) => `[${m.memory_type}] ${m.content} (相似度: ${m.score.toFixed(3)})`)
            .join('\n');
        }
      } catch {
        // embedding 失败时降级到 LIKE 检索
      }
    }

    const memories = memoryStore.search(keyword, k);
    if (memories.length === 0) return '未找到相关记忆';
    return memories.map((m) => `[${m.memory_type}] ${m.content}`).join('\n');
  },
};
