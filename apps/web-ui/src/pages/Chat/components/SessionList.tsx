import { Modal } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { Conversations } from '@ant-design/x';
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
    <Conversations
      items={sessions.map((s) => ({
        key: s.id,
        label: s.title || t('chat.newSession'),
      }))}
      activeKey={activeSessionId}
      onActiveChange={(key) => onSelect(key as string)}
      menu={(conversation) => ({
        items: [
          {
            key: 'delete',
            label: t('common.delete'),
            icon: <DeleteOutlined />,
            danger: true,
            onClick: () => handleDelete(conversation.key as string),
          },
        ],
      })}
    />
  );
}
