import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DeleteOutlined,
  EditOutlined,
  MoreOutlined,
  PushpinFilled,
  PushpinOutlined,
  SearchOutlined,
  CheckSquareOutlined,
  FileMarkdownOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { App, Button, Checkbox, Dropdown, Empty, Input, Spin } from 'antd';
import { useTranslation } from 'react-i18next';
import { useAtomValue } from 'jotai';

import { searchSessions } from '../api';
import type { SessionSearchResult, SessionSummary } from '../types';
import { chatGeneratingAtom } from '../../../store/chatGenerating';
import { getApiBase } from '../../../api/base';
import { reportFrontendError } from '../../../logging/frontend';

type SessionListProps = {
  sessions: SessionSummary[];
  activeSessionId?: string;
  onSelect: (sessionId: string) => void;
  onSelectSearchResult: (result: SessionSearchResult) => void;
  onDelete: (sessionId: string) => Promise<void>;
  onRename: (sessionId: string, newTitle: string) => Promise<void>;
};

/** 列表预览：压空白并截断，避免搜索命中长消息撑破侧栏。 */
function summarizeContent(content: string): string {
  return content.replace(/\s+/g, ' ').trim().slice(0, 64);
}

export function SessionList({
  sessions,
  activeSessionId,
  onSelect,
  onSelectSearchResult,
  onDelete,
  onRename,
}: SessionListProps) {
  const { t } = useTranslation();
  const { modal, message } = App.useApp();
  const chatGenerating = useAtomValue(chatGeneratingAtom);

  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<SessionSearchResult[]>([]);
  const [completedQuery, setCompletedQuery] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const trimmed = keyword.trim();
  const showingSearch = trimmed.length > 0;
  const listMatchesKeyword = completedQuery === trimmed;
  const displayResults = showingSearch && listMatchesKeyword ? results : [];
  const searchLoading = showingSearch && !listMatchesKeyword;

  const sortedSessions = useMemo(() => {
    const pinned = sessions.filter((s) => pinnedIds.has(s.id));
    const unpinned = sessions.filter((s) => !pinnedIds.has(s.id));
    return [...pinned, ...unpinned];
  }, [sessions, pinnedIds]);

  const handleKeywordChange = (value: string) => {
    setKeyword(value);
    if (!value.trim()) {
      setResults([]);
      setCompletedQuery(null);
    }
  };

  useEffect(() => {
    if (!trimmed) return;
    let cancelled = false;
    const query = trimmed;
    const timer = window.setTimeout(() => {
      searchSessions(query)
        .then((rows) => {
          if (!cancelled) {
            setResults(rows);
            setCompletedQuery(query);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setResults([]);
            setCompletedQuery(query);
          }
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [trimmed]);

  const startRename = (session: SessionSummary) => {
    setEditingId(session.id);
    setEditingTitle(session.title || '');
    requestAnimationFrame(() => editInputRef.current?.select());
  };

  const commitRename = async (sessionId: string) => {
    const value = editingTitle.trim();
    const orig = sessions.find((s) => s.id === sessionId)?.title;
    if (value && value !== orig) {
      await onRename(sessionId, value);
    }
    setEditingId(null);
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent, sessionId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void commitRename(sessionId);
    }
    if (e.key === 'Escape') {
      setEditingId(null);
    }
  };

  const handleDelete = (sessionId: string) => {
    modal.confirm({
      title: t('chat.deleteSessionConfirm'),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      okButtonProps: { danger: true },
      onOk: () => onDelete(sessionId),
    });
  };

  const handleTogglePin = (sessionId: string) => {
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  };

  const handleEnterBatch = (sessionId?: string) => {
    setBatchMode(true);
    if (sessionId) setSelectedIds(new Set([sessionId]));
  };

  const handleCancelBatch = () => {
    setBatchMode(false);
    setSelectedIds(new Set());
  };

  const handleSelectAll = () => setSelectedIds(new Set(sessions.map((s) => s.id)));

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBatchDelete = () => {
    if (selectedIds.size === 0) return;
    modal.confirm({
      title: t('chat.batchDeleteConfirm', { count: selectedIds.size }),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      okButtonProps: { danger: true },
      onOk: async () => {
        for (const id of selectedIds) {
          await onDelete(id);
        }
        handleCancelBatch();
      },
    });
  };

  const handleExport = async (sessionId: string, format: 'md' | 'json') => {
    const url = `${getApiBase()}/api/export/session/${sessionId}?format=${format}`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status}`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const contentDisposition = res.headers.get('Content-Disposition') ?? '';
      const matched = /filename="([^"]+)"/.exec(contentDisposition);
      a.href = objectUrl;
      a.download = matched?.[1] ?? `session-${sessionId}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      void reportFrontendError({
        path: `/api/export/session/${sessionId}`,
        message: 'chat session export failed',
        context: {
          sessionId,
          format,
          error: error instanceof Error ? error.message : String(error),
        },
      }).catch(() => {});
      void message.error(t('chat.exportFailed'));
    }
  };

  const getMenuItems = (session: SessionSummary) => [
    {
      key: 'batch',
      label: t('chat.batchSelect'),
      icon: <CheckSquareOutlined />,
      onClick: () => handleEnterBatch(session.id),
    },
    {
      key: 'rename',
      label: t('chat.rename'),
      icon: <EditOutlined />,
      onClick: () => startRename(session),
    },
    {
      key: 'pin',
      label: pinnedIds.has(session.id) ? t('chat.unpin') : t('chat.pin'),
      icon: pinnedIds.has(session.id) ? <PushpinFilled /> : <PushpinOutlined />,
      onClick: () => handleTogglePin(session.id),
    },
    { type: 'divider' as const },
    {
      key: 'export-md',
      label: t('chat.exportMarkdown'),
      icon: <FileMarkdownOutlined />,
      onClick: () => handleExport(session.id, 'md'),
    },
    {
      key: 'export-json',
      label: t('chat.exportJson'),
      icon: <FileTextOutlined />,
      onClick: () => handleExport(session.id, 'json'),
    },
    { type: 'divider' as const },
    {
      key: 'delete',
      label: t('common.delete'),
      icon: <DeleteOutlined />,
      danger: true,
      onClick: () => handleDelete(session.id),
    },
  ];

  return (
    <div className="flex flex-col gap-2">
      <Input
        allowClear
        size="small"
        value={keyword}
        prefix={<SearchOutlined />}
        placeholder={t('chat.searchPlaceholder')}
        onChange={(event) => handleKeywordChange(event.target.value)}
      />

      {showingSearch ? (
        <div className="flex flex-col gap-1">
          {searchLoading ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Spin size="small" />
            </div>
          ) : displayResults.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={t('chat.searchNoResult')}
              className="py-4"
            />
          ) : (
            displayResults.map((result) => (
              <button
                key={result.id}
                type="button"
                className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
                  result.session_id === activeSessionId
                    ? 'border-primary bg-primary/10'
                    : 'border-transparent hover:bg-muted'
                }`}
                onClick={() => onSelectSearchResult(result)}
              >
                <div className="truncate text-sm font-medium text-foreground">
                  {result.session_title || t('chat.newSession')}
                </div>
                <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {summarizeContent(result.content)}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground/80">
                  {new Date(result.created_at).toLocaleString()}
                </div>
              </button>
            ))
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {batchMode && (
            <div className="flex items-center gap-1 px-1 pb-1 border-b border-border">
              <span className="text-xs text-muted-foreground flex-1">
                {t('chat.selectedCount', { count: selectedIds.size })}
              </span>
              <Button size="small" type="link" className="px-1 text-xs" onClick={handleSelectAll}>
                {t('chat.selectAll')}
              </Button>
              <Button
                size="small"
                type="link"
                danger
                disabled={selectedIds.size === 0}
                className="px-1 text-xs"
                onClick={handleBatchDelete}
              >
                {t('common.delete')}
              </Button>
              <Button size="small" type="link" className="px-1 text-xs" onClick={handleCancelBatch}>
                {t('common.cancel')}
              </Button>
            </div>
          )}

          {sortedSessions.map((session) => (
            <div
              key={session.id}
              className={`flex items-center rounded-md px-2 py-1.5 cursor-pointer group relative ${
                session.id === activeSessionId
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
              } ${batchMode ? 'gap-2' : ''}`}
              onClick={() => {
                if (batchMode) {
                  handleToggleSelect(session.id);
                } else {
                  onSelect(session.id);
                }
              }}
            >
              {batchMode && (
                <Checkbox
                  checked={selectedIds.has(session.id)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => handleToggleSelect(session.id)}
                  className="shrink-0"
                />
              )}

              {editingId === session.id ? (
                <input
                  ref={editInputRef}
                  className="flex-1 min-w-0 bg-transparent border-b border-primary text-sm outline-none px-0.5"
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onBlur={() => void commitRename(session.id)}
                  onKeyDown={(e) => handleRenameKeyDown(e, session.id)}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="flex-1 min-w-0 flex items-center gap-1.5 text-sm">
                  {pinnedIds.has(session.id) && (
                    <PushpinFilled className="shrink-0 text-[10px] opacity-60" />
                  )}
                  {chatGenerating.has(session.id) && (
                    <span className="inline-flex shrink-0 w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  )}
                  <span className="truncate">{session.title || t('chat.newSession')}</span>
                </span>
              )}

              {!batchMode && editingId !== session.id && (
                <Dropdown
                  menu={{ items: getMenuItems(session) }}
                  trigger={['click']}
                  placement="bottomRight"
                >
                  <button
                    type="button"
                    className={`shrink-0 p-0.5 rounded transition-opacity ${
                      session.id === activeSessionId
                        ? 'text-primary-foreground/70 hover:text-primary-foreground opacity-0 group-hover:opacity-100'
                        : 'text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100'
                    }`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreOutlined />
                  </button>
                </Dropdown>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
