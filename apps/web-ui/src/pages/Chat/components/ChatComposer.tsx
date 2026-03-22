import { Sender } from '@ant-design/x';
import { useTranslation } from 'react-i18next';

type ChatComposerProps = {
  input: string;
  loading: boolean;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
};

export function ChatComposer({ input, loading, onInputChange, onSend, onStop }: ChatComposerProps) {
  const { t } = useTranslation();

  return (
    <div className="px-4 pb-4 pt-2 border-t border-border bg-background/95">
      <Sender
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
