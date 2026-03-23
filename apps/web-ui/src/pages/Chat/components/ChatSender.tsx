import { Input, Button, Space } from 'antd';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import { SendOutlined, StopOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import React, { type Ref } from 'react';

type ChatSenderProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  loading: boolean;
  onCancel: () => void;
  placeholder: string;
};

export const ChatSender = React.forwardRef<TextAreaRef, ChatSenderProps>(
  (
    { value, onChange, onSubmit, loading, onCancel, placeholder }: ChatSenderProps,
    ref: Ref<TextAreaRef>
  ) => {
    const { t } = useTranslation();

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSubmit();
      }
    };

    return (
      <div className="flex flex-col gap-2">
        <Input.TextArea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoSize={{ minRows: 1, maxRows: 5 }}
        />
        <div className="flex justify-end">
          <Space>
            {loading && (
              <Button icon={<StopOutlined />} onClick={onCancel}>
                {t('chat.stopGenerating')}
              </Button>
            )}
            <Button type="primary" icon={<SendOutlined />} onClick={onSubmit} loading={loading}>
              {t('chat.send')}
            </Button>
          </Space>
        </div>
      </div>
    );
  }
);
