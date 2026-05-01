import type { ChatSession } from '../chat/models.js';
import { ChatStore } from '../chat/chatStore.js';

function getStore(): ChatStore {
  return new ChatStore();
}

function getSessionOrThrow(sessionId: string): ChatSession {
  const session = getStore().getSession(sessionId);
  if (!session) throw new Error(`会话不存在：${sessionId}`);
  return session;
}

function sanitizeFilenamePart(value: string): string {
  const normalized = value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized.slice(0, 60) || 'session';
}

export function exportMarkdown(sessionId: string): string {
  return sessionToMarkdown(getSessionOrThrow(sessionId));
}

export function exportJson(sessionId: string): string {
  return JSON.stringify(getSessionOrThrow(sessionId), null, 2);
}

export function getExportFilename(sessionId: string, format: 'md' | 'json'): string {
  const session = getSessionOrThrow(sessionId);
  const title = sanitizeFilenamePart(session.title || session.id);
  return `${title}-${session.id}.${format}`;
}

function sessionToMarkdown(session: ChatSession): string {
  const lines: string[] = [];
  const title = session.title || session.id;
  lines.push(`# ${title}`);
  lines.push('');
  lines.push(`> 会话 ID：${session.id}  `);
  lines.push(`> 创建时间：${session.created_at}  `);
  if (session.endpoint_name) {
    lines.push(`> 端点：${session.endpoint_name}  `);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const msg of session.messages) {
    const label = msg.role === 'user' ? '**User**' : '**Assistant**';
    lines.push(`${label}：`);
    lines.push('');
    if (msg.attachments?.length) {
      lines.push('附件：');
      lines.push('');
      for (const attachment of msg.attachments) {
        lines.push(
          `- [${attachment.kind === 'image' ? '图片' : '文件'}] ${attachment.filename} (${attachment.mimeType})`
        );
      }
      lines.push('');
    }
    lines.push(msg.content);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}
