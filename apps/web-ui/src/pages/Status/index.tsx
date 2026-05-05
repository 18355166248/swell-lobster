import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Alert,
  Spin,
  Typography,
  Button,
  Space,
  message,
  Descriptions,
  Table,
  Tag,
} from 'antd';
import { FileTextOutlined, ReloadOutlined, DeleteOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { apiGet, apiPost } from '../../api/base';
import { reportFrontendError } from '../../logging/frontend';
import { isTauri } from '../../utils/platform';

const { Title, Text } = Typography;
const isDevBuild = Boolean(
  typeof import.meta !== 'undefined' && (import.meta as { env?: Record<string, unknown> }).env?.DEV
);

async function openLog(): Promise<void> {
  const path = await invoke<string>('get_log_path');
  await invoke('open_file', { path });
}

interface AuditRecord {
  id: string;
  tool_name: string;
  risk_level: string;
  decision: string;
  status: string;
  duration_ms: number;
  output_summary: string;
  created_at: string;
}

export function StatusPage() {
  const { t } = useTranslation();
  const [health, setHealth] = useState<{
    status?: string;
    runtime_mode?: string;
    env_path?: string;
    project_root?: string;
    data_dir?: string;
    pid?: number;
    exec_path?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openingLog, setOpeningLog] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [auditRecords, setAuditRecords] = useState<AuditRecord[]>([]);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [cacheInfo, setCacheInfo] = useState<{
    tmp: { count: number; bytes: number };
    outputs: { count: number; bytes: number };
  } | null>(null);
  const [clearingTmp, setClearingTmp] = useState(false);
  const [clearingOutputs, setClearingOutputs] = useState(false);

  const loadHealth = useCallback(() => {
    setLoading(true);
    setError(null);
    apiGet<{
      status?: string;
      runtime_mode?: string;
      env_path?: string;
      project_root?: string;
      data_dir?: string;
      pid?: number;
      exec_path?: string;
    }>('/api/health')
      .then(setHealth)
      .catch((e) => setError(e instanceof Error ? e.message : t('status.loadFailed')))
      .finally(() => setLoading(false));
  }, [t]);

  const loadAudit = useCallback(() => {
    setAuditError(null);
    apiGet<{ records: AuditRecord[] }>('/api/approvals/audit?limit=20')
      .then((data) => setAuditRecords(data.records))
      .catch((e) => setAuditError(e instanceof Error ? e.message : t('status.auditLoadFailed')));
  }, [t]);

  const loadCacheInfo = useCallback(() => {
    apiGet<{ tmp: { count: number; bytes: number }; outputs: { count: number; bytes: number } }>(
      '/api/cache/info'
    )
      .then(setCacheInfo)
      .catch(() => {});
  }, []);

  const handleClearCache = async (target: 'tmp' | 'outputs') => {
    const setSaving = target === 'tmp' ? setClearingTmp : setClearingOutputs;
    setSaving(true);
    try {
      await apiPost('/api/cache/clear', { targets: [target] });
      message.success(t('status.cacheClearSuccess'));
      loadCacheInfo();
    } catch {
      message.error(t('status.cacheClearFailed'));
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    loadHealth();
    loadAudit();
    loadCacheInfo();
  }, [loadAudit, loadCacheInfo, loadHealth]);

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
    if (isDevBuild) {
      message.info(t('status.restartBackendDevHint'));
      return;
    }
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
            <Descriptions.Item label={t('status.dataDir')}>
              <Text code copyable={Boolean(health.data_dir)}>
                {health.data_dir ?? '-'}
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
              disabled={isDevBuild}
            >
              {t('status.restartBackend')}
            </Button>
            <Button icon={<FileTextOutlined />} loading={openingLog} onClick={handleViewLog}>
              {t('status.viewLog')}
            </Button>
          </Space>
        </div>
      )}

      <div className="mt-8">
        <Title level={5} style={{ margin: 0, marginBottom: 12 }}>
          {t('status.cacheTitle')}
        </Title>
        <Descriptions column={1} size="small">
          <Descriptions.Item label={t('status.cacheTmp')}>
            <Space>
              <Text type="secondary">
                {cacheInfo ? `${cacheInfo.tmp.count} ${t('status.cacheFiles')}` : '-'}
              </Text>
              <Button
                size="small"
                icon={<DeleteOutlined />}
                loading={clearingTmp}
                onClick={() => handleClearCache('tmp')}
              >
                {t('status.cacheClearTmp')}
              </Button>
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label={t('status.cacheOutputs')}>
            <Space>
              <Text type="secondary">
                {cacheInfo ? `${cacheInfo.outputs.count} ${t('status.cacheFiles')}` : '-'}
              </Text>
              <Button
                size="small"
                icon={<DeleteOutlined />}
                loading={clearingOutputs}
                onClick={() => handleClearCache('outputs')}
              >
                {t('status.cacheClearOutputs')}
              </Button>
            </Space>
          </Descriptions.Item>
        </Descriptions>
      </div>

      <div className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <Title level={5} style={{ margin: 0 }}>
            {t('status.auditTitle')}
          </Title>
          <Button size="small" icon={<ReloadOutlined />} onClick={loadAudit}>
            {t('common.refresh')}
          </Button>
        </div>
        {auditError && <Alert type="error" message={auditError} className="mb-3" showIcon />}
        <Table<AuditRecord>
          dataSource={auditRecords}
          rowKey="id"
          size="small"
          pagination={false}
          locale={{ emptyText: t('status.auditEmpty') }}
          columns={[
            {
              title: t('status.auditTool'),
              dataIndex: 'tool_name',
              key: 'tool_name',
              render: (v: string) => <Text code>{v}</Text>,
            },
            {
              title: t('status.auditRisk'),
              dataIndex: 'risk_level',
              key: 'risk_level',
              render: (v: string) => {
                const colorMap: Record<string, string> = {
                  readonly: 'default',
                  write: 'blue',
                  execute: 'orange',
                  network: 'purple',
                };
                return <Tag color={colorMap[v] ?? 'default'}>{v}</Tag>;
              },
            },
            {
              title: t('status.auditDecision'),
              dataIndex: 'decision',
              key: 'decision',
              render: (v: string) => {
                const labelMap: Record<string, string> = {
                  skipped: t('status.auditDecisionSkipped'),
                  approved: t('status.auditDecisionApproved'),
                  denied: t('status.auditDecisionDenied'),
                  expired: t('status.auditDecisionExpired'),
                };
                const colorMap: Record<string, string> = {
                  skipped: 'default',
                  approved: 'success',
                  denied: 'error',
                  expired: 'warning',
                };
                return <Tag color={colorMap[v] ?? 'default'}>{labelMap[v] ?? v}</Tag>;
              },
            },
            {
              title: t('status.auditStatus'),
              dataIndex: 'status',
              key: 'status',
              render: (v: string) => (
                <Badge
                  status={v === 'success' ? 'success' : 'error'}
                  text={
                    v === 'success' ? t('status.auditStatusSuccess') : t('status.auditStatusFailed')
                  }
                />
              ),
            },
            {
              title: t('status.auditDuration'),
              dataIndex: 'duration_ms',
              key: 'duration_ms',
              render: (v: number) => `${v}ms`,
            },
            {
              title: t('status.auditTime'),
              dataIndex: 'created_at',
              key: 'created_at',
              render: (v: string) => new Date(v).toLocaleString(),
            },
            {
              title: t('status.auditOutput'),
              dataIndex: 'output_summary',
              key: 'output_summary',
              ellipsis: true,
              render: (v: string) => <Text type="secondary">{v}</Text>,
            },
          ]}
        />
      </div>
    </div>
  );
}
