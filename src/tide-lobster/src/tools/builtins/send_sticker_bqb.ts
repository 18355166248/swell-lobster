/**
 * Emoji 表情工具：按关键词或情绪选取 emoji，返回供模型写入回复的文本。
 */
import { getStickerEngine, MOOD_KEYWORDS } from '../../sticker/stickerEngine.js';
import type { ToolDef } from '../types.js';

const MOOD_ENUM = Object.keys(MOOD_KEYWORDS);

export const sendStickerBqbTool: ToolDef = {
  name: 'send_sticker_bqb',
  description:
    '按关键词或情绪选取一个 emoji 表情。在需要轻松氛围、安慰/庆祝/撒娇时使用；每轮最多调用一次。返回内容须写入对用户可见的回复。',
  parameters: {
    query: {
      type: 'string',
      description: '搜索词，从用户原话或你想回应的情绪中提取（如「委屈」「加油」「晚安」）。',
      required: false,
    },
    mood: {
      type: 'string',
      description: '情绪类型（无合适关键词时使用）。',
      enum: MOOD_ENUM,
      required: false,
    },
  },
  async execute(raw) {
    const query = String(raw.query ?? '').trim();
    const mood = typeof raw.mood === 'string' ? raw.mood.trim() : '';

    if (!query && !mood) {
      return '调用失败：请至少提供 query（关键词）或 mood（情绪）之一。';
    }

    const engine = getStickerEngine();
    let record = null;

    if (query) {
      const found = engine.search(query, 12);
      if (found.length > 0) record = found[Math.floor(Math.random() * found.length)];
    }

    if (!record && mood) {
      record = engine.getRandomByMood(mood);
    }

    if (!record) {
      return `未找到匹配的表情（query=${query || '无'}, mood=${mood || '无'}）。可换一个关键词再试。`;
    }

    return `已选取表情，请将下面的 emoji **原样**加入你的回复（放在语气合适的位置）：\n\n${record.emoji}\n\n（含义：${record.name}）`;
  },
};
