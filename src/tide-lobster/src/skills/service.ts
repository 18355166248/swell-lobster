/**
 * 助手技能执行：选默认 LLM 端点、解析 API Key、调用 `requestChatCompletion`。
 */
import { getSkill } from './loader.js';
import { requestChatCompletion } from '../chat/llmClient.js';
import { EndpointStore } from '../store/endpointStore.js';
import { readConfiguredEnvValue } from '../config.js';
import { logSkillInvocation } from './logger.js';

const endpointStore = new EndpointStore();

function renderPromptTemplate(template: string, payload: Record<string, unknown>): string {
  const fallbackContext = typeof payload.context === 'string' ? payload.context : '';
  return template.replace(/\{\{(\w+)\}\}/g, (_, rawKey: string) => {
    const key = String(rawKey);
    if (key === 'context') return fallbackContext;
    const value = payload[key];
    return value == null ? '' : String(value);
  });
}

export function getApiKey(envName: string): string {
  return readConfiguredEnvValue(envName);
}

export async function executeSkill(
  skillName: string,
  context: string,
  opts?: { invokedBy?: 'ui' | 'im' }
): Promise<string> {
  const skill = getSkill(skillName);
  if (!skill) throw new Error(`技能 "${skillName}" 不存在`);
  if (!skill.enabled) throw new Error(`技能 "${skillName}" 已禁用`);

  const startedAt = Date.now();
  const payload: Record<string, unknown> = { context };
  const prompt = renderPromptTemplate(skill.prompt_template, payload);
  const invokedBy = opts?.invokedBy ?? 'ui';

  const endpoints = endpointStore.listEndpoints().filter((ep: any) => ep.enabled !== 0);
  if (endpoints.length === 0) {
    const message = '未找到可用端点，请先在 LLM 配置里添加并启用端点';
    logSkillInvocation({
      skillName: skill.name,
      triggerType: 'manual',
      invokedBy,
      inputContext: context,
      status: 'failed',
      errorMessage: message,
      durationMs: Date.now() - startedAt,
    });
    throw new Error(message);
  }

  const endpoint = endpoints[0] as any;
  let apiKey = getApiKey(endpoint.api_key_env ?? '');
  if (!apiKey) apiKey = 'local';

  try {
    const result = await requestChatCompletion({
      endpoint,
      apiKey,
      messages: [{ role: 'user', content: prompt }],
    });
    logSkillInvocation({
      skillName: skill.name,
      triggerType: 'manual',
      invokedBy,
      inputContext: context,
      output: result.content,
      status: 'success',
      durationMs: Date.now() - startedAt,
      endpointName: endpoint.name,
    });
    return result.content;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logSkillInvocation({
      skillName: skill.name,
      triggerType: 'manual',
      invokedBy,
      inputContext: context,
      status: 'failed',
      errorMessage: message,
      durationMs: Date.now() - startedAt,
      endpointName: endpoint.name,
    });
    throw error;
  }
}
