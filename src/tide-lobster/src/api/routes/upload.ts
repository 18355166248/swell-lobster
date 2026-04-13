import { Hono } from 'hono';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { Readable } from 'node:stream';
import { handleImageUpload } from '../../upload/handler.js';
import { settings } from '../../config.js';

export const uploadRouter = new Hono();

uploadRouter.post('/api/upload/image', async (c) => {
  try {
    const formData = await c.req.formData();
    const result = await handleImageUpload(formData);
    return c.json(result);
  } catch (e) {
    const msg = String((e as Error)?.message || e || 'upload failed');
    return c.json({ detail: msg }, 400);
  }
});

const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

uploadRouter.get('/api/uploads/:filename', (c) => {
  const raw = c.req.param('filename');
  // 防止路径穿越：只取文件名部分
  const filename = basename(raw);
  const filePath = join(settings.projectRoot, 'data', 'tmp', 'uploads', filename);

  if (!existsSync(filePath)) {
    return c.json({ detail: 'not found' }, 404);
  }

  const ext = extname(filename).toLowerCase();
  const mimeType = MIME_MAP[ext] ?? 'application/octet-stream';
  const size = statSync(filePath).size;

  const nodeStream = createReadStream(filePath);
  const webStream = Readable.toWeb(nodeStream) as ReadableStream;

  return new Response(webStream, {
    headers: {
      'Content-Type': mimeType,
      'Content-Length': String(size),
      'Cache-Control': 'public, max-age=86400',
    },
  });
});
