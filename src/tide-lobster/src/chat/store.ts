import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { ChatSession, SessionSummary } from './models.js';

function nowIso(): string {
  return new Date().toISOString();
}

function fallbackSessionId(): string {
  return `chat_${Math.random().toString(16).slice(2, 12)}`;
}

export class ChatSessionStore {
  constructor(private readonly dataPath: string) {}

  listSessions(): SessionSummary[] {
    const sessions = this.load();
    return sessions
      .map((s) => ({
        id: s.id,
        title: s.title,
        endpoint_name: s.endpoint_name ?? null,
        updated_at: s.updated_at,
        message_count: s.messages.length,
      }))
      .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  }

  getSession(sessionId: string): ChatSession | undefined {
    return this.load().find((s) => s.id === sessionId);
  }

  createSession(endpointName?: string | null): ChatSession {
    const sessions = this.load();
    const now = nowIso();
    const session: ChatSession = {
      id: randomUUID?.()
        ? `chat_${randomUUID().replace(/-/g, '').slice(0, 10)}`
        : fallbackSessionId(),
      title: '新对话',
      endpoint_name: endpointName ?? null,
      created_at: now,
      updated_at: now,
      messages: [],
    };
    sessions.push(session);
    this.save(sessions);
    return session;
  }

  updateSession(
    sessionId: string,
    patch: { endpoint_name?: string | null; title?: string | null }
  ): ChatSession | undefined {
    const sessions = this.load();
    const idx = sessions.findIndex((s) => s.id === sessionId);
    if (idx < 0) return undefined;

    const session = sessions[idx];
    if (patch.endpoint_name !== undefined) {
      session.endpoint_name = patch.endpoint_name;
    }
    if (patch.title && patch.title.trim()) {
      session.title = patch.title.trim();
    }
    session.updated_at = nowIso();

    sessions[idx] = session;
    this.save(sessions);
    return session;
  }

  appendTurn(args: {
    sessionId: string;
    userContent: string;
    assistantContent: string;
    endpointName?: string | null;
  }): ChatSession | undefined {
    const sessions = this.load();
    const idx = sessions.findIndex((s) => s.id === args.sessionId);
    if (idx < 0) return undefined;

    const s = sessions[idx];
    s.messages.push({ role: 'user', content: args.userContent });
    s.messages.push({ role: 'assistant', content: args.assistantContent });
    if (args.endpointName) s.endpoint_name = args.endpointName;
    if (s.title === '新对话') {
      const short = args.userContent.trim().replace(/\n+/g, ' ').slice(0, 24);
      s.title = short || '新对话';
    }
    s.updated_at = nowIso();

    sessions[idx] = s;
    this.save(sessions);
    return s;
  }

  private load(): ChatSession[] {
    if (!existsSync(this.dataPath)) return [];
    try {
      const raw = JSON.parse(readFileSync(this.dataPath, 'utf-8'));
      const items = Array.isArray(raw?.sessions) ? raw.sessions : [];
      return items.filter((x: any) => typeof x === 'object' && x && Array.isArray(x.messages));
    } catch {
      return [];
    }
  }

  private save(sessions: ChatSession[]): void {
    mkdirSync(dirname(this.dataPath), { recursive: true });
    writeFileSync(this.dataPath, JSON.stringify({ sessions }, null, 2) + '\n', 'utf-8');
  }
}
