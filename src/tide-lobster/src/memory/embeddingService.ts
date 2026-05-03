import { readConfiguredEnvValue } from '../config.js';
import { getFetchDispatcherForUrl } from '../net/fetchDispatcher.js';

export type EmbeddingConfig = {
  baseUrl: string;
  model: string;
  apiKeyEnv?: string;
};

/** 余弦相似度，向量已归一化时等价于点积。 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export class EmbeddingService {
  private readonly config: EmbeddingConfig;

  constructor(config: EmbeddingConfig) {
    this.config = config;
  }

  async embed(text: string): Promise<number[]> {
    const { baseUrl, model, apiKeyEnv } = this.config;
    const apiKey = apiKeyEnv ? readConfiguredEnvValue(apiKeyEnv) : '';
    const url = `${baseUrl.replace(/\/$/, '')}/embeddings`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({ model, input: text }),
      // @ts-expect-error undici dispatcher
      dispatcher: getFetchDispatcherForUrl(url),
    });

    if (!res.ok) {
      throw new Error(`Embedding API ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as {
      data?: Array<{ embedding: number[] }>;
    };
    const embedding = data.data?.[0]?.embedding;
    if (!embedding || embedding.length === 0) {
      throw new Error('Embedding API returned empty vector');
    }
    return embedding;
  }
}

let _service: EmbeddingService | null = null;

/** 从环境变量构建单例；未配置时返回 null（降级到 LIKE 检索）。 */
export function getEmbeddingService(): EmbeddingService | null {
  const baseUrl = readConfiguredEnvValue('SWELL_EMBEDDING_BASE_URL');
  if (!baseUrl) return null;

  const model = readConfiguredEnvValue('SWELL_EMBEDDING_MODEL') || 'text-embedding-3-small';
  const apiKeyEnv = readConfiguredEnvValue('SWELL_EMBEDDING_API_KEY_ENV') || undefined;

  if (
    !_service ||
    (_service as unknown as { config: EmbeddingConfig }).config.baseUrl !== baseUrl ||
    (_service as unknown as { config: EmbeddingConfig }).config.model !== model
  ) {
    _service = new EmbeddingService({ baseUrl, model, apiKeyEnv });
  }
  return _service;
}
