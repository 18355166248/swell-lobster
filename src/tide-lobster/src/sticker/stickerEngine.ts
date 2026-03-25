/**
 * ChineseBQB 表情包索引：关键词搜索 + 情绪映射。
 * 数据源: https://github.com/zhaoolee/ChineseBQB
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export type StickerRecord = {
  name: string;
  category?: string;
  url: string;
};

const INDEX_URL =
  'https://raw.githubusercontent.com/zhaoolee/ChineseBQB/master/chinesebqb_github.json';
const MIRRORS = [
  'https://cdn.jsdelivr.net/gh/zhaoolee/ChineseBQB@master/',
  'https://raw.gitmirror.com/zhaoolee/ChineseBQB/master/',
];
const GITHUB_RAW_PREFIX = 'https://raw.githubusercontent.com/zhaoolee/ChineseBQB/master/';

/** 情绪 → 检索用词（与 openakita sticker.py 对齐） */
export const MOOD_KEYWORDS: Record<string, string[]> = {
  happy: ['开心', '高兴', '哈哈', '笑', '鼓掌', '庆祝', '耶', '棒'],
  sad: ['难过', '伤心', '哭', '可怜', '委屈', '泪'],
  angry: ['生气', '愤怒', '菜刀', '打人', '暴怒', '摔'],
  greeting: ['你好', '早安', '晚安', '问好', '招手', '嗨'],
  encourage: ['加油', '棒', '厉害', '优秀', 'tql', '冲', '赞'],
  love: ['爱心', '心心', '比心', '送你', '花', '爱', '亲亲'],
  tired: ['累', '困', '摸鱼', '划水', '上吊', '要饭', '躺平', '摆烂'],
  surprise: ['震惊', '惊吓', '天哪', '不是吧', '卧槽', '吃惊'],
};

function extractStickerList(data: unknown): StickerRecord[] {
  if (Array.isArray(data)) {
    return data.filter((item) => item && typeof item === 'object' && 'url' in item) as StickerRecord[];
  }
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    if (Array.isArray(d.data)) {
      return d.data.filter((item) => item && typeof item === 'object' && 'url' in item) as StickerRecord[];
    }
    if (Array.isArray(d.stickers)) {
      return d.stickers.filter(
        (item) => item && typeof item === 'object' && 'url' in item
      ) as StickerRecord[];
    }
  }
  return [];
}

async function downloadBytes(url: string, timeoutMs: number): Promise<Uint8Array | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    return buf;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export class StickerEngine {
  private readonly indexFile: string;
  private readonly cacheDir: string;
  private _stickers: StickerRecord[] = [];
  private readonly keywordIndex = new Map<string, number[]>();
  private readonly categoryIndex = new Map<string, number[]>();
  private _initialized = false;
  private initPromise: Promise<boolean> | null = null;

  constructor(dataDir: string) {
    this.indexFile = resolve(dataDir, 'chinesebqb_index.json');
    this.cacheDir = resolve(dataDir, 'cache');
  }

  /** 懒加载：首次 search / mood 前拉取或读本地索引 */
  async ensureInitialized(): Promise<boolean> {
    if (this._initialized) return true;
    if (!this.initPromise) {
      this.initPromise = this.initialize();
    }
    const ok = await this.initPromise;
    if (!ok) this.initPromise = null;
    return ok;
  }

  private async initialize(): Promise<boolean> {
    mkdirSync(resolve(this.indexFile, '..'), { recursive: true });
    mkdirSync(this.cacheDir, { recursive: true });

    if (existsSync(this.indexFile)) {
      try {
        const raw = readFileSync(this.indexFile, 'utf-8');
        const data = JSON.parse(raw) as unknown;
        this._stickers = extractStickerList(data);
        this._buildIndices();
        this._initialized = true;
        return true;
      } catch {
        // fall through to download
      }
    }

    const ok = await this.downloadIndex();
    if (ok) {
      this._buildIndices();
      this._initialized = true;
    }
    return this._initialized;
  }

  private async downloadIndex(): Promise<boolean> {
    const relative = 'chinesebqb_github.json';
    const urls = [INDEX_URL, ...MIRRORS.map((m) => m + relative)];

    for (const url of urls) {
      const bytes = await downloadBytes(url, 45_000);
      if (!bytes) continue;
      try {
        const text = new TextDecoder('utf-8').decode(bytes);
        const data = JSON.parse(text) as unknown;
        this._stickers = extractStickerList(data);
        writeFileSync(this.indexFile, JSON.stringify(data), 'utf-8');
        return true;
      } catch {
        continue;
      }
    }
    return false;
  }

  private _buildIndices(): void {
    this.keywordIndex.clear();
    this.categoryIndex.clear();

    for (let idx = 0; idx < this._stickers.length; idx++) {
      const sticker = this._stickers[idx];
      const name = sticker.name ?? '';
      const category = sticker.category ?? '';

      if (category) {
        const catCn = category.replace(/^\d+\w*_/, '');
        if (!this.categoryIndex.has(catCn)) this.categoryIndex.set(catCn, []);
        this.categoryIndex.get(catCn)!.push(idx);
      }

      const baseName = name.replace(/\.\w+$/, '');
      const parts = baseName.split(/[-_]/);
      for (const part of parts) {
        const cnMatches = part.match(/[\u4e00-\u9fff]+/g);
        if (!cnMatches) continue;
        for (const kw of cnMatches) {
          if (kw.length < 1) continue;
          if (!this.keywordIndex.has(kw)) this.keywordIndex.set(kw, []);
          this.keywordIndex.get(kw)!.push(idx);
        }
      }
    }
  }

  async search(query: string, category: string | undefined, limit: number): Promise<StickerRecord[]> {
    await this.ensureInitialized();
    if (this._stickers.length === 0) return [];

    const candidateIndices = new Set<number>();

    for (const [kw, indices] of this.keywordIndex) {
      if (query.includes(kw) || kw.includes(query)) {
        for (const i of indices) candidateIndices.add(i);
      }
    }

    if (candidateIndices.size === 0) {
      for (const char of query) {
        const indices = this.keywordIndex.get(char);
        if (indices) for (const i of indices) candidateIndices.add(i);
      }
    }

    if (category) {
      const catIndices = new Set<number>();
      for (const [catName, indices] of this.categoryIndex) {
        if (category.includes(catName) || catName.includes(category)) {
          for (const i of indices) catIndices.add(i);
        }
      }
      if (catIndices.size > 0) {
        if (candidateIndices.size > 0) {
          for (const i of candidateIndices) {
            if (!catIndices.has(i)) candidateIndices.delete(i);
          }
        } else {
          for (const i of catIndices) candidateIndices.add(i);
        }
      }
    }

    const results: StickerRecord[] = [];
    for (const i of candidateIndices) {
      if (i < this._stickers.length) results.push(this._stickers[i]);
    }

    if (results.length <= limit) return results;

    const shuffled = [...results];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, limit);
  }

  async getRandomByMood(mood: string): Promise<StickerRecord | null> {
    const keywords = MOOD_KEYWORDS[mood] ?? [];
    if (keywords.length === 0) return null;

    const pool: StickerRecord[] = [];
    const shuffledKw = [...keywords].sort(() => Math.random() - 0.5);
    for (const kw of shuffledKw.slice(0, 4)) {
      const found = await this.search(kw, undefined, 12);
      pool.push(...found);
    }

    const seen = new Set<string>();
    const unique: StickerRecord[] = [];
    for (const s of pool) {
      const u = s.url;
      if (seen.has(u)) continue;
      seen.add(u);
      unique.push(s);
    }

    if (unique.length === 0) return null;
    return unique[Math.floor(Math.random() * unique.length)];
  }

  /** 下载到本地缓存（可选，供将来 IM 发文件等）；返回缓存路径 */
  async downloadAndCache(url: string): Promise<string | null> {
    await this.ensureInitialized();
    const hash = createHash('md5').update(url).digest('hex');
    const ext = url.includes('.') ? url.split('.').pop()?.replace(/[^a-z0-9]/gi, '') || 'gif' : 'gif';
    const cachePath = resolve(this.cacheDir, `${hash}.${ext}`);
    if (existsSync(cachePath)) return cachePath;

    const urlsToTry = [url];
    if (url.startsWith(GITHUB_RAW_PREFIX)) {
      const relative = url.slice(GITHUB_RAW_PREFIX.length);
      for (const mirror of MIRRORS) urlsToTry.push(mirror + relative);
    }

    for (const attemptUrl of urlsToTry) {
      const bytes = await downloadBytes(attemptUrl, 20_000);
      if (bytes) {
        writeFileSync(cachePath, bytes);
        return cachePath;
      }
    }
    return null;
  }
}

let singleton: StickerEngine | null = null;

/** 单例：索引较大，避免重复构建 keyword 映射 */
export function getStickerEngine(dataDir: string): StickerEngine {
  if (!singleton) singleton = new StickerEngine(dataDir);
  return singleton;
}
