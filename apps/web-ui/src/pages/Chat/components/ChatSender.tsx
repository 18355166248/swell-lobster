import { Input, Button, Space, Tooltip } from 'antd';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import { SendOutlined, StopOutlined, CloseCircleFilled, FileTextOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import React, { type Ref } from 'react';
import { ImageUploadButton, type UploadedAttachment } from './ImageUploadButton';
import { VoiceInputButton } from './VoiceInputButton';
import { FileUploadButton } from './FileUploadButton';

type ChatSenderProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  loading: boolean;
  onCancel: () => void;
  placeholder: string;
  attachments: UploadedAttachment[];
  onAddAttachment: (attachment: UploadedAttachment) => void;
  onRemoveAttachment: (index: number) => void;
};

export const ChatSender = React.forwardRef<TextAreaRef, ChatSenderProps>(
  (
    {
      value,
      onChange,
      onSubmit,
      loading,
      onCancel,
      placeholder,
      attachments,
      onAddAttachment,
      onRemoveAttachment,
    }: ChatSenderProps,
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
        {/* 图片预览区 */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {attachments.map((attachment, idx) => (
              <div
                key={`${attachment.filename}_${idx}`}
                className="relative inline-flex min-w-[4rem] max-w-52 items-center gap-2 rounded border border-solid border-[var(--color-border)] bg-muted px-2 py-1"
              >
                {attachment.kind === 'image' && attachment.previewUrl ? (
                  <img
                    src={attachment.previewUrl}
                    alt={attachment.filename}
                    className="h-16 w-16 rounded object-cover"
                  />
                ) : (
                  <FileTextOutlined className="text-base text-[var(--color-text-secondary)]" />
                )}
                <span className="truncate text-xs text-foreground">{attachment.filename}</span>
                <Tooltip
                  title={attachment.kind === 'image' ? t('chat.removeImage') : t('chat.removeFile')}
                >
                  <CloseCircleFilled
                    className="absolute -top-1.5 -right-1.5 text-base cursor-pointer text-[var(--color-text-secondary)] hover:text-red-500"
                    onClick={() => onRemoveAttachment(idx)}
                  />
                </Tooltip>
              </div>
            ))}
          </div>
        )}

        <Input.TextArea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoSize={{ minRows: 1, maxRows: 5 }}
        />

        <div className="flex justify-between items-center">
          {/* 左侧工具栏 */}
          <Space size={0}>
            <ImageUploadButton onUpload={onAddAttachment} disabled={loading} />
            <FileUploadButton onUpload={onAddAttachment} disabled={loading} />
            <VoiceInputButton
              onResult={(text) => onChange(value ? `${value} ${text}` : text)}
              disabled={loading}
            />
          </Space>

          {/* 右侧操作按钮 */}
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
