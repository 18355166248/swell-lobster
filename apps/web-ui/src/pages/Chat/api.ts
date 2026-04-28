import { apiGet, apiPatch, apiPost, getApiBase } from '../../api/base';
import type {
  ChatAttachment,
  ChatStreamEvent,
  ChatSession,
  EndpointItem,
  PersonaInfo,
  SessionSearchResult,
  SessionSummary,
} from './types';

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
  personaPath?: string | null,
  templateId?: string | null
): Promise<ChatSession> {
  const res = await apiPost<{ session: ChatSession }>('/api/sessions', {
    endpoint_name: endpointName,
    ...(personaPath != null ? { persona_path: personaPath } : {}),
    ...(templateId != null ? { template_id: templateId } : {}),
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

/** GET /api/sessions/search：按消息正文子串检索，limit 由服务端再限制在 1–50。 */
export async function searchSessions(query: string, limit = 20): Promise<SessionSearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
  });
  return apiGet<SessionSearchResult[]>(`/api/sessions/search?${params.toString()}`);
}

export async function uploadAttachment(file: File): Promise<{
  kind: 'image' | 'file';
  filename: string;
  mimeType: string;
  size: number;
  previewUrl?: string;
}> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${getApiBase()}/api/upload/file`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(payload.detail ?? `Upload failed: ${res.status}`);
  }
  const data = (await res.json()) as {
    kind: 'image' | 'file';
    filename: string;
    mimeType: string;
    size: number;
    previewUrl?: string;
  };
  return {
    ...data,
    ...(data.previewUrl ? { previewUrl: `${getApiBase()}${data.previewUrl}` } : {}),
  };
}

export async function sendMessage(payload: {
  conversation_id?: string;
  message: string;
  endpoint_name?: string;
  attachments?: Array<Pick<ChatAttachment, 'kind' | 'filename' | 'mimeType'>>;
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
    attachments?: Array<Pick<ChatAttachment, 'kind' | 'filename' | 'mimeType'>>;
  },
  onEvent: (event: ChatStreamEvent) => void,
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
        if (chunk.type === 'delta' && typeof chunk.delta === 'string') {
          onEvent({ type: 'delta', delta: chunk.delta });
        }
        if (chunk.type === 'tool_call' && typeof chunk.name === 'string') {
          onEvent({
            type: 'tool_call',
            name: chunk.name,
            status: 'running',
            arguments:
              chunk.arguments && typeof chunk.arguments === 'object'
                ? (chunk.arguments as Record<string, unknown>)
                : {},
          });
        }
        if (chunk.type === 'tool_result' && typeof chunk.name === 'string') {
          onEvent({
            type: 'tool_result',
            name: chunk.name,
            status: chunk.status === 'failed' ? 'failed' : 'completed',
            content: String(chunk.content ?? ''),
            truncated: chunk.truncated === true,
            original_length:
              typeof chunk.original_length === 'number' ? chunk.original_length : undefined,
          });
        }
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
