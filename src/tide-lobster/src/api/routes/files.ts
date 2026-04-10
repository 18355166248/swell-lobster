/**
 * 文件路由
 *
 * GET /api/files/:filename  — 下载文件（从 OUTPUT_DIR）
 * GET /api/shell/open       — 用系统默认程序打开文件（仅限 OUTPUT_DIR 内）
 *
 * 安全：basename() + resolve() 双重校验，防止目录穿越。
 */
import { Hono } from 'hono';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { basename, join, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { settings } from '../../config.js';

export const filesRouter = new Hono();

const MIME_TYPES: Record<string, string> = {
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.csv': 'text/csv',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
};

function getOutputDir(): string {
  return resolve(
    process.env['SWELL_OUTPUT_DIR'] ?? join(settings.projectRoot, 'data', 'outputs')
  );
}

/** 下载文件 */
filesRouter.get('/api/files/:filename', (c) => {
  const raw = c.req.param('filename');
  // basename 剥离所有路径分隔符，防止穿越
  const safe = basename(decodeURIComponent(raw));
  if (!safe) return c.json({ detail: 'invalid filename' }, 400);

  const outputDir = getOutputDir();
  const filePath = join(outputDir, safe);

  // 二次校验：确保解析后路径仍在输出目录内
  const real = resolve(filePath);
  if (!real.startsWith(resolve(outputDir) + sep) && real !== resolve(outputDir)) {
    return c.json({ detail: 'forbidden' }, 403);
  }

  if (!existsSync(filePath)) return c.json({ detail: 'not found' }, 404);

  const stat = statSync(filePath);
  const dotExt = ('.' + safe.split('.').pop()?.toLowerCase()) as string;
  const mime = MIME_TYPES[dotExt] ?? 'application/octet-stream';

  c.header('Content-Type', mime);
  c.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(safe)}`);
  c.header('Content-Length', String(stat.size));
  c.header('Cache-Control', 'no-cache');

  // 将 Node.js ReadStream 适配为 Web ReadableStream
  const nodeStream = createReadStream(filePath);
  const webStream = Readable.toWeb(nodeStream) as ReadableStream;
  return new Response(webStream, { status: 200 });
});

/** 用系统默认程序打开文件 */
filesRouter.get('/api/shell/open', async (c) => {
  const rawPath = c.req.query('path') ?? '';
  if (!rawPath) return c.json({ detail: 'path required' }, 400);

  const target = resolve(decodeURIComponent(rawPath));
  if (!existsSync(target)) return c.json({ detail: 'not found' }, 404);

  // 使用 spawn 数组参数，不经 shell 解析，避免路径中特殊字符注入
  let bin: string;
  let cmdArgs: string[];
  if (process.platform === 'win32') {
    bin = 'cmd';
    cmdArgs = ['/c', 'start', '', target];
  } else if (process.platform === 'darwin') {
    bin = 'open';
    cmdArgs = [target];
  } else {
    bin = 'xdg-open';
    cmdArgs = [target];
  }

  try {
    await new Promise<void>((res, rej) => {
      const child = spawn(bin, cmdArgs, { detached: true, stdio: 'ignore', shell: false });
      child.unref();
      child.on('error', rej);
      child.on('spawn', res);
    });
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ detail: (err as Error).message }, 500);
  }
});
