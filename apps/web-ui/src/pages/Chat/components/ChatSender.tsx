import { Input, Button, Space, Tooltip } from 'antd';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import { SendOutlined, StopOutlined, CloseCircleFilled } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import React, { type Ref } from 'react';
import { ImageUploadButton, type UploadedImage } from './ImageUploadButton';
import { VoiceInputButton } from './VoiceInputButton';

type ChatSenderProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  loading: boolean;
  onCancel: () => void;
  placeholder: string;
  images: UploadedImage[];
  onAddImage: (image: UploadedImage) => void;
  onRemoveImage: (index: number) => void;
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
      images,
      onAddImage,
      onRemoveImage,
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
        {images.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {images.map((img, idx) => (
              <div key={idx} className="relative inline-block">
                <img
                  src={img.previewUrl}
                  alt={img.filename}
                  className="h-16 w-16 rounded object-cover border border-solid border-[var(--color-border)]"
                />
                <Tooltip title={t('chat.removeImage')}>
                  <CloseCircleFilled
                    className="absolute -top-1.5 -right-1.5 text-base cursor-pointer text-[var(--color-text-secondary)] hover:text-red-500"
                    onClick={() => onRemoveImage(idx)}
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
            <ImageUploadButton onUpload={onAddImage} disabled={loading} />
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
