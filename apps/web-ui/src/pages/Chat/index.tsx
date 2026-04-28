import { useEffect, useMemo, useRef, useState, useCallback, memo } from 'react';
import { Alert, Avatar, Button, Select, Skeleton } from 'antd';
import { FileTextOutlined, PlusOutlined, RobotOutlined, UserOutlined } from '@ant-design/icons';
import { useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { chatGeneratingAtom } from '../../store/chatGenerating';

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
import { getApiBase } from '../../api/base';
import type {
  ChatAttachment,
  ChatMessage,
  ChatStreamEvent,
  ChatSession,
  EndpointItem,
  MessageBlock,
  SessionSearchResult,
  SessionSummary,
  ToolInvocation,
} from './types';
import type { UploadedAttachment } from './components/ImageUploadButton';
import { TemplatePickerModal } from './components/TemplatePickerModal';
import { SessionList } from './components/SessionList';
import { ChatComposer } from './components/ChatComposer';
import { LoadingBubble } from './components/LoadingBubble';
import { PersonaSelect } from './components/PersonaSelect';
import { MessageActions } from './components/MessageActions';

const lastPersonaAtom = atomWithStorage<string | null>('chat_last_persona', null);

function hydrateAttachments(
  attachments?: Array<{ kind: 'image' | 'file'; filename: string; mimeType: string }>
): ChatAttachment[] | undefined {
  if (!attachments?.length) return undefined;
  return attachments.map((attachment) => ({
    ...attachment,
    url: `${getApiBase()}/api/uploads/${attachment.filename}`,
  }));
}

function attachmentsToImageUrls(attachments?: ChatAttachment[]): string[] | undefined {
  const images = attachments
    ?.filter((attachment) => attachment.kind === 'image')
    .map((attachment) => attachment.url);
  return images?.length ? images : undefined;
}

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
    return updateLastAssistantMessage(messages, (message) => {
      const blocks = message.blocks ?? [];
      const lastBlock = blocks[blocks.length - 1];
      let newBlocks: MessageBlock[];
      if (lastBlock?.type === 'text') {
        newBlocks = [
          ...blocks.slice(0, -1),
          { type: 'text', content: lastBlock.content + event.delta },
        ];
      } else {
        newBlocks = [...blocks, { type: 'text', content: event.delta }];
      }
      return { ...message, content: message.content + event.delta, blocks: newBlocks };
    });
  }

  if (event.type === 'tool_call') {
    return updateLastAssistantMessage(messages, (message) => {
      const newInvocation: ToolInvocation = {
        id: `${event.name}_${Date.now()}_${message.tool_invocations?.length ?? 0}`,
        name: event.name,
        arguments: event.arguments,
        status: 'running',
      };
      return {
        ...message,
        tool_invocations: [...(message.tool_invocations ?? []), newInvocation],
        blocks: [...(message.blocks ?? []), { type: 'tool_invocation', invocation: newInvocation }],
      };
    });
  }

  return updateLastAssistantMessage(messages, (message) => {
    const toolInvocations = [...(message.tool_invocations ?? [])];
    const lastRunningIndex = [...toolInvocations]
      .reverse()
      .findIndex((item) => item.name === event.name && item.status === 'running');
    const targetIndex =
      lastRunningIndex === -1 ? -1 : toolInvocations.length - 1 - lastRunningIndex;

    let updatedInvocation: ToolInvocation;
    if (targetIndex === -1) {
      updatedInvocation = {
        id: `${event.name}_${Date.now()}_${toolInvocations.length}`,
        name: event.name,
        arguments: {},
        status: event.status,
        result: event.content,
        truncated: event.truncated,
        original_length: event.original_length,
      };
      toolInvocations.push(updatedInvocation);
    } else {
      updatedInvocation = {
        ...toolInvocations[targetIndex],
        status: event.status,
        result: event.content,
        truncated: event.truncated,
        original_length: event.original_length,
      };
      toolInvocations[targetIndex] = updatedInvocation;
    }

    // 同步更新 blocks 中对应的 tool_invocation 块
    const blocks = (message.blocks ?? []).map((block) => {
      if (
        block.type === 'tool_invocation' &&
        block.invocation.name === event.name &&
        block.invocation.status === 'running'
      ) {
        return { ...block, invocation: updatedInvocation };
      }
      return block;
    });

    return { ...message, tool_invocations: toolInvocations, blocks };
  });
}

function formatRelativeTime(
  iso: string | undefined,
  t: (k: string, o?: object) => string
): string | null {
  if (!iso) return null;
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return t('chat.timeJustNow');
  if (diff < 3600) return t('chat.timeMinutesAgo', { n: Math.floor(diff / 60) });
  if (diff < 86400) return t('chat.timeHoursAgo', { n: Math.floor(diff / 3600) });
  return t('chat.timeDaysAgo', { n: Math.floor(diff / 86400) });
}

/**
 * 流式完成后，把内存中最后一条 assistant 消息的 blocks 合并到服务器返回的消息列表里。
 * 服务器不存储 blocks，不合并的话渲染会降级到无序模式。
 */
function mergeBlocksFromMemory(
  serverMessages: ChatMessage[],
  inMemoryMessages: ChatMessage[]
): ChatMessage[] {
  const lastMemBlocks = [...inMemoryMessages]
    .reverse()
    .find((m) => m.role === 'assistant' && m.blocks && m.blocks.length > 0)?.blocks;
  if (!lastMemBlocks) return serverMessages;

  const result = [...serverMessages];
  for (let i = result.length - 1; i >= 0; i--) {
    if (result[i].role === 'assistant') {
      result[i] = { ...result[i], blocks: lastMemBlocks };
      break;
    }
  }
  return result;
}

/**
 * 从工具参数里提取最有价值的一个摘要字符串。
 * 优先取路径/查询等关键参数，路径只保留文件名部分。
 */
function getToolArgSummary(args: Record<string, unknown>): string | null {
  const priorityKeys = ['script_path', 'path', 'url', 'query', 'pattern', 'memory_type', 'content'];
  const allKeys = [...priorityKeys, ...Object.keys(args).filter((k) => !priorityKeys.includes(k))];

  for (const key of allKeys) {
    const val = args[key];
    if (typeof val !== 'string' || !val.trim()) continue;
    // 路径只取最后一段文件名
    const display =
      val.includes('/') || val.includes('\\')
        ? (val.replace(/\\/g, '/').split('/').pop() ?? val)
        : val;
    const trimmed = display.trim();
    return trimmed.length > 40 ? trimmed.slice(0, 38) + '…' : trimmed;
  }
  return null;
}

function ToolCard({
  item,
  t,
}: {
  item: ToolInvocation;
  t: (key: string, options?: object) => string;
}) {
  return (
    <details
      key={item.id}
      className="rounded-xl border border-border bg-muted/35 px-3 py-2 text-sm text-foreground"
    >
      <summary className="cursor-pointer list-none">
        <div
          className={`flex items-center gap-2 min-w-0 rounded-lg${item.status === 'running' ? ' tool-title-shimmer' : ''}`}
        >
          <div className={`tool-status-dot ${item.status} shrink-0`} />
          <span className="font-medium shrink-0">{item.name}</span>
          {(() => {
            const summary = getToolArgSummary(item.arguments);
            return summary ? (
              <span className="text-muted-foreground truncate min-w-0">· {summary}</span>
            ) : null;
          })()}
        </div>
      </summary>
      <div className="mt-2 max-h-64 overflow-y-auto space-y-2">
        <pre className="overflow-x-auto rounded-lg bg-background px-2 py-1.5 text-xs">
          {JSON.stringify(item.arguments, null, 2)}
        </pre>
        {item.result ? (
          <pre className="overflow-x-auto rounded-lg bg-background px-2 py-1.5 text-xs">
            {item.result}
          </pre>
        ) : null}
        {item.truncated && (
          <span className="text-xs text-muted-foreground">
            {t('chat.toolTruncated', { length: item.original_length })}
          </span>
        )}
      </div>
    </details>
  );
}

function ToolInvocationPanel({
  toolInvocations,
  t,
}: {
  toolInvocations: ToolInvocation[];
  t: (key: string, options?: object) => string;
}) {
  if (toolInvocations.length === 0) return null;

  return (
    <div className="my-3 flex flex-col gap-2">
      {toolInvocations.map((item) => (
        <ToolCard key={item.id} item={item} t={t} />
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
  // 每个会话独立缓存消息，切换会话时不丢失正在生成的内容
  const [sessionMessagesMap, setSessionMessagesMap] = useState<Map<string, ChatMessage[]>>(
    () => new Map()
  );
  const [input, setInput] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<UploadedAttachment[]>([]);
  const [chatGeneratingSessions, setChatGenerating] = useAtom(chatGeneratingAtom);

  // 当前展示的消息（由 activeSessionId 派生，不是独立 state）
  const messages = sessionMessagesMap.get(activeSessionId) ?? [];

  // 更新指定会话的消息
  const updateSessionMessages = useCallback(
    (sessionId: string, updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
      setSessionMessagesMap((prev) => {
        const current = prev.get(sessionId) ?? [];
        const next = typeof updater === 'function' ? updater(current) : updater;
        return new Map(prev).set(sessionId, next);
      });
    },
    []
  );
  const [bootLoading, setBootLoading] = useState(true);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastPersona, setLastPersona] = useAtom(lastPersonaAtom);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const shouldScrollToBottomRef = useRef(false);
  const userIsAtBottomRef = useRef(true);
  const scrollBehaviorRef = useRef<ScrollBehavior>('smooth');
  const pendingScrollTargetIdRef = useRef<string | null>(null);
  const highlightTimerRef = useRef<number | null>(null);
  const messageRefs = useRef(new Map<string, HTMLDivElement | null>());
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const SCROLL_THRESHOLD = 150;
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = dist <= SCROLL_THRESHOLD;
    userIsAtBottomRef.current = atBottom;
    setShowScrollBtn(!atBottom);
  }, []);

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
        requestAnimationFrame(() => {
          targetNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        highlightMessage(targetId);
        pendingScrollTargetIdRef.current = null;
      }
      return;
    }

    if (shouldScrollToBottomRef.current && userIsAtBottomRef.current) {
      const behavior = scrollBehaviorRef.current;
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior });
        scrollBehaviorRef.current = 'smooth';
      });
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
    const messagesWithImages = (detail.messages || []).map((msg) => ({
      ...msg,
      attachments: hydrateAttachments(msg.attachments),
      imageUrls: attachmentsToImageUrls(hydrateAttachments(msg.attachments)),
    }));
    updateSessionMessages(detail.id, messagesWithImages);
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
          updateSessionMessages(created.id, created.messages);
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

  const handleCreateSession = async (templateId?: string | null) => {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const session = await createSession(selectedEndpointName, lastPersona, templateId);
      setSessions((prev) => upsertSessionSummary(prev, session));
      setActiveSessionId(session.id);
      setActivePersonaPath(session.persona_path ?? null);
      shouldScrollToBottomRef.current = false;
      updateSessionMessages(session.id, session.messages);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('chat.createSessionFailed'));
    } finally {
      setCreating(false);
    }
  };

  const handleSelectSession = async (sessionId: string) => {
    if (sessionId === activeSessionId) return;
    setError(null);
    setShowScrollBtn(false);
    pendingScrollTargetIdRef.current = null;
    clearMessageHighlight();
    shouldScrollToBottomRef.current = true;
    userIsAtBottomRef.current = true;
    scrollBehaviorRef.current = 'instant';

    // 目标会话正在生成中：消息已在 map 里实时更新，直接切换 ID 即可，不能重新从 API 加载
    if (chatGeneratingSessions.has(sessionId)) {
      setActiveSessionId(sessionId);
      return;
    }

    setSessionLoading(true);
    try {
      await loadSession(sessionId);
    } catch (e) {
      shouldScrollToBottomRef.current = false;
      setError(e instanceof Error ? e.message : t('chat.loadSessionFailed'));
    } finally {
      setSessionLoading(false);
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
          updateSessionMessages(created.id, created.messages);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('chat.deleteSessionFailed'));
    }
  };

  const handleRenameSession = async (sessionId: string, newTitle: string) => {
    setError(null);
    try {
      const updated = await updateSession(sessionId, { title: newTitle });
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, title: updated.title } : s))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : t('chat.renameSessionFailed'));
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
      if (chatGeneratingSessions.has(activeSessionId)) return;
      const genSessionId = activeSessionId;
      const currentMessages = sessionMessagesMap.get(genSessionId) ?? [];

      let userContent = '';
      let userAttachments: ChatAttachment[] = [];
      for (let i = msgIndex - 1; i >= 0; i--) {
        if (currentMessages[i].role === 'user') {
          userContent = currentMessages[i].content;
          userAttachments = currentMessages[i].attachments ?? [];
          break;
        }
      }
      if (!userContent && userAttachments.length === 0) return;

      const controller = new AbortController();
      abortRef.current = controller;

      updateSessionMessages(genSessionId, (prev) => [
        ...prev,
        { role: 'assistant', content: '', tool_invocations: [] },
      ]);
      shouldScrollToBottomRef.current = true;
      userIsAtBottomRef.current = true;
      if (genSessionId) {
        setChatGenerating((prev) => new Set(prev).add(genSessionId));
      }
      setError(null);

      try {
        const res = await sendMessageStream(
          {
            conversation_id: genSessionId,
            message: userContent,
            endpoint_name: selectedEndpointName,
            attachments:
              userAttachments.length > 0
                ? userAttachments.map(({ kind, filename, mimeType }) => ({
                    kind,
                    filename,
                    mimeType,
                  }))
                : undefined,
          },
          (event) => {
            updateSessionMessages(genSessionId, (prev) => applyStreamEvent(prev, event));
          },
          controller.signal
        );
        const serverMsgs = (res.session.messages || []).map((msg) => ({
          ...msg,
          attachments: hydrateAttachments(msg.attachments),
          imageUrls: attachmentsToImageUrls(hydrateAttachments(msg.attachments)),
        }));
        updateSessionMessages(genSessionId, (prev) => mergeBlocksFromMemory(serverMsgs, prev));
        setSessions((prev) => upsertSessionSummary(prev, res.session));
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') {
          updateSessionMessages(genSessionId, (prev) => {
            const last = prev[prev.length - 1];
            if (!last || last.role !== 'assistant') return prev;
            if (!last.content && !last.tool_invocations?.length) return prev.slice(0, -1);
            const stoppedInvocations = last.tool_invocations?.map((t) =>
              t.status === 'running' ? { ...t, status: 'failed' as const } : t
            );
            return [...prev.slice(0, -1), { ...last, tool_invocations: stoppedInvocations }];
          });
        } else {
          updateSessionMessages(genSessionId, (prev) => prev.slice(0, -1));
          setError(e instanceof Error ? e.message : t('chat.sendFailed'));
        }
      } finally {
        abortRef.current = null;
        if (genSessionId) {
          setChatGenerating((prev) => {
            const next = new Set(prev);
            next.delete(genSessionId);
            return next;
          });
        }
      }
    },
    [
      chatGeneratingSessions,
      sessionMessagesMap,
      activeSessionId,
      selectedEndpointName,
      updateSessionMessages,
      setChatGenerating,
      t,
    ]
  );

  const ChatMarkdown = memo(({ text }: { text: string }) => {
    return <MarkdownContent content={text} />;
  });

  const send = async () => {
    const text = input.trim();
    if ((!text && pendingAttachments.length === 0) || chatGeneratingSessions.has(activeSessionId))
      return;

    // 在 async 前捕获当前 session ID（新会话时可能为空字符串）
    const genSessionId = activeSessionId;
    const controller = new AbortController();
    abortRef.current = controller;

    const localUserMessage: ChatMessage = {
      role: 'user',
      content: text,
      attachments: pendingAttachments.map((attachment) => ({
        kind: attachment.kind,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        url: attachment.previewUrl ?? `${getApiBase()}/api/uploads/${attachment.filename}`,
      })),
      imageUrls: pendingAttachments.flatMap((attachment) =>
        attachment.kind === 'image' && attachment.previewUrl ? [attachment.previewUrl] : []
      ),
    };
    const attachmentsToSend = pendingAttachments.map(({ kind, mimeType, filename }) => ({
      kind,
      mimeType,
      filename,
    }));
    setInput('');
    setPendingAttachments([]);
    updateSessionMessages(genSessionId, (prev) => [
      ...prev,
      localUserMessage,
      { role: 'assistant', content: '', tool_invocations: [] },
    ]);
    shouldScrollToBottomRef.current = true;
    userIsAtBottomRef.current = true;
    if (genSessionId) {
      setChatGenerating((prev) => new Set(prev).add(genSessionId));
    }
    setError(null);

    try {
      const res = await sendMessageStream(
        {
          conversation_id: genSessionId,
          message: text,
          endpoint_name: selectedEndpointName,
          attachments: attachmentsToSend.length > 0 ? attachmentsToSend : undefined,
        },
        (event) => {
          updateSessionMessages(genSessionId, (prev) => applyStreamEvent(prev, event));
        },
        controller.signal
      );
      // 新会话：session ID 在完成后才拿到
      if (res.conversation_id !== genSessionId) {
        setSessionMessagesMap((prev) => {
          const next = new Map(prev);
          next.delete(genSessionId);
          return next;
        });
      }
      setActiveSessionId(res.conversation_id);
      const serverMsgs = (res.session.messages || []).map((msg) => ({
        ...msg,
        attachments: hydrateAttachments(msg.attachments),
        imageUrls: attachmentsToImageUrls(hydrateAttachments(msg.attachments)),
      }));
      updateSessionMessages(res.conversation_id, (prev) => mergeBlocksFromMemory(serverMsgs, prev));
      setSessions((prev) => upsertSessionSummary(prev, res.session));
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        // 用户主动停止：移除空的 assistant 占位，保留已流出的内容；将 running 的工具标为 failed
        updateSessionMessages(genSessionId, (prev) => {
          const last = prev[prev.length - 1];
          if (!last || last.role !== 'assistant') return prev;
          if (!last.content && !last.tool_invocations?.length) return prev.slice(0, -1);
          const stoppedInvocations = last.tool_invocations?.map((t) =>
            t.status === 'running' ? { ...t, status: 'failed' as const } : t
          );
          return [...prev.slice(0, -1), { ...last, tool_invocations: stoppedInvocations }];
        });
      } else {
        updateSessionMessages(genSessionId, (prev) => prev.slice(0, Math.max(0, prev.length - 2)));
        setError(e instanceof Error ? e.message : t('chat.sendFailed'));
      }
    } finally {
      abortRef.current = null;
      if (genSessionId) {
        setChatGenerating((prev) => {
          const next = new Set(prev);
          next.delete(genSessionId);
          return next;
        });
      }
    }
  };

  const bubbleItems = useMemo(
    () => {
      const isGenerating = chatGeneratingSessions.has(activeSessionId);
      return messages.map((m, i) => {
        const isLastAssistant = isGenerating && m.role === 'assistant' && i === messages.length - 1;
        return {
          key: i,
          role: m.role === 'user' ? 'user' : 'assistant',
          rawContent: m.content,
          content: <ChatMarkdown text={m.content} />,
          loading: isLastAssistant && m.content === '',
          streaming: isLastAssistant && m.content !== '',
        };
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionMessagesMap, activeSessionId, chatGeneratingSessions]
  );

  return (
    <div className="flex h-full animate-in fade-in-50 duration-200">
      <aside className="w-64 border-r border-border bg-background/95 px-3 py-4 flex flex-col gap-3">
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setTemplatePickerOpen(true)}
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
            onRename={handleRenameSession}
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

        <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
          {/* 全宽滚动：滚动条贴在主栏最右侧；内层 max-w-[800px] 仅限制内容宽度 */}
          <div
            ref={scrollContainerRef}
            className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden"
            onScroll={handleScroll}
          >
            {bootLoading ? (
              <div className="max-w-[800px] mx-auto w-full min-h-full min-w-0 px-6 flex items-center justify-center py-8">
                <span className="text-sm text-muted-foreground">{t('common.loading')}</span>
              </div>
            ) : sessionLoading ? (
              <div className="max-w-[800px] mx-auto w-full min-w-0 px-6 py-6 flex flex-col gap-8">
                <Skeleton active avatar={{ shape: 'circle' }} paragraph={{ rows: 3 }} />
                <Skeleton
                  active
                  avatar={{ shape: 'circle' }}
                  paragraph={{ rows: 2 }}
                  className="flex-row-reverse"
                />
                <Skeleton active avatar={{ shape: 'circle' }} paragraph={{ rows: 4 }} />
                <Skeleton
                  active
                  avatar={{ shape: 'circle' }}
                  paragraph={{ rows: 2 }}
                  className="flex-row-reverse"
                />
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
                    <Alert type="error" title={error} showIcon />
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
                    const blocks = messageRow?.blocks;
                    const hasTool = blocks
                      ? blocks.some((b) => b.type === 'tool_invocation')
                      : toolInvocations.length > 0;
                    return (
                      <div
                        key={messageId ?? item.key}
                        ref={messageId ? (node) => registerMessageRef(messageId, node) : undefined}
                        className={`w-full min-w-0 group scroll-mt-24 rounded-2xl px-3 py-2 transition-all duration-500 ${
                          isHighlighted ? 'bg-amber-100/80 ring-1 ring-amber-300' : ''
                        }`}
                      >
                        {blocks ? (
                          // 流式构建的消息：按 blocks 有序渲染
                          <div className="flex flex-col gap-2">
                            {blocks.map((block, blockIndex) => {
                              if (block.type === 'tool_invocation') {
                                return (
                                  <ToolCard
                                    key={block.invocation.id}
                                    item={block.invocation}
                                    t={t as (key: string, options?: object) => string}
                                  />
                                );
                              }
                              // 文本块：在有工具的消息中，工具前的文本是"思考过程"
                              const isBeforeTool =
                                hasTool &&
                                !blocks
                                  .slice(0, blockIndex)
                                  .some((b) => b.type === 'tool_invocation');
                              return isBeforeTool ? (
                                <div
                                  key={blockIndex}
                                  className={`pl-3 border-l-2 border-border text-sm text-muted-foreground [&_.markdown-content]:max-w-none${item.streaming ? ' streaming-text' : ''}`}
                                >
                                  <ChatMarkdown text={block.content} />
                                </div>
                              ) : (
                                <div
                                  key={blockIndex}
                                  className={`w-full min-w-0 text-foreground [&_.markdown-content]:max-w-none${item.streaming ? ' streaming-text' : ''}`}
                                >
                                  <ChatMarkdown text={block.content} />
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          // 历史消息降级：tools 在前，content 在后（无法还原原始顺序）
                          <>
                            <ToolInvocationPanel
                              toolInvocations={toolInvocations}
                              t={t as (key: string, options?: object) => string}
                            />
                            {item.rawContent ? (
                              <div
                                className={`w-full min-w-0 text-foreground [&_.markdown-content]:max-w-none${item.streaming ? ' streaming-text' : ''}`}
                              >
                                {item.content}
                              </div>
                            ) : item.loading ? (
                              <LoadingBubble />
                            ) : null}
                          </>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity select-none whitespace-nowrap">
                            {formatRelativeTime(
                              messageRow?.created_at,
                              t as (k: string, o?: object) => string
                            )}
                          </span>
                          <MessageActions
                            content={item.rawContent}
                            role="assistant"
                            align="end"
                            onRetry={
                              !chatGeneratingSessions.has(activeSessionId) &&
                              item.key === messages.length - 1
                                ? () => handleRetry(item.key as number)
                                : undefined
                            }
                          />
                        </div>
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
                        {messageRow?.attachments && messageRow.attachments.length > 0 && (
                          <div className="mb-1.5 flex flex-wrap justify-end gap-1.5">
                            {messageRow.attachments.map((attachment, idx) =>
                              attachment.kind === 'image' ? (
                                <a key={idx} href={attachment.url} target="_blank" rel="noreferrer">
                                  <img
                                    src={attachment.url}
                                    alt=""
                                    className="h-40 max-w-xs rounded-xl object-cover border border-border hover:opacity-90 transition-opacity"
                                  />
                                </a>
                              ) : (
                                <a
                                  key={idx}
                                  href={attachment.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex max-w-xs items-center gap-2 rounded-xl border border-border bg-muted px-3 py-2 text-sm text-foreground hover:bg-muted/80"
                                >
                                  <FileTextOutlined />
                                  <span className="truncate">{attachment.filename}</span>
                                </a>
                              )
                            )}
                          </div>
                        )}
                        {item.content ? (
                          <div className="flex flex-wrap gap-1.5 mb-1.5 justify-end">
                            <div className="rounded-2xl bg-muted px-4 py-2.5 text-[15px] leading-6 text-foreground">
                              {item.content}
                            </div>
                          </div>
                        ) : null}
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-[11px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity select-none whitespace-nowrap">
                            {formatRelativeTime(
                              messageRow?.created_at,
                              t as (k: string, o?: object) => string
                            )}
                          </span>
                          <MessageActions content={item.rawContent} role="user" align="end" />
                        </div>
                      </div>
                      <Avatar size="small" icon={<UserOutlined />} className="shrink-0" />
                    </div>
                  );
                })}
                {error && (
                  <div className="shrink-0">
                    <Alert type="error" title={error} showIcon />
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {showScrollBtn && (
            <button
              type="button"
              onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
              className="scroll-to-bottom-btn"
              aria-label={t('chat.scrollToBottom')}
            >
              ↓
            </button>
          )}
          <div className="max-w-[800px] w-full mx-auto min-w-0 shrink-0">
            <ChatComposer
              input={input}
              loading={chatGeneratingSessions.has(activeSessionId)}
              streaming={chatGeneratingSessions.has(activeSessionId)}
              onInputChange={setInput}
              onSend={send}
              onStop={handleStop}
              activeSessionId={activeSessionId}
              attachments={pendingAttachments}
              onAddAttachment={(attachment) =>
                setPendingAttachments((prev) => [...prev, attachment])
              }
              onRemoveAttachment={(idx) =>
                setPendingAttachments((prev) => prev.filter((_, i) => i !== idx))
              }
            />
          </div>
        </div>
      </div>

      <TemplatePickerModal
        open={templatePickerOpen}
        onCancel={() => setTemplatePickerOpen(false)}
        onSelect={(templateId) => {
          setTemplatePickerOpen(false);
          void handleCreateSession(templateId);
        }}
      />
    </div>
  );
}
