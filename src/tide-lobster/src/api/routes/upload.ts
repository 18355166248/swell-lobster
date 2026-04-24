import { Hono, type Context } from 'hono';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { Readable } from 'node:stream';
import { handleAttachmentUpload, getUploadMimeTypeByFilename } from '../../upload/handler.js';
import { settings } from '../../config.js';

export const uploadRouter = new Hono();

async function handleUploadRequest(c: Context) {
  try {
    const formData = await c.req.formData();
    const result = await handleAttachmentUpload(formData);
    return c.json(result);
  } catch (e) {
    const msg = String((e as Error)?.message || e || 'upload failed');
    return c.json({ detail: msg }, 400);
  }
}

uploadRouter.post('/api/upload/image', handleUploadRequest);
uploadRouter.post('/api/upload/file', handleUploadRequest);

uploadRouter.get('/api/uploads/:filename', (c) => {
  const raw = c.req.param('filename');
  // 防止路径穿越：只取文件名部分
  const filename = basename(raw);
  const filePath = join(settings.projectRoot, 'data', 'tmp', 'uploads', filename);

  if (!existsSync(filePath)) {
    return c.json({ detail: 'not found' }, 404);
  }

  const mimeType = getUploadMimeTypeByFilename(filename || raw);
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
