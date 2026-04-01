import { useEffect, useRef, useState } from 'react';
import { DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import { App, Empty, Input, Spin } from 'antd';
import { useTranslation } from 'react-i18next';

import { searchSessions } from '../api';
import type { SessionSearchResult, SessionSummary } from '../types';

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
  const { modal } = App.useApp();
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<SessionSearchResult[]>([]);
  // 上次请求结束时的 trimmed 词；与当前输入比较得到加载态，避免在 effect 里同步 setState。
  const [completedQuery, setCompletedQuery] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  const trimmed = keyword.trim();
  const showingSearch = trimmed.length > 0;
  const listMatchesKeyword = completedQuery === trimmed;
  const displayResults = showingSearch && listMatchesKeyword ? results : [];
  const searchLoading = showingSearch && !listMatchesKeyword;

  const handleKeywordChange = (value: string) => {
    setKeyword(value);
    if (!value.trim()) {
      setResults([]);
      setCompletedQuery(null);
    }
  };

  // 防抖 + 卸载取消：仅在异步回调里更新 results / completedQuery，避免 effect 内同步 setState。
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

  const startRename = (session: SessionSummary, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(session.id);
    setEditingTitle(session.title || '');
    requestAnimationFrame(() => editInputRef.current?.select());
  };

  const commitRename = async (sessionId: string) => {
    const trimmed = editingTitle.trim();
    const orig = sessions.find((s) => s.id === sessionId)?.title;
    if (trimmed && trimmed !== orig) {
      await onRename(sessionId, trimmed);
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
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`flex items-center justify-between rounded-md p-2 cursor-pointer group ${
                session.id === activeSessionId
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
              }`}
              onClick={() => onSelect(session.id)}
            >
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
                <span className="flex-1 truncate" onDoubleClick={(e) => startRename(session, e)}>
                  {session.title || t('chat.newSession')}
                </span>
              )}
              <button
                type="button"
                className={`ml-2 p-1 rounded-full hover:bg-red-500 hover:text-white ${
                  session.id === activeSessionId
                    ? 'text-primary-foreground'
                    : 'text-muted-foreground group-hover:opacity-100 opacity-0'
                }`}
                onClick={(event) => {
                  event.stopPropagation();
                  handleDelete(session.id);
                }}
              >
                <DeleteOutlined />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
