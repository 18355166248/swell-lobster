import { Modal } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { SessionSummary } from '../types';

type SessionListProps = {
  sessions: SessionSummary[];
  activeSessionId?: string;
  onSelect: (sessionId: string) => void;
  onDelete: (sessionId: string) => Promise<void>;
};

export function SessionList({ sessions, activeSessionId, onSelect, onDelete }: SessionListProps) {
  const { t } = useTranslation();

  const handleDelete = (sessionId: string) => {
    Modal.confirm({
      title: t('chat.deleteSessionConfirm'),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      okButtonProps: { danger: true },
      onOk: () => onDelete(sessionId),
    });
  };

  return (
    <div className="flex flex-col gap-1">
      {sessions.map((s) => (
        <div
          key={s.id}
          className={`flex items-center justify-between rounded-md p-2 cursor-pointer group
            ${s.id === activeSessionId ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}
          `}
          onClick={() => onSelect(s.id)}
        >
          <span className="flex-1 truncate">{s.title || t('chat.newSession')}</span>
          <button
            className={`ml-2 p-1 rounded-full hover:bg-red-500 hover:text-white ${s.id === activeSessionId ? 'text-primary-foreground' : 'text-muted-foreground group-hover:opacity-100 opacity-0'}`}
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(s.id);
            }}
          >
            <DeleteOutlined />
          </button>
        </div>
      ))}
    </div>
  );
}
