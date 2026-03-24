import { useState } from 'react';
import { Button, Tooltip } from 'antd';
import { CopyOutlined, RedoOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

interface Props {
  content: string;
  role: 'user' | 'assistant';
  onRetry?: () => void;
  /** 操作条水平对齐（助手全宽时建议 end，与豆包式布局一致） */
  align?: 'start' | 'end';
}

export function MessageActions({ content, role, onRetry, align = 'start' }: Props) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className={`flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity mt-1.5 ${
        align === 'end' ? 'justify-end w-full' : ''
      }`}
    >
      <Tooltip title={copied ? t('chat.messageCopied') : t('chat.copyMessage')}>
        <Button size="small" type="text" icon={<CopyOutlined />} onClick={handleCopy} />
      </Tooltip>
      {role === 'assistant' && onRetry && (
        <Tooltip title={t('chat.retryMessage')}>
          <Button size="small" type="text" icon={<RedoOutlined />} onClick={onRetry} />
        </Tooltip>
      )}
    </div>
  );
}
