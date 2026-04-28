import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { settings } from '../config.js';
import type { AgentTemplate } from './types.js';

/**
 * 扫描 data/agent-templates/ 目录，返回所有模板 JSON 文件列表。
 * 目录不存在时返回空数组。
 */
function scanTemplateFiles(): string[] {
  const templatesDir = join(settings.dataDir, 'agent-templates');
  if (!existsSync(templatesDir)) return [];

  return readdirSync(templatesDir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => join(templatesDir, file));
}

/**
 * 解析单个模板 JSON 文件。
 * 解析失败时返回 undefined。
 */
function parseTemplateFile(filePath: string): AgentTemplate | undefined {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const template = JSON.parse(content) as AgentTemplate;

    // 基础字段验证
    if (!template.id || !template.name || !template.category || !template.systemPrompt) {
      return undefined;
    }

    return template;
  } catch {
    return undefined;
  }
}

/**
 * 列出所有模板，支持按分类过滤。
 */
export function listTemplates(category?: string): AgentTemplate[] {
  const files = scanTemplateFiles();
  const templates = files
    .map(parseTemplateFile)
    .filter((t): t is AgentTemplate => t !== undefined);

  if (category) {
    return templates.filter((t) => t.category === category);
  }

  return templates;
}

/**
 * 根据 ID 获取单个模板。
 */
export function getTemplate(id: string): AgentTemplate | undefined {
  const templates = listTemplates();
  return templates.find((t) => t.id === id);
}
