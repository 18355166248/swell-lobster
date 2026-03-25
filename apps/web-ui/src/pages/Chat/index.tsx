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
import type {
  ChatMessage,
  ChatStreamEvent,
  ChatSession,
  EndpointItem,
  SessionSearchResult,
  SessionSummary,
  ToolInvocation,
} from './types';
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

function updateLastAssistantMessage(
  list: ChatMessage[],
  updater: (message: ChatMessage) => ChatMessage
): ChatMessage[] {
  const next = [...list];
  for (let index = next.length - 1; index >= 0; index -= 1) {
    if (next[index].role === 'assistant') {
      next[index] = updater(next[index]);
      break;
    }
  }
  return next;
}

function applyStreamEvent(messages: ChatMessage[], event: ChatStreamEvent): ChatMessage[] {
  if (event.type === 'delta') {
    return updateLastAssistantMessage(messages, (message) => ({
      ...message,
      content: message.content + event.delta,
    }));
  }

  if (event.type === 'tool_call') {
    return updateLastAssistantMessage(messages, (message) => ({
      ...message,
      tool_invocations: [
        ...(message.tool_invocations ?? []),
        {
          id: `${event.name}_${Date.now()}_${message.tool_invocations?.length ?? 0}`,
          name: event.name,
          arguments: event.arguments,
          status: 'running',
        },
      ],
    }));
  }

  return updateLastAssistantMessage(messages, (message) => {
    const toolInvocations = [...(message.tool_invocations ?? [])];
    const lastRunningIndex = [...toolInvocations]
      .reverse()
      .findIndex((item) => item.name === event.name && item.status === 'running');
    const targetIndex =
      lastRunningIndex === -1 ? -1 : toolInvocations.length - 1 - lastRunningIndex;

    if (targetIndex === -1) {
      toolInvocations.push({
        id: `${event.name}_${Date.now()}_${toolInvocations.length}`,
        name: event.name,
        arguments: {},
        status: event.status,
        result: event.content,
      });
    } else {
      toolInvocations[targetIndex] = {
        ...toolInvocations[targetIndex],
        status: event.status,
        result: event.content,
      };
    }

    return {
      ...message,
      tool_invocations: toolInvocations,
    };
  });
}

function ToolInvocationPanel({
  toolInvocations,
  t,
}: {
  toolInvocations: ToolInvocation[];
  t: (key: string) => string;
}) {
  if (toolInvocations.length === 0) return null;

  return (
    <div className="mt-3 flex flex-col gap-2">
      {toolInvocations.map((item) => (
        <details
          key={item.id}
          className="rounded-xl border border-border bg-muted/35 px-3 py-2 text-sm text-foreground"
        >
          <summary className="cursor-pointer list-none">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium">{item.name}</span>
              <span className="text-xs text-muted-foreground">
                {item.status === 'running' ? t('chat.toolCalling') : t('chat.toolResult')}
              </span>
            </div>
          </summary>
          <div className="mt-2 space-y-2">
            <pre className="overflow-x-auto rounded-lg bg-background px-2 py-1.5 text-xs">
              {JSON.stringify(item.arguments, null, 2)}
            </pre>
            {item.result ? (
              <pre className="overflow-x-auto rounded-lg bg-background px-2 py-1.5 text-xs">
                {item.result}
              </pre>
            ) : null}
          </div>
        </details>
      ))}
    </div>
  );
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
  const shouldScrollToBottomRef = useRef(false);
  const pendingScrollTargetIdRef = useRef<string | null>(null);
  const highlightTimerRef = useRef<number | null>(null);
  const messageRefs = useRef(new Map<string, HTMLDivElement | null>());
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);

  const clearMessageHighlight = useCallback(() => {
    if (highlightTimerRef.current !== null) {
      window.clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = null;
    }
    setHighlightedMessageId(null);
  }, []);

  const highlightMessage = useCallback(
    (messageId: string) => {
      clearMessageHighlight();
      setHighlightedMessageId(messageId);
      highlightTimerRef.current = window.setTimeout(() => {
        setHighlightedMessageId((current) => (current === messageId ? null : current));
        highlightTimerRef.current = null;
      }, 2400);
    },
    [clearMessageHighlight]
  );

  const registerMessageRef = useCallback((messageId: string, node: HTMLDivElement | null) => {
    if (node) {
      messageRefs.current.set(messageId, node);
      return;
    }
    messageRefs.current.delete(messageId);
  }, []);

  useEffect(() => {
    const targetId = pendingScrollTargetIdRef.current;
    if (targetId) {
      const targetNode = messageRefs.current.get(targetId);
      if (targetNode) {
        // 滚动到目标消息
        targetNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
        highlightMessage(targetId);
        pendingScrollTargetIdRef.current = null;
      }
      return;
    }

    if (shouldScrollToBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, highlightMessage]);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current !== null) {
        window.clearTimeout(highlightTimerRef.current);
      }
    };
  }, []);

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
          shouldScrollToBottomRef.current = false;
          setMessages(created.messages);
          setActiveSessionId(created.id);
          setActivePersonaPath(created.persona_path ?? null);
        } else {
          shouldScrollToBottomRef.current = false;
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
      shouldScrollToBottomRef.current = false;
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
      pendingScrollTargetIdRef.current = null;
      clearMessageHighlight();
      shouldScrollToBottomRef.current = false;
      await loadSession(sessionId);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('chat.loadSessionFailed'));
    }
  };

  const handleSelectSearchResult = async (result: SessionSearchResult) => {
    setError(null);
    try {
      pendingScrollTargetIdRef.current = result.id;
      shouldScrollToBottomRef.current = false;
      await loadSession(result.session_id);
    } catch (e) {
      pendingScrollTargetIdRef.current = null;
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
          shouldScrollToBottomRef.current = false;
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

      setMessages((prev) => [...prev, { role: 'assistant', content: '', tool_invocations: [] }]);
      shouldScrollToBottomRef.current = true;
      setLoading(true);
      setError(null);

      try {
        const res = await sendMessageStream(
          {
            conversation_id: activeSessionId,
            message: userContent,
            endpoint_name: selectedEndpointName,
          },
          (event) => {
            setMessages((prev) => applyStreamEvent(prev, event));
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
    // 在本地先插入一个 assistant 占位，工具事件与文本增量都挂到这条消息上。
    setInput('');
    setMessages((prev) => [
      ...prev,
      localUserMessage,
      { role: 'assistant', content: '', tool_invocations: [] },
    ]);
    shouldScrollToBottomRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const res = await sendMessageStream(
        {
          conversation_id: activeSessionId,
          message: text,
          endpoint_name: selectedEndpointName,
        },
        (event) => {
          setMessages((prev) => applyStreamEvent(prev, event));
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
            onSelectSearchResult={handleSelectSearchResult}
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
                  const messageIndex = item.key as number;
                  const messageRow = messages[messageIndex];
                  const messageId = messageRow?.id;
                  const isHighlighted = Boolean(messageId && highlightedMessageId === messageId);
                  const toolInvocations = messageRow?.tool_invocations ?? [];

                  // 仅有「思考中」且尚无工具事件时，仍用轻量 LoadingBubble；一旦有工具轨迹，用完整助手容器实时展示工具（默认折叠），下方再接正文/思考点
                  if (item.loading && toolInvocations.length === 0) {
                    return <LoadingBubble key={item.key} />;
                  }
                  if (item.role === 'assistant') {
                    return (
                      <div
                        key={messageId ?? item.key}
                        ref={messageId ? (node) => registerMessageRef(messageId, node) : undefined}
                        className={`w-full min-w-0 group scroll-mt-24 rounded-2xl px-3 py-2 transition-all duration-500 ${
                          isHighlighted ? 'bg-amber-100/80 ring-1 ring-amber-300' : ''
                        }`}
                      >
                        <ToolInvocationPanel toolInvocations={toolInvocations} t={t} />
                        {item.rawContent ? (
                          <div className="w-full min-w-0 text-foreground [&_.markdown-content]:max-w-none">
                            {item.content}
                          </div>
                        ) : item.loading ? (
                          <LoadingBubble />
                        ) : null}
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
                      key={messageId ?? item.key}
                      ref={messageId ? (node) => registerMessageRef(messageId, node) : undefined}
                      className={`flex w-full min-w-0 scroll-mt-24 items-start justify-end gap-3 rounded-2xl px-3 py-2 group transition-all duration-500 ${
                        isHighlighted ? 'bg-amber-100/80 ring-1 ring-amber-300' : ''
                      }`}
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
