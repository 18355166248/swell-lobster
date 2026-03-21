import { Button } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

type ChatComposerProps = {
  input: string;
  loading: boolean;
  onInputChange: (value: string) => void;
  onSend: () => void;
};

export function ChatComposer({ input, loading, onInputChange, onSend }: ChatComposerProps) {
  const { t } = useTranslation();

  return (
    <div className="px-6 py-4 border-t border-border bg-background/95">
      <div className="flex gap-2 items-end">
        <textarea
          rows={1}
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder={t('chat.placeholder')}
          className="flex-1 px-3 py-2 bg-muted border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={onSend}
          disabled={loading || !input.trim()}
          className="flex-shrink-0 h-9 w-9 flex items-center justify-center"
        />
      </div>
    </div>
  );
}
