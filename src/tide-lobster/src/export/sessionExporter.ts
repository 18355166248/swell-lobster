import type { ChatSession } from '../chat/models.js';
import { ChatStore } from '../chat/chatStore.js';

const store = new ChatStore();

export function exportMarkdown(sessionId: string): string {
  const session = store.getSession(sessionId);
  if (!session) throw new Error(`会话不存在：${sessionId}`);
  return sessionToMarkdown(session);
}

export function exportJson(sessionId: string): string {
  const session = store.getSession(sessionId);
  if (!session) throw new Error(`会话不存在：${sessionId}`);
  return JSON.stringify(session, null, 2);
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
    lines.push(msg.content);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}
