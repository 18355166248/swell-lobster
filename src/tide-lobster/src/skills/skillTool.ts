/**
 * 将助手技能（SkillDef）适配为 LLM function calling 工具（ToolDef）。
 *
 * 核心流程：注册时把技能元数据转成工具描述；执行时重新从磁盘读取最新技能定义，
 * 再走 invocation_policy 校验 → prompt 渲染 → LLM 请求 → 日志记录。
 */
import type { ToolDef, ToolParameter } from '../tools/types.js';
import { getSkill } from './loader.js';
import type { SkillDef } from './types.js';
import { EndpointStore } from '../store/endpointStore.js';
import { requestChatCompletion } from '../chat/llmClient.js';
import { logSkillInvocation } from './logger.js';
import { getApiKey } from './service.js';

const endpointStore = new EndpointStore();
// 工具名前缀，用于在 globalToolRegistry 中区分技能工具与内置工具
export const SKILL_TOOL_PREFIX = 'skill_';

/**
 * 将技能名称转换为合法的工具名片段。
 * LLM 工具名只允许 [a-z0-9_]，中文、连字符等字符统一替换为下划线，
 * 并去掉首尾多余的下划线。
 */
function sanitizeToolNamePart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * 将 prompt_template 中的 {{key}} 占位符替换为实际参数值。
 *
 * - {{context}} 始终使用 fallbackContext（见调用处说明）
 * - 其他占位符从 args 中取对应字段；找不到时替换为空字符串
 */
function renderPromptTemplate(
  template: string,
  args: Record<string, unknown>,
  fallbackContext: string
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, rawKey: string) => {
    const key = String(rawKey);
    if (key === 'context') return fallbackContext;
    const value = args[key];
    return value == null ? '' : String(value);
  });
}

/**
 * 截断工具描述至 200 字符。
 * OpenAI / Anthropic 等接口对 tool description 有长度限制，超长会导致请求报错。
 */
function trimDescription(description: string): string {
  return description.length > 200 ? `${description.slice(0, 197)}...` : description;
}

/**
 * 将技能的参数定义转换为工具参数格式。
 *
 * 若技能在 frontmatter 中声明了 parameters，按声明映射；
 * 否则退回到单个 context 参数，兼容只有 {{context}} 占位符的简单模板。
 */
function toToolParameters(skill: SkillDef): Record<string, ToolParameter> {
  if (skill.parameters && Object.keys(skill.parameters).length > 0) {
    return Object.fromEntries(
      Object.entries(skill.parameters).map(([name, parameter]) => [
        name,
        {
          type: parameter.type,
          description: parameter.description,
          required: parameter.required,
        },
      ])
    );
  }

  // 技能未定义显式参数时，回退到单个 context 参数，兼容无参数的 prompt_template
  return {
    context: {
      type: 'string',
      description: skill.description || `${skill.display_name} execution context`,
      required: true,
    },
  };
}

/**
 * 生成工具名：skill_<sanitized_skill_name>。
 * 技能名为空或全为非法字符时使用 'unnamed' 兜底，确保工具名始终合法。
 */
export function skillToToolName(skillName: string): string {
  const sanitized = sanitizeToolNamePart(skillName);
  return `${SKILL_TOOL_PREFIX}${sanitized || 'unnamed'}`;
}

/**
 * 将一个 SkillDef 转换为可注册到 globalToolRegistry 的 ToolDef。
 *
 * 注意：execute 函数在每次被 LLM 调用时才执行，不在注册时执行。
 */
export function skillDefToToolDef(skill: SkillDef): ToolDef {
  return {
    name: skillToToolName(skill.name),
    description: trimDescription(skill.description || skill.display_name || skill.name),
    parameters: toToolParameters(skill),
    async execute(args, context) {
      // 每次执行时重新从磁盘读取，确保文件热更新后立即生效，无需重启服务
      const latest = getSkill(skill.name);
      if (!latest) {
        return `技能 "${skill.name}" 不存在或已被移除。`;
      }
      if (!latest.enabled) {
        return `技能 "${skill.name}" 已禁用，无法执行。`;
      }
      // user_only 的技能不允许 LLM 自动调用，此处阻断并返回提示
      if (latest.invocation_policy === 'user_only') {
        return `技能 "${skill.name}" 仅允许手动执行。`;
      }

      const startedAt = Date.now();
      // 将完整参数序列化为字符串，存入日志的 input_context 字段
      const serializedArgs = JSON.stringify(args ?? {});
      // 无显式 context 参数时，将所有参数值拼接作为 {{context}} 占位符的替换内容
      const fallbackContext =
        typeof args.context === 'string' ? args.context : Object.values(args ?? {}).join(' ');
      const prompt = renderPromptTemplate(latest.prompt_template, args, fallbackContext);
      console.log("🚀 ~ skillDefToToolDef ~ skill:", skill)
      console.log("🚀 ~ skillDefToToolDef ~ prompt:", prompt)

      // 取第一个已启用的端点；enabled 存为 INTEGER，0 表示禁用
      const endpoints = endpointStore.listEndpoints().filter((ep: any) => ep.enabled !== 0);
      if (endpoints.length === 0) {
        const message = '未找到可用端点，请先在 LLM 配置里添加并启用端点';
        logSkillInvocation({
          skillName: latest.name,
          triggerType: 'llm_call',
          invokedBy: 'llm',
          inputContext: serializedArgs,
          status: 'failed',
          errorMessage: message,
          durationMs: Date.now() - startedAt,
          sessionId: context?.sessionId,
        });
        return message;
      }

      const endpoint = endpoints[0] as any;
      let apiKey = getApiKey(endpoint.api_key_env ?? '');
      // 本地模型（如 Ollama）不需要 API Key，使用占位值 'local' 跳过鉴权
      if (!apiKey) apiKey = 'local';

      try {
        const result = await requestChatCompletion({
          endpoint,
          apiKey,
          messages: [{ role: 'user', content: prompt }],
        });
        logSkillInvocation({
          skillName: latest.name,
          triggerType: 'llm_call',
          invokedBy: 'llm',
          inputContext: serializedArgs,
          output: result.content,
          status: 'success',
          durationMs: Date.now() - startedAt,
          sessionId: context?.sessionId,
          endpointName: endpoint.name,
        });
        return result.content;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logSkillInvocation({
          skillName: latest.name,
          triggerType: 'llm_call',
          invokedBy: 'llm',
          inputContext: serializedArgs,
          status: 'failed',
          errorMessage: message,
          durationMs: Date.now() - startedAt,
          sessionId: context?.sessionId,
          endpointName: endpoint.name,
        });
        // 执行失败时返回字符串而非抛出异常，让 LLM 能读到错误信息并继续对话
        return `技能 "${latest.display_name}" 执行失败：${message}`;
      }
    },
  };
}
