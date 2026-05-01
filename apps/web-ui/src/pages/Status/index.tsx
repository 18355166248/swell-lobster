import { useEffect, useState } from 'react';
import { Badge, Alert, Spin, Typography, Button, message } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { apiGet } from '../../api/base';
import { reportFrontendError } from '../../logging/frontend';
import { isTauri } from '../../utils/platform';

const { Title, Text } = Typography;

async function openLog(): Promise<void> {
  const path = await invoke<string>('get_log_path');
  await invoke('open_file', { path });
}

export function StatusPage() {
  const { t } = useTranslation();
  const [health, setHealth] = useState<{ status?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openingLog, setOpeningLog] = useState(false);

  useEffect(() => {
    apiGet<{ status?: string }>('/api/health')
      .then(setHealth)
      .catch((e) => setError(e instanceof Error ? e.message : t('status.loadFailed')))
      .finally(() => setLoading(false));
  }, [t]);

  const handleViewLog = async () => {
    setOpeningLog(true);
    try {
      await openLog();
    } catch (error) {
      void reportFrontendError({
        message: 'desktop log open failed',
        context: { error: error instanceof Error ? error.message : String(error) },
      }).catch(() => {});
      message.error(t('status.openLogFailed'));
    } finally {
      setOpeningLog(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2">
        <Spin size="small" />
        <Text type="secondary">{t('common.loading')}</Text>
      </div>
    );
  }

  return (
    <div className="p-6">
      <Title level={4} style={{ marginBottom: 4 }}>
        {t('status.title')}
      </Title>
      <Text type="secondary">{t('status.subtitle')}</Text>

      {error && <Alert type="error" title={error} className="mt-3" showIcon />}

      {health && (
        <div className="mt-6 border border-border rounded p-4">
          <Badge
            status={health.status === 'healthy' ? 'success' : 'default'}
            text={`${t('status.serviceStatus')}${health.status ?? 'unknown'}`}
          />
        </div>
      )}

      {isTauri() && (
        <div className="mt-6">
          <Button icon={<FileTextOutlined />} loading={openingLog} onClick={handleViewLog}>
            {t('status.viewLog')}
          </Button>
        </div>
      )}
    </div>
  );
}
