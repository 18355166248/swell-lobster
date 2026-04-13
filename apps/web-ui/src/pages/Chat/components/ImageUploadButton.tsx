import { useRef } from 'react';
import { Button, Tooltip, message } from 'antd';
import { PictureOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { uploadImage } from '../api';

export type UploadedImage = {
  filename: string;
  mimeType: string;
  base64: string;
  size: number;
  previewUrl: string;
};

type ImageUploadButtonProps = {
  onUpload: (image: UploadedImage) => void;
  disabled?: boolean;
};

export function ImageUploadButton({ onUpload, disabled }: ImageUploadButtonProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // 前端先做大小校验，快速失败
    if (file.size > 10 * 1024 * 1024) {
      message.error(t('chat.imageTooLarge'));
      e.target.value = '';
      return;
    }
    try {
      const result = await uploadImage(file);
      onUpload(result);
    } catch (err) {
      message.error(
        `${t('chat.uploadFailed')}：${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      e.target.value = '';
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="hidden"
        onChange={handleChange}
      />
      <Tooltip title={t('chat.uploadImage')}>
        <Button
          type="text"
          icon={<PictureOutlined />}
          onClick={handleClick}
          disabled={disabled}
          size="small"
        />
      </Tooltip>
    </>
  );
}
