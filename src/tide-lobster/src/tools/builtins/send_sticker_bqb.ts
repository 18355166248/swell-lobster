/**
 * ChineseBQB 表情包：按关键词或情绪选图，返回 Markdown 图片行供模型写入最终回复。
 * 与 identity 中 [BQB: 分类/文件] 约定配合：应用工具拿到真实 URL，避免占位符无法渲染。
 */
import { resolve } from 'node:path';

import { settings } from '../../config.js';
import type { StickerRecord } from '../../sticker/stickerEngine.js';
import { getStickerEngine, MOOD_KEYWORDS } from '../../sticker/stickerEngine.js';
import type { ToolDef } from '../types.js';

const MOOD_ENUM = Object.keys(MOOD_KEYWORDS);

function safeAlt(name: string): string {
  const base = name.replace(/\.\w+$/, '').slice(0, 48);
  return base.replace(/[\[\]]/g, '').trim() || 'sticker';
}

function pickOne(list: StickerRecord[]): StickerRecord | null {
  if (list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)] ?? null;
}

function formatToolResult(sticker: StickerRecord): string {
  const alt = safeAlt(sticker.name);
  const cat = sticker.category ? `，分类：${sticker.category}` : '';
  return [
    '已匹配 ChineseBQB 表情包，请将下面这一行 Markdown **原样**加入你的回复（可单独成行，放在语气合适的位置）：',
    '',
    `![${alt}](${sticker.url})`,
    '',
    `（文件名：${sticker.name}${cat}）`,
  ].join('\n');
}

export const sendStickerBqbTool: ToolDef = {
  name: 'send_sticker_bqb',
  description:
    '从 ChineseBQB 开源表情包库选取一张图。在需要轻松氛围、安慰/庆祝/撒娇、斗图、或人格设定要求发 BQB 时使用；每轮对话最多调用一次，避免刷屏。若同时有「情绪」与「关键词」，优先用关键词。返回内容含 Markdown 图片语法，须写入对用户可见的回复。',
  parameters: {
    query: {
      type: 'string',
      description:
        '搜索词：可从用户原话、你想回应的情绪或梗中提取（如「委屈」「冲鸭」「晚安」）。与 mood 二选一或同时提供时优先用于检索。',
      required: false,
    },
    mood: {
      type: 'string',
      description:
        '情绪类型（无合适关键词时使用）：从用户或你自己的语气判断。',
      enum: MOOD_ENUM,
      required: false,
    },
    category_hint: {
      type: 'string',
      description: '可选：限制在某一分类名下包含该字符串的图（如「全是心心」「Mur猫」）。',
      required: false,
    },
  },
  async execute(raw) {
    const query = String(raw.query ?? '').trim();
    const mood = typeof raw.mood === 'string' ? raw.mood.trim() : '';
    const categoryHint =
      typeof raw.category_hint === 'string' ? raw.category_hint.trim() : undefined;

    if (!query && !mood) {
      return '调用失败：请至少提供 query（关键词）或 mood（情绪）之一。';
    }

    const engine = getStickerEngine(resolve(settings.projectRoot, 'data', 'chinesebqb'));
    const ok = await engine.ensureInitialized();
    if (!ok) {
      return '表情包索引暂不可用（首次需联网下载 ChineseBQB 索引到 data/chinesebqb/）。请稍后再试或检查网络。';
    }

    let sticker: StickerRecord | null = null;

    if (query) {
      const found = await engine.search(query, categoryHint, 24);
      sticker = pickOne(found);
    }

    if (!sticker && mood && MOOD_KEYWORDS[mood]) {
      sticker = await engine.getRandomByMood(mood);
    }

    if (!sticker && query && mood && MOOD_KEYWORDS[mood]) {
      sticker = await engine.getRandomByMood(mood);
    }

    if (!sticker) {
      return `未找到匹配的表情包（query=${query || '无'}, mood=${mood || '无'}）。可换一个关键词或情绪再试。`;
    }

    return formatToolResult(sticker);
  },
};
