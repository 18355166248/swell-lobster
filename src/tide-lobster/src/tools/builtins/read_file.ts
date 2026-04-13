import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';

import { settings } from '../../config.js';
import type { ToolDef } from '../types.js';

/** 路径安全校验：仅允许读取 data/tmp/uploads/ 下的文件 */
function isSafePath(filePath: string): boolean {
  const uploadDir = resolve(join(settings.projectRoot, 'data', 'tmp', 'uploads'));
  const resolved = resolve(filePath);
  return resolved.startsWith(uploadDir + '/') || resolved.startsWith(uploadDir + '\\');
}

async function extractPdfText(filePath: string): Promise<string> {
  // 动态 import 避免 pdfjs-dist 的 worker 警告影响非 PDF 路径
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // 禁用 worker（Node 环境）
  pdfjsLib.GlobalWorkerOptions.workerSrc = '';
  const data = readFileSync(filePath);
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(data) }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ');
    pages.push(`[第 ${i} 页]\n${pageText}`);
  }
  return pages.join('\n\n');
}

export const readFileTool: ToolDef = {
  name: 'read_file',
  description: '读取用户上传到 data/tmp/uploads/ 的文件内容，支持 .txt、.md、.pdf',
  parameters: {
    path: {
      type: 'string',
      description: '文件绝对路径（必须在 data/tmp/uploads/ 目录下）',
      required: true,
    },
  },
  async execute({ path: filePath }) {
    const p = String(filePath ?? '').trim();
    if (!p) return '未提供文件路径';

    if (!isSafePath(p)) {
      return `路径不在允许范围内，仅支持读取 data/tmp/uploads/ 目录下的文件`;
    }

    if (!existsSync(p)) {
      return `文件不存在：${p}`;
    }

    const ext = extname(p).toLowerCase();

    if (ext === '.pdf') {
      try {
        return await extractPdfText(p);
      } catch (e) {
        return `PDF 解析失败：${e instanceof Error ? e.message : String(e)}`;
      }
    }

    if (ext === '.txt' || ext === '.md' || ext === '') {
      const content = readFileSync(p, 'utf-8');
      const MAX = 50_000;
      if (content.length > MAX) {
        return content.slice(0, MAX) + `\n...[内容已截断，共 ${content.length} 字符]`;
      }
      return content;
    }

    return `不支持的文件类型 ${ext}，仅支持 .txt、.md、.pdf`;
  },
};
