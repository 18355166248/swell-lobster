import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ContentPart, LLMRequestMessage } from './llmClient.js';
import type { ChatAttachment, ChatMessage } from './models.js';

export type ChatInputAttachment = {
  kind: 'image' | 'file';
  mimeType: string;
  filename?: string;
  base64?: string;
};

export function isImageAttachment(attachment: ChatAttachment | ChatInputAttachment): boolean {
  return attachment.kind === 'image';
}

export function attachmentAbsolutePath(projectRoot: string, filename: string): string {
  return join(projectRoot, 'data', 'tmp', 'uploads', filename);
}

export function buildReadableAttachmentHint(
  projectRoot: string,
  attachments: ChatAttachment[]
): string {
  const files = attachments.filter((attachment) => !isImageAttachment(attachment));
  if (files.length === 0) return '';

  const lines = files.map(
    (attachment) =>
      `- ${attachment.filename}: ${attachmentAbsolutePath(projectRoot, attachment.filename)}`
  );
  return [
    '用户本轮还上传了以下文件。',
    '如果需要读取其内容，请调用 read_file 工具并使用对应绝对路径：',
    ...lines,
  ].join('\n');
}

export function imagePartFromAttachment(
  projectRoot: string,
  attachment: ChatAttachment
): ContentPart | null {
  if (!isImageAttachment(attachment)) return null;
  const filePath = attachmentAbsolutePath(projectRoot, attachment.filename);
  if (!existsSync(filePath)) return null;
  return {
    type: 'image',
    base64: readFileSync(filePath).toString('base64'),
    mimeType: attachment.mimeType,
  };
}

export function toLLMMessages(projectRoot: string, messages: ChatMessage[]): LLMRequestMessage[] {
  return messages.map((message): LLMRequestMessage => {
    if (message.role !== 'user') return { role: 'assistant', content: message.content };

    const attachments = message.attachments ?? [];
    if (attachments.length === 0) return { role: 'user', content: message.content };

    const textSegments = [
      message.content.trim(),
      buildReadableAttachmentHint(projectRoot, attachments),
    ]
      .filter(Boolean)
      .join('\n\n');
    const imageParts = attachments
      .map((attachment) => imagePartFromAttachment(projectRoot, attachment))
      .filter((part): part is ContentPart => part !== null);

    if (imageParts.length === 0) {
      return { role: 'user', content: textSegments };
    }

    return {
      role: 'user',
      content: [
        ...(textSegments ? [{ type: 'text', text: textSegments } satisfies ContentPart] : []),
        ...imageParts,
      ],
    };
  });
}
