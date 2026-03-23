import { useEffect, useRef } from 'react';
import { ChatSender } from './ChatSender';
import { useTranslation } from 'react-i18next';
import type { TextAreaRef } from 'antd/es/input/TextArea';

type ChatComposerProps = {
  input: string;
  loading: boolean;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  activeSessionId?: string;
};

export function ChatComposer({
  input,
  loading,
  onInputChange,
  onSend,
  onStop,
  activeSessionId,
}: ChatComposerProps) {
  const { t } = useTranslation();
  const inputRef = useRef<TextAreaRef>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [activeSessionId]);

  return (
    <div className="px-4 pb-4 pt-2 border-t border-border bg-background/95">
      <ChatSender
        ref={inputRef}
        value={input}
        onChange={onInputChange}
        onSubmit={onSend}
        loading={loading}
        onCancel={onStop}
        placeholder={t('chat.placeholder')}
      />
    </div>
  );
}
