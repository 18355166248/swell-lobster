import { apiGet, apiPatch, apiPost, getApiBase } from '../../api/base';
import type { ChatSession, EndpointItem, PersonaInfo, SessionSummary } from './types';

export async function fetchChatBootstrap(): Promise<{
  sessions: SessionSummary[];
  endpoints: EndpointItem[];
}> {
  return apiGet<{ sessions: SessionSummary[]; endpoints: EndpointItem[] }>('/api/sessions');
}

export async function fetchSessionDetail(sessionId: string): Promise<ChatSession> {
  const res = await apiGet<{ session: ChatSession }>(`/api/sessions/${sessionId}`);
  return res.session;
}

export async function createSession(
  endpointName?: string,
  personaPath?: string | null
): Promise<ChatSession> {
  const res = await apiPost<{ session: ChatSession }>('/api/sessions', {
    endpoint_name: endpointName,
    ...(personaPath != null ? { persona_path: personaPath } : {}),
  });
  return res.session;
}

export async function updateSession(
  sessionId: string,
  payload: { endpoint_name?: string; title?: string; persona_path?: string | null }
): Promise<ChatSession> {
  const res = await apiPatch<{ session: ChatSession }>(`/api/sessions/${sessionId}`, payload);
  return res.session;
}

export async function fetchPersonas(): Promise<PersonaInfo[]> {
  return apiGet<PersonaInfo[]>('/api/identity/personas');
}

export async function deleteSession(sessionId: string): Promise<void> {
  const res = await fetch(`${getApiBase()}/api/sessions/${sessionId}`, { method: 'DELETE' });
  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(payload.detail ?? `DELETE session failed: ${res.status}`);
  }
}

export async function sendMessage(payload: {
  conversation_id?: string;
  message: string;
  endpoint_name?: string;
}): Promise<{
  message: string;
  conversation_id: string;
  endpoint_name?: string;
  session: ChatSession;
}> {
  return apiPost('/api/chat', payload);
}

export async function sendMessageStream(
  payload: {
    conversation_id?: string;
    message: string;
    endpoint_name?: string;
  },
  onDelta: (delta: string) => void,
  signal?: AbortSignal
): Promise<{ conversation_id: string; session: ChatSession }> {
  const res = await fetch(`${getApiBase()}/api/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok || !res.body) {
    throw new Error(`API /api/chat/stream: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const raw = line.slice(5).trim();
      try {
        const chunk = JSON.parse(raw) as Record<string, unknown>;
        if (chunk.error) throw new Error(chunk.error as string);
        if (typeof chunk.delta === 'string') onDelta(chunk.delta);
        if (chunk.done) {
          return {
            conversation_id: chunk.conversation_id as string,
            session: chunk.session as ChatSession,
          };
        }
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }

  throw new Error('Stream ended without done event');
}
