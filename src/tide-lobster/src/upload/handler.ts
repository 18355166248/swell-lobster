import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';

import { settings } from '../config.js';

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/markdown': 'md',
};

const EXT_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
};

export type UploadKind = 'image' | 'file';

export interface StoredAttachment {
  kind: UploadKind;
  filename: string;
  mimeType: string;
  size: number;
  previewUrl?: string;
}

function isImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

function normalizeUploadMimeType(file: File): string {
  const ext = extname(file.name).toLowerCase();
  const fromExt = EXT_TO_MIME[ext];
  const rawType = String(file.type ?? '')
    .trim()
    .toLowerCase();

  if (rawType === 'text/x-markdown') return 'text/markdown';
  if (rawType && MIME_TO_EXT[rawType]) return rawType;
  if (fromExt) return fromExt;

  throw new Error(`不支持的文件类型 ${rawType || ext || '(unknown)'}`);
}

export function persistUploadedBuffer(args: {
  buffer: Buffer;
  mimeType: string;
  kind?: UploadKind;
}): StoredAttachment {
  const mimeType = String(args.mimeType ?? '')
    .trim()
    .toLowerCase();
  const ext = MIME_TO_EXT[mimeType];
  if (!ext) {
    throw new Error(`不支持的文件类型 ${mimeType || '(unknown)'}`);
  }

  const kind = args.kind ?? (isImageMimeType(mimeType) ? 'image' : 'file');
  const filename = `${randomUUID()}.${ext}`;
  const uploadDir = join(settings.projectRoot, 'data', 'tmp', 'uploads');
  mkdirSync(uploadDir, { recursive: true });
  writeFileSync(join(uploadDir, filename), args.buffer);

  return {
    kind,
    filename,
    mimeType,
    size: args.buffer.byteLength,
    ...(kind === 'image' ? { previewUrl: `/api/uploads/${filename}` } : {}),
  };
}

export async function handleAttachmentUpload(
  formData: FormData
): Promise<StoredAttachment & { base64?: string }> {
  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    throw new Error('未找到上传文件，请使用字段名 file');
  }

  const mimeType = normalizeUploadMimeType(file);
  const arrayBuffer = await file.arrayBuffer();
  const size = arrayBuffer.byteLength;
  if (size > MAX_SIZE) {
    throw new Error(`文件大小 ${(size / 1024 / 1024).toFixed(1)} MB 超过 10 MB 限制`);
  }

  const buffer = Buffer.from(arrayBuffer);
  const stored = persistUploadedBuffer({ buffer, mimeType });
  return {
    ...stored,
    ...(stored.kind === 'image' ? { base64: buffer.toString('base64') } : {}),
  };
}

export function getUploadMimeTypeByFilename(filename: string): string {
  const ext = extname(filename).toLowerCase();
  return EXT_TO_MIME[ext] ?? 'application/octet-stream';
}
