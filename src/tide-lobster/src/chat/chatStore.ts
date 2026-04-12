import { randomUUID } from 'node:crypto';
import { getDb } from '../db/index.js';
import type { ToolExecutionTrace } from '../tools/types.js';
import type { ChatSession, ChatMessage, MessageBlock, SessionSummary } from './models.js';

function nowIso(): string {
  return new Date().toISOString();
}

function fallbackSessionId(): string {
  return `chat_${Math.random().toString(16).slice(2, 12)}`;
}

export class ChatStore {
  private db = getDb();

  /** 将助手消息的 token 总量写回 chat_messages，便于单条消息维度查询（统计主路径在 token_stats）。 */
  updateMessageTokenCount(messageId: string, tokenCount: number): void {
    this.db
      .prepare(`UPDATE chat_messages SET token_count = ? WHERE id = ?`)
      .run(tokenCount, messageId);
  }

  /** 将助手消息上的工具执行轨迹序列化为 JSON 落库，供历史会话加载时还原展示。 */
  updateMessageToolInvocations(messageId: string, traces: ToolExecutionTrace[]): void {
    const json = JSON.stringify(traces);
    this.db
      .prepare(`UPDATE chat_messages SET tool_invocations = ? WHERE id = ?`)
      .run(json, messageId);
  }

  listSessions(): SessionSummary[] {
    const stmt = this.db.prepare(`
      SELECT s.id, s.title, s.endpoint_name, s.persona_path, s.updated_at, COUNT(m.id) as message_count
      FROM chat_sessions s
      LEFT JOIN chat_messages m ON s.id = m.session_id
      GROUP BY s.id, s.title, s.endpoint_name, s.persona_path, s.updated_at
      ORDER BY s.updated_at DESC
    `);

    const rows = stmt.all() as any[];

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      endpoint_name: row.endpoint_name,
      persona_path: row.persona_path ?? null,
      updated_at: row.updated_at,
      message_count: row.message_count,
    }));
  }

  getSession(sessionId: string): ChatSession | undefined {
    // Get session
    const sessionStmt = this.db.prepare(`
      SELECT id, title, endpoint_name, persona_path, created_at, updated_at
      FROM chat_sessions
      WHERE id = ?
    `);

    const sessionRow = sessionStmt.get(sessionId) as any;

    if (!sessionRow) return undefined;

    // Get messages
    const messagesStmt = this.db.prepare(`
      SELECT id, role, content, created_at, tool_invocations, blocks
      FROM chat_messages
      WHERE session_id = ?
      ORDER BY sequence ASC, created_at ASC
    `);

    const messageRows = messagesStmt.all(sessionId) as any[];

    const messages: ChatMessage[] = messageRows.map((row) => {
      let tool_invocations: ToolExecutionTrace[] | undefined;
      if (row.tool_invocations && typeof row.tool_invocations === 'string') {
        try {
          const parsed = JSON.parse(row.tool_invocations) as unknown;
          if (Array.isArray(parsed)) {
            tool_invocations = parsed as ToolExecutionTrace[];
          }
        } catch {
          // 忽略损坏的 JSON，按无工具轨迹处理
        }
      }
      let blocks: MessageBlock[] | undefined;
      if (row.blocks && typeof row.blocks === 'string') {
        try {
          const parsed = JSON.parse(row.blocks) as unknown;
          if (Array.isArray(parsed)) {
            blocks = parsed as MessageBlock[];
          }
        } catch {
          // 忽略损坏的 JSON
        }
      }
      return {
        id: row.id,
        role: row.role,
        content: row.content,
        created_at: row.created_at,
        ...(tool_invocations?.length ? { tool_invocations } : {}),
        ...(blocks?.length ? { blocks } : {}),
      };
    });

    return {
      id: sessionRow.id,
      title: sessionRow.title,
      endpoint_name: sessionRow.endpoint_name,
      persona_path: sessionRow.persona_path ?? null,
      created_at: sessionRow.created_at,
      updated_at: sessionRow.updated_at,
      messages,
    };
  }

  createSession(endpointName?: string | null, personaPath?: string | null): ChatSession {
    const now = nowIso();
    const sessionId = randomUUID?.()
      ? `chat_${randomUUID().replace(/-/g, '').slice(0, 10)}`
      : fallbackSessionId();

    const stmt = this.db.prepare(`
      INSERT INTO chat_sessions (id, title, endpoint_name, persona_path, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(sessionId, '新对话', endpointName ?? null, personaPath ?? null, now, now);

    return {
      id: sessionId,
      title: '新对话',
      endpoint_name: endpointName ?? null,
      persona_path: personaPath ?? null,
      created_at: now,
      updated_at: now,
      messages: [],
    };
  }

  updateSession(
    sessionId: string,
    patch: { endpoint_name?: string | null; title?: string | null; persona_path?: string | null }
  ): ChatSession | undefined {
    const updates: string[] = ['updated_at = ?'];
    const values: any[] = [nowIso()];

    if (patch.endpoint_name !== undefined) {
      updates.push('endpoint_name = ?');
      values.push(patch.endpoint_name);
    }
    if (patch.title && patch.title.trim()) {
      updates.push('title = ?');
      values.push(patch.title.trim());
    }
    if (patch.persona_path !== undefined) {
      updates.push('persona_path = ?');
      values.push(patch.persona_path);
    }

    values.push(sessionId);

    const stmt = this.db.prepare(`
      UPDATE chat_sessions
      SET ${updates.join(', ')}
      WHERE id = ?
    `);
    const result = stmt.run(...values);

    if (result.changes === 0) {
      return undefined;
    }

    return this.getSession(sessionId);
  }

  deleteSession(sessionId: string): boolean {
    const stmt = this.db.prepare('DELETE FROM chat_sessions WHERE id = ?');
    const result = stmt.run(sessionId);

    return result.changes > 0;
  }

  // 追加用户消息
  appendUserMessage(args: {
    sessionId: string;
    userContent: string;
    endpointName?: string | null;
  }): ChatSession | undefined {
    return this.appendMessageAndReturnId({
      sessionId: args.sessionId,
      role: 'user',
      content: args.userContent,
      endpointName: args.endpointName,
      updateTitleFromUser: true,
    })?.session;
  }
  // 追加助手消息
  appendAssistantMessage(args: {
    sessionId: string;
    assistantContent: string;
    endpointName?: string | null;
  }): ChatSession | undefined {
    return this.appendMessageAndReturnId({
      sessionId: args.sessionId,
      role: 'assistant',
      content: args.assistantContent,
      endpointName: args.endpointName,
    })?.session;
  }

  /** 与 appendAssistantMessage 相同落库逻辑，额外返回 messageId，供上层写入 token_count / token_stats。 */
  appendAssistantMessageWithMeta(args: {
    sessionId: string;
    assistantContent: string;
    endpointName?: string | null;
    blocks?: MessageBlock[];
  }): { session: ChatSession; messageId: string } | undefined {
    return this.appendMessageAndReturnId({
      sessionId: args.sessionId,
      role: 'assistant',
      content: args.assistantContent,
      endpointName: args.endpointName,
      blocks: args.blocks,
    });
  }

  appendTurn(args: {
    sessionId: string;
    userContent: string;
    assistantContent: string;
    endpointName?: string | null;
  }): ChatSession | undefined {
    // Check if session exists
    const checkStmt = this.db.prepare('SELECT id, title FROM chat_sessions WHERE id = ?');
    const sessionRow = checkStmt.get(args.sessionId) as any;

    if (!sessionRow) return undefined;

    const now = nowIso();

    // Get next sequence number
    const seqStmt = this.db.prepare(`
      SELECT COALESCE(MAX(sequence), 0) + 1 as next_seq
      FROM chat_messages
      WHERE session_id = ?
    `);
    const seqRow = seqStmt.get(args.sessionId) as any;

    const nextSeq = seqRow?.next_seq ?? 1;

    // Insert messages
    const insertStmt = this.db.prepare(`
      INSERT INTO chat_messages (id, session_id, role, content, created_at, sequence)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    // User message
    const userId = randomUUID?.() ?? `msg_${Math.random().toString(16).slice(2, 12)}`;
    insertStmt.run(userId, args.sessionId, 'user', args.userContent, now, nextSeq);

    // Assistant message
    const assistantId = randomUUID?.() ?? `msg_${Math.random().toString(16).slice(2, 12)}`;
    insertStmt.run(
      assistantId,
      args.sessionId,
      'assistant',
      args.assistantContent,
      now,
      nextSeq + 1
    );

    // Update session
    const newTitle =
      sessionRow.title === '新对话'
        ? args.userContent.trim().replace(/\n+/g, ' ').slice(0, 24) || '新对话'
        : sessionRow.title;

    const updates: string[] = ['updated_at = ?'];
    const values: any[] = [now];

    if (sessionRow.title === '新对话') {
      updates.push('title = ?');
      values.push(newTitle);
    }
    if (args.endpointName) {
      updates.push('endpoint_name = ?');
      values.push(args.endpointName);
    }

    values.push(args.sessionId);

    const updateStmt = this.db.prepare(`
      UPDATE chat_sessions
      SET ${updates.join(', ')}
      WHERE id = ?
    `);
    updateStmt.run(...values);

    return this.getSession(args.sessionId);
  }

  /** 单路径插入消息；对外公开方法只取 session，本方法供需要 messageId 的调用方复用。 */
  private appendMessageAndReturnId(args: {
    sessionId: string;
    role: ChatMessage['role'];
    content: string;
    endpointName?: string | null;
    updateTitleFromUser?: boolean;
    blocks?: MessageBlock[];
  }): { session: ChatSession; messageId: string } | undefined {
    const checkStmt = this.db.prepare('SELECT id, title FROM chat_sessions WHERE id = ?');
    const sessionRow = checkStmt.get(args.sessionId) as any;

    if (!sessionRow) return undefined;

    const now = nowIso();
    const seqStmt = this.db.prepare(`
      SELECT COALESCE(MAX(sequence), 0) + 1 as next_seq
      FROM chat_messages
      WHERE session_id = ?
    `);
    const seqRow = seqStmt.get(args.sessionId) as any;
    const nextSeq = seqRow?.next_seq ?? 1;

    const insertStmt = this.db.prepare(`
      INSERT INTO chat_messages (id, session_id, role, content, created_at, sequence, blocks)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const messageId = randomUUID?.() ?? `msg_${Math.random().toString(16).slice(2, 12)}`;
    const blocksJson = args.blocks?.length ? JSON.stringify(args.blocks) : null;
    insertStmt.run(messageId, args.sessionId, args.role, args.content, now, nextSeq, blocksJson);

    const updates: string[] = ['updated_at = ?'];
    const values: any[] = [now];

    if (args.updateTitleFromUser && sessionRow.title === '新对话') {
      updates.push('title = ?');
      values.push(args.content.trim().replace(/\n+/g, ' ').slice(0, 24) || '新对话');
    }
    if (args.endpointName) {
      updates.push('endpoint_name = ?');
      values.push(args.endpointName);
    }

    values.push(args.sessionId);

    const updateStmt = this.db.prepare(`
      UPDATE chat_sessions
      SET ${updates.join(', ')}
      WHERE id = ?
    `);
    updateStmt.run(...values);

    const session = this.getSession(args.sessionId);
    if (!session) return undefined;
    return { session, messageId };
  }
}
