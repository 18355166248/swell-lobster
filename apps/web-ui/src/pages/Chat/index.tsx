import { useEffect, useMemo, useRef, useState, useCallback, memo } from 'react';
import { Alert, Avatar, Button, Select } from 'antd';
import { PlusOutlined, RobotOutlined, UserOutlined } from '@ant-design/icons';

import MarkdownContent from '../../components/MarkdownContent';
import { useTranslation } from 'react-i18next';
import {
  createSession,
  deleteSession,
  fetchChatBootstrap,
  fetchSessionDetail,
  sendMessageStream,
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

  const existingIndex = list.findIndex((x) => x.id === session.id);

  if (existingIndex !== -1) {
    // Session exists, replace it in its current position
    const newList = [...list];
    newList[existingIndex] = next;
    return newList;
  } else {
    // Session is new, prepend it to maintain existing behavior for new sessions.
    return [next, ...list];
  }
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
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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

  const handleDeleteSession = async (sessionId: string) => {
    setError(null);
    try {
      await deleteSession(sessionId);
      const remaining = sessions.filter((s) => s.id !== sessionId);
      setSessions(remaining);
      if (activeSessionId === sessionId) {
        if (remaining.length > 0) {
          await loadSession(remaining[0].id);
        } else {
          const created = await createSession(selectedEndpointName);
          setSessions([
            {
              id: created.id,
              title: created.title,
              endpoint_name: created.endpoint_name,
              updated_at: created.updated_at,
              message_count: created.messages.length,
            },
          ]);
          setActiveSessionId(created.id);
          setMessages(created.messages);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('chat.deleteSessionFailed'));
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

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const ChatMarkdown = memo(({ text }: { text: string }) => {
    return <MarkdownContent content={text} />;
  });

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const controller = new AbortController();
    abortRef.current = controller;

    const localUserMessage: ChatMessage = { role: 'user', content: text };
    setInput('');
    setMessages((prev) => [...prev, localUserMessage, { role: 'assistant', content: '' }]);
    setLoading(true);
    setError(null);

    try {
      const res = await sendMessageStream(
        {
          conversation_id: activeSessionId,
          message: text,
          endpoint_name: selectedEndpointName,
        },
        (delta) => {
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === 'assistant') {
              next[next.length - 1] = { role: 'assistant', content: last.content + delta };
            }
            return next;
          });
        },
        controller.signal
      );
      setActiveSessionId(res.conversation_id);
      setMessages(res.session.messages || []);
      setSessions((prev) => upsertSessionSummary(prev, res.session));
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        // 用户主动停止：移除空的 assistant 占位，保留已流出的内容
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          return last?.role === 'assistant' && !last.content ? prev.slice(0, -2) : prev;
        });
      } else {
        setMessages((prev) => prev.slice(0, Math.max(0, prev.length - 2)));
        setError(e instanceof Error ? e.message : t('chat.sendFailed'));
      }
    } finally {
      abortRef.current = null;
      setLoading(false);
    }
  };

  const bubbleItems = useMemo(
    () =>
      messages.map((m, i) => {
        const isLastAssistant = loading && m.role === 'assistant' && i === messages.length - 1;
        const item = {
          key: i,
          role: m.role === 'user' ? 'user' : 'assistant',
          content: <ChatMarkdown text={m.content} />,
          loading: isLastAssistant && m.content === '',
          streaming: isLastAssistant && m.content !== '',
        };
        return item;
      }),
    [messages, loading]
  );

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
            onDelete={handleDeleteSession}
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

        <div className="flex-1 flex flex-col overflow-hidden">
          {bootLoading ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              {t('common.loading')}
            </div>
          ) : messages.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col items-center gap-2">
                <RobotOutlined style={{ fontSize: 32, color: 'var(--accent)' }} />
                <h2 className="text-lg font-semibold text-foreground">{t('chat.title')}</h2>
                <p className="text-sm text-muted-foreground">{t('chat.emptyHint')}</p>
              </div>
            </div>
          ) : (
            <div
              ref={messagesEndRef}
              className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-4"
            >
              {bubbleItems.map((item) => (
                <div
                  key={item.key}
                  className={`flex items-start gap-3 ${item.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {item.role === 'assistant' && (
                    <Avatar size="small" icon={<RobotOutlined />} className="shrink-0" />
                  )}
                  <div
                    className={`max-w-[70%]
                    ${
                      item.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-br-none'
                        : 'bg-muted rounded-bl-none'
                    }
                    px-3 py-2 rounded-lg text-sm
                    `}
                  >
                    {item.content}
                  </div>
                  {item.role === 'user' && (
                    <Avatar size="small" icon={<UserOutlined />} className="shrink-0" />
                  )}
                </div>
              ))}
            </div>
          )}
          {error && (
            <div className="px-6 py-2 shrink-0">
              <Alert type="error" message={error} showIcon />
            </div>
          )}
        </div>

        <ChatComposer
          input={input}
          loading={loading}
          onInputChange={setInput}
          onSend={send}
          onStop={handleStop}
          activeSessionId={activeSessionId}
        />
      </div>
    </div>
  );
}
