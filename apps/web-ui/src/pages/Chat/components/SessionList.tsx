import { useTranslation } from 'react-i18next';
import type { SessionSummary } from '../types';

type SessionListProps = {
  sessions: SessionSummary[];
  activeSessionId?: string;
  onSelect: (sessionId: string) => void;
};

export function SessionList({ sessions, activeSessionId, onSelect }: SessionListProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-2">
      {sessions.map((s) => {
        const active = s.id === activeSessionId;
        return (
          <button
            type="button"
            key={s.id}
            onClick={() => onSelect(s.id)}
            className={`w-full text-left rounded-xl border px-3 py-2 transition-colors ${
              active
                ? 'border-accent bg-accent/10'
                : 'border-border bg-background hover:bg-muted/60'
            }`}
          >
            <div className="text-sm text-foreground truncate">
              {s.title || t('chat.newSession')}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {t('chat.messageCount', { count: s.message_count })}
            </div>
          </button>
        );
      })}
    </div>
  );
}
