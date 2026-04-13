import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { settings } from '../config.js';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export interface UploadResult {
  filename: string;
  mimeType: string;
  base64: string;
  size: number;
  previewUrl: string;
}

export async function handleImageUpload(formData: FormData): Promise<UploadResult> {
  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    throw new Error('未找到上传文件，请使用字段名 file');
  }

  const mimeType = file.type;
  if (!ALLOWED_MIME.has(mimeType)) {
    throw new Error(`不支持的文件类型 ${mimeType}，仅支持 JPEG / PNG / GIF / WebP`);
  }

  const arrayBuffer = await file.arrayBuffer();
  const size = arrayBuffer.byteLength;
  if (size > MAX_SIZE) {
    throw new Error(`文件大小 ${(size / 1024 / 1024).toFixed(1)} MB 超过 10 MB 限制`);
  }

  const buffer = Buffer.from(arrayBuffer);
  const base64 = buffer.toString('base64');

  // 持久化到 data/tmp/uploads/，供 read_file 工具读取
  const ext = mimeType.split('/')[1].replace('jpeg', 'jpg');
  const filename = `${randomUUID()}.${ext}`;
  const uploadDir = join(settings.projectRoot, 'data', 'tmp', 'uploads');
  console.log("🚀 ~ handleImageUpload ~ uploadDir:", uploadDir)
  mkdirSync(uploadDir, { recursive: true });
  writeFileSync(join(uploadDir, filename), buffer);

  return { filename, mimeType, base64, size, previewUrl: `/api/uploads/${filename}` };
}
