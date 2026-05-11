/**
 * 助手技能执行：选默认 LLM 端点、解析 API Key、调用 `requestChatCompletion`。
 */
import { getSkill } from './loader.js';
import { requestWithFallback, type LLMRequestMessage } from '../chat/llmClient.js';
import { EndpointStore } from '../store/endpointStore.js';
import { readConfiguredEnvValue } from '../config.js';
import { logSkillInvocation } from './logger.js';
import { globalToolRegistry } from '../tools/registry.js';

const endpointStore = new EndpointStore();
const MAX_SKILL_TOOL_ROUNDS = 8;

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
    const result = await runSkillCompletion({
      endpoint,
      apiKey,
      messages: [{ role: 'user', content: prompt }],
    });
    logSkillInvocation({
      skillName: skill.name,
      triggerType: 'manual',
      invokedBy,
      inputContext: context,
      output: result,
      status: 'success',
      durationMs: Date.now() - startedAt,
      endpointName: endpoint.name,
    });
    return result;
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

async function runSkillCompletion(args: {
  endpoint: any;
  apiKey: string;
  messages: LLMRequestMessage[];
}): Promise<string> {
  let currentMessages = [...args.messages];
  let lastContent = '';

  for (let round = 0; round < MAX_SKILL_TOOL_ROUNDS; round++) {
    const result = await requestWithFallback({
      endpoint: args.endpoint,
      apiKey: args.apiKey,
      messages: currentMessages,
      tools:
        args.endpoint.api_type === 'anthropic'
          ? globalToolRegistry.toAnthropicFormat()
          : globalToolRegistry.toOpenAIFormat(),
      resolveFallback: (endpointId) => endpointStore.getEndpointById(endpointId) ?? undefined,
      resolveApiKey: (endpoint) => {
        const value = getApiKey(endpoint.api_key_env ?? '');
        return value || 'local';
      },
    });

    if (!result.tool_calls?.length) {
      return result.content || lastContent;
    }

    currentMessages = [
      ...currentMessages,
      {
        role: 'assistant',
        content: result.content || null,
        tool_calls: result.tool_calls,
        ...(result.reasoning_content ? { reasoning_content: result.reasoning_content } : {}),
      },
    ];
    lastContent = result.content || lastContent;

    for (const toolCall of result.tool_calls) {
      const tool = globalToolRegistry.get(toolCall.name);
      let toolResult = '';
      if (!tool) {
        toolResult = `工具 ${toolCall.name} 不存在`;
      } else if (tool.permission.requiresApproval) {
        toolResult = `工具 ${toolCall.name} 需要审批，助手技能页暂不支持直接执行该工具`;
      } else {
        try {
          toolResult = await tool.execute(toolCall.arguments, {});
        } catch (error) {
          toolResult = error instanceof Error ? error.message : String(error);
        }
      }

      currentMessages = [
        ...currentMessages,
        {
          role: 'tool',
          tool_call_id: toolCall.id,
          name: toolCall.name,
          content: toolResult,
        },
      ];
    }
  }

  return lastContent || '技能工具调用达到上限，已停止继续执行。';
}
