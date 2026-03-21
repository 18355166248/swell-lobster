import { apiGet, apiPatch, apiPost } from '../../api/base';
import type { ChatSession, EndpointItem, SessionSummary } from './types';

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

export async function createSession(endpointName?: string): Promise<ChatSession> {
  const res = await apiPost<{ session: ChatSession }>('/api/sessions', {
    endpoint_name: endpointName,
  });
  return res.session;
}

export async function updateSession(
  sessionId: string,
  payload: { endpoint_name?: string; title?: string }
): Promise<ChatSession> {
  const res = await apiPatch<{ session: ChatSession }>(`/api/sessions/${sessionId}`, payload);
  return res.session;
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
