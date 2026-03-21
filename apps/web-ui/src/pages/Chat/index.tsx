import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Select } from 'antd';
import { MessageOutlined, PlusOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import {
  createSession,
  fetchChatBootstrap,
  fetchSessionDetail,
  sendMessage,
  updateSession,
} from './api';
import type { ChatMessage, ChatSession, EndpointItem, SessionSummary } from './types';
import { SessionList } from './components/SessionList';
import { ChatComposer } from './components/ChatComposer';

function upsertSessionSummary(list: SessionSummary[], session: ChatSession): SessionSummary[] {
  const next: SessionSummary = {
    id: session.id,
    title: session.title,
    endpoint_name: session.endpoint_name,
    updated_at: session.updated_at,
    message_count: session.messages.length,
  };
  const filtered = list.filter((x) => x.id !== session.id);
  return [next, ...filtered];
}

export function ChatPage() {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [endpoints, setEndpoints] = useState<EndpointItem[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId),
    [sessions, activeSessionId]
  );

  const enabledEndpoints = useMemo(
    () =>
      [...endpoints]
        .filter((e) => e.enabled !== false && e.name)
        .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999)),
    [endpoints]
  );

  const selectedEndpointName =
    activeSession?.endpoint_name || enabledEndpoints[0]?.name || undefined;

  const loadSession = async (sessionId: string) => {
    const detail = await fetchSessionDetail(sessionId);
    setActiveSessionId(detail.id);
    setMessages(detail.messages || []);
    setSessions((prev) => upsertSessionSummary(prev, detail));
  };

  useEffect(() => {
    const run = async () => {
      setBootLoading(true);
      setError(null);
      try {
        const data = await fetchChatBootstrap();
        const epList = Array.isArray(data.endpoints) ? data.endpoints : [];
        setEndpoints(epList);

        let sessionList = Array.isArray(data.sessions) ? data.sessions : [];
        if (sessionList.length === 0) {
          const created = await createSession(epList[0]?.name);
          sessionList = [
            {
              id: created.id,
              title: created.title,
              endpoint_name: created.endpoint_name,
              updated_at: created.updated_at,
              message_count: created.messages.length,
            },
          ];
          setMessages(created.messages);
          setActiveSessionId(created.id);
        } else {
          await loadSession(sessionList[0].id);
        }

        setSessions(sessionList);
      } catch (e) {
        setError(e instanceof Error ? e.message : t('chat.loadFailed'));
      } finally {
        setBootLoading(false);
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateSession = async () => {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const session = await createSession(selectedEndpointName);
      setSessions((prev) => upsertSessionSummary(prev, session));
      setActiveSessionId(session.id);
      setMessages(session.messages);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('chat.createSessionFailed'));
    } finally {
      setCreating(false);
    }
  };

  const handleSelectSession = async (sessionId: string) => {
    setError(null);
    try {
      await loadSession(sessionId);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('chat.loadSessionFailed'));
    }
  };

  const handleEndpointChange = async (endpointName: string) => {
    if (!activeSessionId) return;
    setError(null);
    try {
      const updated = await updateSession(activeSessionId, { endpoint_name: endpointName });
      setSessions((prev) => upsertSessionSummary(prev, updated));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('chat.updateSessionFailed'));
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const localUserMessage: ChatMessage = { role: 'user', content: text };
    setInput('');
    setMessages((prev) => [...prev, localUserMessage]);
    setLoading(true);
    setError(null);

    try {
      const res = await sendMessage({
        conversation_id: activeSessionId,
        message: text,
        endpoint_name: selectedEndpointName,
      });
      setActiveSessionId(res.conversation_id);
      setMessages(res.session.messages || []);
      setSessions((prev) => upsertSessionSummary(prev, res.session));
    } catch (e) {
      setMessages((prev) => prev.slice(0, Math.max(0, prev.length - 1)));
      setError(e instanceof Error ? e.message : t('chat.sendFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full animate-in fade-in-50 duration-200">
      <aside className="w-64 border-r border-border bg-background/95 px-3 py-4 flex flex-col gap-3">
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleCreateSession}
          loading={creating}
        >
          {t('chat.newSession')}
        </Button>
        <div className="text-xs text-muted-foreground px-1">{t('chat.sessionList')}</div>
        <div className="flex-1 overflow-auto pr-1">
          <SessionList
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelect={handleSelectSession}
          />
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-6 py-4 border-b border-border bg-background/95 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-foreground">{t('chat.title')}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{t('chat.subtitle')}</p>
          </div>
          <div className="w-80 max-w-[45%] min-w-[220px]">
            <Select
              size="middle"
              value={selectedEndpointName}
              placeholder={t('chat.selectEndpoint')}
              options={enabledEndpoints.map((ep) => ({
                value: String(ep.name),
                label: `${ep.name}${ep.model ? ` (${ep.model})` : ''}`,
              }))}
              onChange={handleEndpointChange}
              disabled={!activeSessionId || enabledEndpoints.length === 0}
              className="w-full"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
          {bootLoading ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              {t('common.loading')}
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center">
                <MessageOutlined className="text-accent text-xl" />
              </div>
              <p className="text-muted-foreground text-sm max-w-xs">{t('chat.emptyHint')}</p>
            </div>
          ) : (
            messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-accent text-accent-foreground rounded-br-sm'
                      : 'bg-muted text-foreground rounded-bl-sm'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))
          )}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1 items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          )}

          {error && <Alert type="error" message={error} showIcon />}
          <div ref={bottomRef} />
        </div>

        <ChatComposer input={input} loading={loading} onInputChange={setInput} onSend={send} />
      </div>
    </div>
  );
}
