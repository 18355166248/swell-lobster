import { memoryStore } from '../../memory/store.js';
import type { MemoryType } from '../../memory/types.js';
import { ToolRiskLevel, type ToolDef } from '../types.js';

export const writeMemoryTool: ToolDef = {
  name: 'write_memory',
  description: '保存一条记忆',
  permission: {
    riskLevel: ToolRiskLevel.write,
    requiresApproval: false,
    sideEffectSummary: 'Writes a new memory record into the local long-term memory store.',
  },
  parameters: {
    content: {
      type: 'string',
      description: '记忆内容',
      required: true,
    },
    memory_type: {
      type: 'string',
      description: 'fact/preference/event/rule',
      enum: ['fact', 'preference', 'event', 'rule'],
      required: true,
    },
    importance: {
      type: 'number',
      description: '重要性 1-10',
      required: false,
    },
  },
  async execute({ content, memory_type, importance }) {
    const text = String(content ?? '').trim();
    if (!text) return '记忆内容不能为空';

    memoryStore.create({
      content: text,
      memory_type: memory_type as MemoryType,
      importance: Number(importance ?? 5),
    });
    return '记忆已保存';
  },
};
