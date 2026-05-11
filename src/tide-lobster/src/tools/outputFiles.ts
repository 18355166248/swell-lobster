import { mkdirSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

import { settings } from '../config.js';

const DEFAULT_OUTPUT_DIR = join(settings.dataDir, 'outputs');

export interface OutputFileRef {
  filename: string;
  path: string;
  url: string;
}

export function ensureOutputDir(): string {
  const dir = resolve(process.env['SWELL_OUTPUT_DIR'] ?? DEFAULT_OUTPUT_DIR);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function sanitizeBaseName(input: string, fallback: string): string {
  const trimmed = input.trim();
  const value = trimmed || fallback;
  const withoutExt = extname(value) ? value.slice(0, -extname(value).length) : value;
  const normalized = withoutExt
    .replace(/[^\p{L}\p{N}\-_]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized || fallback;
}

export function buildOutputFileRef(filename: string, absolutePath: string): OutputFileRef {
  return {
    filename,
    path: absolutePath,
    url: `/api/files/${encodeURIComponent(filename)}?localPath=${encodeURIComponent(absolutePath)}`,
  };
}

export function formatOutputFileResult(
  kind: string,
  ref: OutputFileRef,
  extraLines: string[] = []
): string {
  const lines = [
    `${kind} 已生成。`,
    `- 文件名：${ref.filename}`,
    `- 下载：${ref.url}`,
    `- 路径：${ref.path}`,
    ...extraLines,
  ];
  return lines.join('\n');
}
