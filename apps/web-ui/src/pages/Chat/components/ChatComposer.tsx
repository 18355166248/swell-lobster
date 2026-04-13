import { useEffect, useRef } from 'react';
import { ChatSender } from './ChatSender';
import { useTranslation } from 'react-i18next';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import type { UploadedImage } from './ImageUploadButton';

type ChatComposerProps = {
  input: string;
  loading: boolean;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  activeSessionId?: string;
  streaming?: boolean;
  images: UploadedImage[];
  onAddImage: (image: UploadedImage) => void;
  onRemoveImage: (index: number) => void;
};

export function ChatComposer({
  input,
  loading,
  onInputChange,
  onSend,
  onStop,
  activeSessionId,
  streaming,
  images,
  onAddImage,
  onRemoveImage,
}: ChatComposerProps) {
  const { t } = useTranslation();
  const inputRef = useRef<TextAreaRef>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [activeSessionId]);

  return (
    <div className={`px-4 pb-4 pt-2 bg-background/95 ${streaming ? '' : 'border-t border-border'}`}>
      {streaming && <div className="streaming-bar" />}
      <ChatSender
        ref={inputRef}
        value={input}
        onChange={onInputChange}
        onSubmit={onSend}
        loading={loading}
        onCancel={onStop}
        placeholder={t('chat.placeholder')}
        images={images}
        onAddImage={onAddImage}
        onRemoveImage={onRemoveImage}
      />
    </div>
  );
}
