/**
 * Identity 文件管理 API
 *
 * 对应 Python: swell_lobster/api/routes/identity.py
 *
 * 接口：
 * - GET  /api/identity/files          列出 identity 目录下的 .md/.yaml 文件
 * - GET  /api/identity/files/:path    读取单个 identity 文件
 * - POST /api/identity/files/:path    写入单个 identity 文件
 */

import { Hono } from 'hono';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { resolve, sep, dirname } from 'node:path';
import { settings } from '../../config.js';

export const identityRouter = new Hono();

function identityDir(): string {
  return settings.identityDir;
}

function isPathSafe(root: string, full: string): boolean {
  const normalRoot = resolve(root);
  const normalFull = resolve(full);
  return normalFull.startsWith(normalRoot + sep) || normalFull === normalRoot;
}

function listFilesRecursive(
  dir: string,
  root: string,
  exts: string[]
): { path: string; name: string }[] {
  const results: { path: string; name: string }[] = [];
  if (!existsSync(dir)) return results;

  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(fullPath, root, exts));
    } else if (entry.isFile() && exts.some((ext) => entry.name.endsWith(ext))) {
      const rel = fullPath.slice(root.length + 1).replace(/\\/g, '/'); // relative path, forward slashes
      results.push({ path: rel, name: entry.name });
    }
  }
  return results.sort((a, b) => a.path.localeCompare(b.path));
}

// ── GET /api/identity/files ────────────────────────────────────────────────────

identityRouter.get('/api/identity/files', (c) => {
  const root = identityDir();
  const files = [
    ...listFilesRecursive(root, root, ['.md']),
    ...listFilesRecursive(root, root, ['.yaml']),
  ];
  return c.json({ files });
});

// ── GET /api/identity/files/:path ─────────────────────────────────────────────

identityRouter.get('/api/identity/files/*', (c) => {
  const root = identityDir();
  const path = c.req.path.slice('/api/identity/files/'.length);
  const full = resolve(root, path);

  if (!isPathSafe(root, full) || !existsSync(full) || !statSync(full).isFile()) {
    return c.json({ error: 'File not found' }, 404);
  }
  try {
    const content = readFileSync(full, 'utf-8');
    return c.json({ path, content });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// ── POST /api/identity/files/:path ────────────────────────────────────────────

identityRouter.post('/api/identity/files/*', async (c) => {
  const root = identityDir();
  const path = c.req.path.slice('/api/identity/files/'.length);
  const full = resolve(root, path);

  if (!isPathSafe(root, full)) {
    return c.json({ error: 'Invalid path' }, 400);
  }
  try {
    const body = await c.req.json<{ content: string }>();
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body.content, 'utf-8');
    return c.json({ status: 'ok', path });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});
