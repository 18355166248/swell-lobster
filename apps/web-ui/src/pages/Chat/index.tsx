import { useEffect, useMemo, useRef, useState, useCallback, memo } from 'react';
import { Alert, Avatar, Button, Select } from 'antd';
import { PlusOutlined, RobotOutlined, UserOutlined } from '@ant-design/icons';
import { useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

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
import { LoadingBubble } from './components/LoadingBubble';
import { PersonaSelect } from './components/PersonaSelect';
import { MessageActions } from './components/MessageActions';

const lastPersonaAtom = atomWithStorage<string | null>('chat_last_persona', null);

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
  const [activePersonaPath, setActivePersonaPath] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastPersona, setLastPersona] = useAtom(lastPersonaAtom);
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
    setActivePersonaPath(detail.persona_path ?? null);
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
          const created = await createSession(epList[0]?.name, lastPersona);
          sessionList = [
            {
              id: created.id,
              title: created.title,
              endpoint_name: created.endpoint_name,
              persona_path: created.persona_path ?? null,
              updated_at: created.updated_at,
              message_count: created.messages.length,
            },
          ];
          setMessages(created.messages);
          setActiveSessionId(created.id);
          setActivePersonaPath(created.persona_path ?? null);
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
      const session = await createSession(selectedEndpointName, lastPersona);
      setSessions((prev) => upsertSessionSummary(prev, session));
      setActiveSessionId(session.id);
      setActivePersonaPath(session.persona_path ?? null);
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
          const created = await createSession(selectedEndpointName, lastPersona);
          setSessions([
            {
              id: created.id,
              title: created.title,
              endpoint_name: created.endpoint_name,
              persona_path: created.persona_path ?? null,
              updated_at: created.updated_at,
              message_count: created.messages.length,
            },
          ]);
          setActiveSessionId(created.id);
          setActivePersonaPath(created.persona_path ?? null);
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

  const handleRetry = useCallback(
    async (msgIndex: number) => {
      if (loading) return;
      // Find the last user message at or before msgIndex
      let userContent = '';
      for (let i = msgIndex - 1; i >= 0; i--) {
        if (messages[i].role === 'user') {
          userContent = messages[i].content;
          break;
        }
      }
      if (!userContent) return;

      const controller = new AbortController();
      abortRef.current = controller;

      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);
      setLoading(true);
      setError(null);

      try {
        const res = await sendMessageStream(
          {
            conversation_id: activeSessionId,
            message: userContent,
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
        setMessages(res.session.messages || []);
        setSessions((prev) => upsertSessionSummary(prev, res.session));
      } catch (e) {
        if (!(e instanceof Error && e.name === 'AbortError')) {
          setMessages((prev) => prev.slice(0, -1));
          setError(e instanceof Error ? e.message : t('chat.sendFailed'));
        }
      } finally {
        abortRef.current = null;
        setLoading(false);
      }
    },
    [loading, messages, activeSessionId, selectedEndpointName, t]
  );

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
          return last?.role === 'assistant' && !last.content ? prev.slice(0, -1) : prev;
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
        return {
          key: i,
          role: m.role === 'user' ? 'user' : 'assistant',
          rawContent: m.content,
          content: <ChatMarkdown text={m.content} />,
          loading: isLastAssistant && m.content === '',
          streaming: isLastAssistant && m.content !== '',
        };
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
          <div className="flex items-center gap-2">
            {activeSessionId && (
              <PersonaSelect
                sessionId={activeSessionId}
                value={activePersonaPath}
                onUpdate={(path) => {
                  setActivePersonaPath(path);
                  setLastPersona(path);
                  setSessions((prev) =>
                    prev.map((s) => (s.id === activeSessionId ? { ...s, persona_path: path } : s))
                  );
                }}
              />
            )}
            <div className="w-64 min-w-[180px]">
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
        </div>

        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* 全宽滚动：滚动条贴在主栏最右侧；内层 max-w-[800px] 仅限制内容宽度 */}
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
            {bootLoading ? (
              <div className="max-w-[800px] mx-auto w-full min-h-full min-w-0 px-6 flex items-center justify-center py-8">
                <span className="text-sm text-muted-foreground">{t('common.loading')}</span>
              </div>
            ) : messages.length === 0 ? (
              <div className="max-w-[800px] mx-auto w-full min-h-full min-w-0 px-6 flex flex-col">
                <div className="flex-1 flex flex-col items-center justify-center gap-2 py-8">
                  <RobotOutlined style={{ fontSize: 32, color: 'var(--accent)' }} />
                  <h2 className="text-lg font-semibold text-foreground">{t('chat.title')}</h2>
                  <p className="text-sm text-muted-foreground">{t('chat.emptyHint')}</p>
                </div>
                {error && (
                  <div className="pb-4 shrink-0">
                    <Alert type="error" message={error} showIcon />
                  </div>
                )}
              </div>
            ) : (
              <div className="max-w-[800px] mx-auto w-full min-w-0 px-6 py-4 flex flex-col gap-6">
                {bubbleItems.map((item) => {
                  if (item.loading) {
                    return <LoadingBubble key={item.key} />;
                  }
                  if (item.role === 'assistant') {
                    return (
                      <div key={item.key} className="w-full min-w-0 group">
                        <div className="w-full min-w-0 text-foreground [&_.markdown-content]:max-w-none">
                          {item.content}
                        </div>
                        <MessageActions
                          content={item.rawContent}
                          role="assistant"
                          align="end"
                          onRetry={
                            !loading && item.key === messages.length - 1
                              ? () => handleRetry(item.key as number)
                              : undefined
                          }
                        />
                      </div>
                    );
                  }
                  return (
                    <div
                      key={item.key}
                      className="flex w-full min-w-0 items-start justify-end gap-3 group"
                    >
                      <div className="flex min-w-0 max-w-[min(85%,42rem)] flex-col items-end">
                        <div className="rounded-2xl bg-muted px-4 py-2.5 text-[15px] leading-6 text-foreground">
                          {item.content}
                        </div>
                        <MessageActions content={item.rawContent} role="user" align="end" />
                      </div>
                      <Avatar size="small" icon={<UserOutlined />} className="shrink-0" />
                    </div>
                  );
                })}
                {error && (
                  <div className="shrink-0">
                    <Alert type="error" message={error} showIcon />
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          <div className="max-w-[800px] w-full mx-auto min-w-0 shrink-0">
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
      </div>
    </div>
  );
}
