import { z } from 'zod';

export const endpointSchema = z.object({
  providerSlug: z.string().min(1),
  baseUrl: z.string().refine((v) => v === '' || /^https?:\/\/.+/.test(v), {
    message: 'API 地址需以 http:// 或 https:// 开头',
  }),
  apiKeyValue: z.string(),
  apiKeyEnv: z.string(),
  apiType: z.enum(['openai', 'anthropic']),
  selectedModelId: z.string().min(1, '请填写或选择模型'),
  endpointName: z.string().max(64),
  capSelected: z.array(z.string()).min(1),
  endpointPriority: z.number().int().min(1),
  maxTokens: z.number().int().min(0),
  contextWindow: z.number().int().min(1024, '上下文窗口至少 1024'),
  timeoutSec: z.number().int().min(10, '超时至少 10 秒'),
  rpmLimit: z.number().int().min(0),
});

export type EndpointFormValues = z.infer<typeof endpointSchema>;
