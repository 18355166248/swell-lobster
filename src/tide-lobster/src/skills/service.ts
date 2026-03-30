/**
 * 助手技能执行：选默认 LLM 端点、解析 API Key、调用 `requestChatCompletion`。
 *
 * 端点取「已启用列表的第一项」；若进程环境未注入 key，会尝试解析仓库根 `.env`（与 dev 场景一致）。
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getSkill } from './loader.js';
import { requestChatCompletion } from '../chat/llmClient.js';
import { EndpointStore } from '../store/endpointStore.js';
import { settings } from '../config.js';
import { parseEnv } from '../utils/envUtils.js';

const endpointStore = new EndpointStore();

/**
 * 从 `process.env` 或 `.env` 文件读取密钥；`api_key_env` 为空时返回空串。
 * 无密钥时下游可能传占位 `local`，取决于 LLM 客户端实现。
 */
function getApiKey(envName: string): string {
  if (!envName) return '';
  if (process.env[envName]) return String(process.env[envName]);
  const envPath = resolve(settings.projectRoot, '.env');
  if (!existsSync(envPath)) return '';
  try {
    const content = readFileSync(envPath, 'utf-8');
    const parsed = parseEnv(content);
    return parsed[envName] ?? '';
  } catch {
    return '';
  }
}

/**
 * 手动执行技能：将 `{{context}}` 替换为入参，对「第一个已启用端点」发单条 user 消息。
 * 技能必须存在且未被 KV 禁用。
 */
export async function executeSkill(skillName: string, context: string): Promise<string> {
  const skill = getSkill(skillName);
  if (!skill) throw new Error(`技能 "${skillName}" 不存在`);
  if (!skill.enabled) throw new Error(`技能 "${skillName}" 已禁用`);

  const prompt = skill.prompt_template.replace(/\{\{context\}\}/g, context);

  const endpoints = endpointStore.listEndpoints().filter((ep: any) => ep.enabled !== 0);
  if (endpoints.length === 0) throw new Error('未找到可用端点，请先在 LLM 配置里添加并启用端点');

  const ep = endpoints[0] as any;
  let apiKey = getApiKey(ep.api_key_env ?? '');
  if (!apiKey) apiKey = 'local';

  const result = await requestChatCompletion({
    endpoint: ep,
    apiKey,
    messages: [{ role: 'user', content: prompt }],
  });

  return result.content;
}
