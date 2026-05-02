import { useEffect, useState } from 'react';
import { Badge, Alert, Spin, Typography, Button, Space, message, Descriptions } from 'antd';
import { FileTextOutlined, ReloadOutlined } from '@ant-design/icons';
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
  const [health, setHealth] = useState<{
    status?: string;
    runtime_mode?: string;
    env_path?: string;
    project_root?: string;
    pid?: number;
    exec_path?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openingLog, setOpeningLog] = useState(false);
  const [restarting, setRestarting] = useState(false);

  const loadHealth = () => {
    setLoading(true);
    setError(null);
    apiGet<{
      status?: string;
      runtime_mode?: string;
      env_path?: string;
      project_root?: string;
      pid?: number;
      exec_path?: string;
    }>('/api/health')
      .then(setHealth)
      .catch((e) => setError(e instanceof Error ? e.message : t('status.loadFailed')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadHealth();
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

  const handleRestartBackend = async () => {
    if (!isTauri() || restarting) return;
    setRestarting(true);
    try {
      await invoke('restart_backend');
      loadHealth();
      message.success(t('status.restartBackendSucceeded'));
    } catch (error) {
      void reportFrontendError({
        message: 'desktop backend restart failed',
        context: { error: error instanceof Error ? error.message : String(error) },
      }).catch(() => {});
      message.error(error instanceof Error ? error.message : t('status.restartBackendFailed'));
    } finally {
      setRestarting(false);
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
          <Descriptions column={1} size="small" className="mt-4">
            <Descriptions.Item label={t('status.runtimeMode')}>
              <Text code copyable={Boolean(health.runtime_mode)}>
                {health.runtime_mode ?? '-'}
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label={t('status.envPath')}>
              <Text code copyable={Boolean(health.env_path)}>
                {health.env_path ?? '-'}
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label={t('status.projectRoot')}>
              <Text code copyable={Boolean(health.project_root)}>
                {health.project_root ?? '-'}
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label={t('status.processId')}>
              <Text code copyable={Boolean(health.pid)}>
                {health.pid ?? '-'}
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label={t('status.execPath')}>
              <Text code copyable={Boolean(health.exec_path)}>
                {health.exec_path ?? '-'}
              </Text>
            </Descriptions.Item>
          </Descriptions>
        </div>
      )}

      {isTauri() && (
        <div className="mt-6">
          <Space>
            <Button
              icon={<ReloadOutlined spin={restarting} />}
              loading={restarting}
              onClick={handleRestartBackend}
            >
              {t('status.restartBackend')}
            </Button>
            <Button icon={<FileTextOutlined />} loading={openingLog} onClick={handleViewLog}>
              {t('status.viewLog')}
            </Button>
          </Space>
        </div>
      )}
    </div>
  );
}
