import { useRef } from 'react';
import { Button, Tooltip, message } from 'antd';
import { FileAddOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { uploadAttachment } from '../api';
import type { UploadedAttachment } from './ImageUploadButton';

type FileUploadButtonProps = {
  onUpload: (file: UploadedAttachment) => void;
  disabled?: boolean;
};

export function FileUploadButton({ onUpload, disabled }: FileUploadButtonProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      message.error(t('chat.fileTooLarge'));
      e.target.value = '';
      return;
    }
    try {
      const result = await uploadAttachment(file);
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
        accept=".pdf,.txt,.md,text/plain,text/markdown,application/pdf"
        className="hidden"
        onChange={handleChange}
      />
      <Tooltip title={t('chat.uploadFile')}>
        <Button
          type="text"
          icon={<FileAddOutlined />}
          onClick={handleClick}
          disabled={disabled}
          size="small"
        />
      </Tooltip>
    </>
  );
}
