/**
 * Emoji 表情引擎：关键词搜索 + 情绪映射，纯内存数据，无网络依赖。
 */

export type StickerRecord = {
  name: string;
  emoji: string;
  keywords: string[];
  mood?: string;
};

/** 情绪 → emoji 列表 */
export const MOOD_KEYWORDS: Record<string, string[]> = {
  happy: ['开心', '高兴', '哈哈', '笑', '庆祝', '棒'],
  sad: ['难过', '伤心', '哭', '委屈', '泪'],
  angry: ['生气', '愤怒', '暴怒'],
  greeting: ['你好', '早安', '晚安', '嗨'],
  encourage: ['加油', '棒', '厉害', '优秀', '赞'],
  love: ['爱心', '比心', '花', '爱', '亲亲'],
  tired: ['累', '困', '摸鱼', '躺平', '摆烂'],
  surprise: ['震惊', '天哪', '吃惊'],
};

const EMOJI_DATA: StickerRecord[] = [
  // happy
  { emoji: '😄', name: '开心笑', keywords: ['开心', '高兴', '笑', '哈哈'], mood: 'happy' },
  { emoji: '😆', name: '哈哈大笑', keywords: ['哈哈', '大笑', '好笑'], mood: 'happy' },
  { emoji: '🤣', name: '笑哭', keywords: ['笑哭', '哈哈', '太好笑'], mood: 'happy' },
  { emoji: '😁', name: '咧嘴笑', keywords: ['笑', '开心', '嘿嘿'], mood: 'happy' },
  { emoji: '🎉', name: '庆祝', keywords: ['庆祝', '撒花', '耶', '完成'], mood: 'happy' },
  { emoji: '🎊', name: '派对彩带', keywords: ['庆祝', '撒花', '派对'], mood: 'happy' },
  { emoji: '👏', name: '鼓掌', keywords: ['鼓掌', '棒', '厉害', '赞'], mood: 'happy' },
  { emoji: '🥳', name: '派对脸', keywords: ['派对', '庆祝', '生日'], mood: 'happy' },
  { emoji: '✨', name: '闪光', keywords: ['闪闪', '漂亮', '赞'], mood: 'happy' },

  // sad
  { emoji: '😢', name: '哭泣', keywords: ['难过', '哭', '伤心', '泪'], mood: 'sad' },
  { emoji: '😭', name: '嚎啕大哭', keywords: ['大哭', '哭', '委屈', '伤心'], mood: 'sad' },
  { emoji: '🥺', name: '可怜', keywords: ['可怜', '委屈', '求你', '泪'], mood: 'sad' },
  { emoji: '😔', name: '沮丧', keywords: ['难过', '沮丧', '郁闷'], mood: 'sad' },
  { emoji: '💔', name: '心碎', keywords: ['心碎', '伤心', '分手'], mood: 'sad' },

  // angry
  { emoji: '😤', name: '生气', keywords: ['生气', '气哼哼', '不高兴'], mood: 'angry' },
  { emoji: '😠', name: '愤怒', keywords: ['愤怒', '生气', '发火'], mood: 'angry' },
  { emoji: '😡', name: '暴怒', keywords: ['暴怒', '大怒', '气死'], mood: 'angry' },
  { emoji: '🤬', name: '骂人脸', keywords: ['骂人', '愤怒', '暴怒'], mood: 'angry' },
  { emoji: '💢', name: '愤怒符号', keywords: ['生气', '愤怒', '暴怒'], mood: 'angry' },

  // greeting
  { emoji: '👋', name: '挥手', keywords: ['你好', '嗨', '再见', '招手'], mood: 'greeting' },
  { emoji: '🙋', name: '举手', keywords: ['你好', '问好'], mood: 'greeting' },
  { emoji: '🌅', name: '日出', keywords: ['早安', '早上好', '清晨'], mood: 'greeting' },
  { emoji: '🌙', name: '月亮', keywords: ['晚安', '晚上好', '夜'], mood: 'greeting' },
  { emoji: '😊', name: '微笑', keywords: ['你好', '嗨', '微笑', '友好'], mood: 'greeting' },

  // encourage
  { emoji: '💪', name: '加油', keywords: ['加油', '冲', '努力', '坚持'], mood: 'encourage' },
  { emoji: '🔥', name: '火', keywords: ['冲', '加油', '厉害', '牛'], mood: 'encourage' },
  { emoji: '⭐', name: '星星', keywords: ['棒', '优秀', '厉害'], mood: 'encourage' },
  { emoji: '🏆', name: '奖杯', keywords: ['厉害', '冠军', '优秀', 'tql'], mood: 'encourage' },
  { emoji: '👍', name: '点赞', keywords: ['赞', '棒', '好', '不错'], mood: 'encourage' },
  { emoji: '🫡', name: '敬礼', keywords: ['收到', '明白', '是的', 'tql'], mood: 'encourage' },

  // love
  { emoji: '❤️', name: '红心', keywords: ['爱心', '爱', '喜欢'], mood: 'love' },
  { emoji: '🥰', name: '爱心脸', keywords: ['爱心', '爱', '喜欢', '可爱'], mood: 'love' },
  { emoji: '😍', name: '花痴', keywords: ['喜欢', '爱', '帅', '美'], mood: 'love' },
  { emoji: '🫶', name: '比心', keywords: ['比心', '爱心'], mood: 'love' },
  { emoji: '💕', name: '双心', keywords: ['爱心', '心心', '喜欢'], mood: 'love' },
  { emoji: '🌸', name: '樱花', keywords: ['花', '美', '可爱'], mood: 'love' },
  { emoji: '💝', name: '礼物心', keywords: ['送你', '爱心'], mood: 'love' },
  { emoji: '😘', name: '飞吻', keywords: ['亲亲', '飞吻', '爱'], mood: 'love' },

  // tired
  { emoji: '😴', name: '睡着', keywords: ['睡觉', '困', '累', '晚安'], mood: 'tired' },
  { emoji: '🥱', name: '打哈欠', keywords: ['困', '打哈欠', '无聊'], mood: 'tired' },
  { emoji: '😩', name: '精疲力竭', keywords: ['累', '好累', '不行了'], mood: 'tired' },
  { emoji: '🛌', name: '躺平', keywords: ['躺平', '摆烂', '休息'], mood: 'tired' },
  { emoji: '🫠', name: '融化', keywords: ['累', '摸鱼', '划水', '摆烂'], mood: 'tired' },
  { emoji: '😪', name: '瞌睡', keywords: ['困', '睡', '摸鱼'], mood: 'tired' },

  // surprise
  { emoji: '😱', name: '尖叫', keywords: ['震惊', '天哪', '吃惊', '可怕'], mood: 'surprise' },
  { emoji: '😮', name: '张大嘴', keywords: ['吃惊', '震惊', '哇'], mood: 'surprise' },
  { emoji: '🤯', name: '脑爆', keywords: ['天哪', '不是吧', '卧槽', '惊了'], mood: 'surprise' },
  { emoji: '😲', name: '惊讶', keywords: ['惊讶', '吃惊', '震惊'], mood: 'surprise' },
  { emoji: '👀', name: '眼睛', keywords: ['震惊', '盯着看', '注意'], mood: 'surprise' },

  // misc
  { emoji: '🤔', name: '思考', keywords: ['思考', '想想', '嗯'] },
  { emoji: '😏', name: '坏笑', keywords: ['坏笑', '嘿嘿', '阴险'] },
  { emoji: '🙈', name: '捂眼猴', keywords: ['不看', '害羞', '尴尬'] },
  { emoji: '🤗', name: '抱抱', keywords: ['抱抱', '温暖', '拥抱'] },
  { emoji: '😎', name: '酷', keywords: ['酷', '帅', '厉害'] },
  { emoji: '🤪', name: '滑稽', keywords: ['搞笑', '逗', '滑稽'] },
  { emoji: '🫣', name: '偷看', keywords: ['偷看', '害羞', '尴尬'] },
  { emoji: '🤭', name: '捂嘴笑', keywords: ['捂嘴', '偷笑', '哈哈'] },
  { emoji: '😐', name: '无语', keywords: ['无语', '沉默', '呵呵'] },
  { emoji: '🙄', name: '翻白眼', keywords: ['无语', '翻眼', '呵呵'] },
  { emoji: '💀', name: '骷髅', keywords: ['笑死', '累死', '死了'] },
  { emoji: '🫥', name: '隐身', keywords: ['不想说话', '消失', '摸鱼'] },
  { emoji: '🥴', name: '头晕', keywords: ['头晕', '晕', '迷糊'] },
  { emoji: '🤡', name: '小丑', keywords: ['小丑', '搞笑', '丑'] },
  { emoji: '👻', name: '鬼', keywords: ['鬼', '吓', '玩笑'] },
  { emoji: '🐶', name: '狗', keywords: ['狗', '可爱', '汪'] },
  { emoji: '🐱', name: '猫', keywords: ['猫', '可爱', '喵'] },
  { emoji: '🐸', name: '青蛙', keywords: ['青蛙', '呱'] },
  { emoji: '🐼', name: '熊猫', keywords: ['熊猫', '可爱'] },
];

export class StickerEngine {
  search(query: string, limit: number): StickerRecord[] {
    if (!query) return [];
    const results: StickerRecord[] = [];
    for (const record of EMOJI_DATA) {
      if (record.keywords.some((kw) => query.includes(kw) || kw.includes(query))) {
        results.push(record);
      }
    }
    if (results.length === 0) {
      for (const char of query) {
        for (const record of EMOJI_DATA) {
          if (record.keywords.some((kw) => kw.includes(char))) results.push(record);
        }
      }
    }
    const unique = [...new Map(results.map((r) => [r.emoji, r])).values()];
    if (unique.length <= limit) return unique;
    return [...unique].sort(() => Math.random() - 0.5).slice(0, limit);
  }

  getRandomByMood(mood: string): StickerRecord | null {
    const pool = EMOJI_DATA.filter((r) => r.mood === mood);
    if (pool.length === 0) return null;
    return pool[Math.floor(Math.random() * pool.length)] ?? null;
  }
}

let singleton: StickerEngine | null = null;

export function getStickerEngine(): StickerEngine {
  if (!singleton) singleton = new StickerEngine();
  return singleton;
}
