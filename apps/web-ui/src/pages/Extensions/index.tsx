import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Drawer,
  Empty,
  Input,
  Segmented,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ReloadOutlined, EyeOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { apiGet, apiPost } from '../../api/base';
import { TableActions } from '../../components/TableActions';
import type {
  ExtensionDescriptor,
  ExtensionHealthStatus,
  ExtensionListResponse,
  ExtensionSource,
} from '../../types/extensions';

const { Title, Text } = Typography;

const SOURCE_COLOR: Record<ExtensionSource, string> = {
  builtin: 'blue',
  skill: 'purple',
  mcp: 'cyan',
};

const HEALTH_STATUS_BADGE: Record<
  ExtensionHealthStatus,
  'success' | 'warning' | 'error' | 'default'
> = {
  healthy: 'success',
  degraded: 'warning',
  error: 'error',
  unknown: 'default',
};

type SourceFilter = 'all' | ExtensionSource;
type HealthFilter = 'all' | ExtensionHealthStatus;

export function ExtensionsPage() {
  const { t } = useTranslation();
  const [extensions, setExtensions] = useState<ExtensionDescriptor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [healthFilter, setHealthFilter] = useState<HealthFilter>('all');
  const [keyword, setKeyword] = useState('');
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [drawer, setDrawer] = useState<ExtensionDescriptor | null>(null);
  const [messageApi, contextHolder] = message.useMessage();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<ExtensionListResponse>('/api/extensions');
      setExtensions(data.extensions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('extensions.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const setBusy = (id: string, busy: boolean) => {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const replaceLocal = (updated: ExtensionDescriptor) => {
    setExtensions((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    setDrawer((prev) => (prev && prev.id === updated.id ? updated : prev));
  };

  const handleToggleEnabled = async (extension: ExtensionDescriptor, enabled: boolean) => {
    setBusy(extension.id, true);
    try {
      const path = enabled ? 'enable' : 'disable';
      const data = await apiPost<{ extension: ExtensionDescriptor }>(
        `/api/extensions/${encodeURIComponent(extension.id)}/${path}`,
        {}
      );
      replaceLocal(data.extension);
      messageApi.success(
        enabled ? t('extensions.enabledSuccess') : t('extensions.disabledSuccess')
      );
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : t('extensions.toggleFailed'));
    } finally {
      setBusy(extension.id, false);
    }
  };

  const handleReload = async (extension: ExtensionDescriptor) => {
    setBusy(extension.id, true);
    try {
      const data = await apiPost<{ extension: ExtensionDescriptor }>(
        `/api/extensions/${encodeURIComponent(extension.id)}/reload`,
        {}
      );
      replaceLocal(data.extension);
      messageApi.success(t('extensions.reloadSuccess'));
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : t('extensions.reloadFailed'));
    } finally {
      setBusy(extension.id, false);
    }
  };

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return extensions.filter((item) => {
      if (sourceFilter !== 'all' && item.source !== sourceFilter) return false;
      if (healthFilter !== 'all' && item.healthStatus !== healthFilter) return false;
      if (!kw) return true;
      return (
        item.id.toLowerCase().includes(kw) ||
        item.name.toLowerCase().includes(kw) ||
        item.description.toLowerCase().includes(kw)
      );
    });
  }, [extensions, sourceFilter, healthFilter, keyword]);

  const columns: ColumnsType<ExtensionDescriptor> = [
    {
      title: t('extensions.columnName'),
      key: 'name',
      render: (_, record) => (
        <div className="flex flex-col gap-0.5">
          <Text strong>{record.name}</Text>
          <Text type="secondary" className="text-xs">
            {record.id}
          </Text>
          {record.description && (
            <Text type="secondary" className="text-xs">
              {record.description}
            </Text>
          )}
        </div>
      ),
    },
    {
      title: t('extensions.columnSource'),
      key: 'source',
      width: 120,
      render: (_, record) => (
        <Tag color={SOURCE_COLOR[record.source]}>{t(`extensions.source.${record.source}`)}</Tag>
      ),
    },
    {
      title: t('extensions.columnHealth'),
      key: 'health',
      width: 140,
      render: (_, record) => (
        <Tooltip title={record.errorMessage || undefined}>
          <Badge
            status={HEALTH_STATUS_BADGE[record.healthStatus]}
            text={t(`extensions.health.${record.healthStatus}`)}
          />
        </Tooltip>
      ),
    },
    {
      title: t('extensions.columnCapabilities'),
      key: 'capabilities',
      render: (_, record) => {
        const list = record.capabilities ?? [];
        if (list.length === 0) return <Text type="secondary">-</Text>;
        const visible = list.slice(0, 3);
        const rest = list.length - visible.length;
        return (
          <Space size={4} wrap>
            {visible.map((cap) => (
              <Tag key={cap} bordered={false}>
                {cap}
              </Tag>
            ))}
            {rest > 0 && (
              <Tooltip title={list.slice(3).join(', ')}>
                <Tag bordered={false}>+{rest}</Tag>
              </Tooltip>
            )}
          </Space>
        );
      },
    },
    {
      title: t('extensions.columnEnabled'),
      key: 'enabled',
      width: 110,
      render: (_, record) => {
        const isBuiltin = record.source === 'builtin';
        const switchEl = (
          <Switch
            checked={record.enabled}
            disabled={isBuiltin || busyIds.has(record.id)}
            loading={busyIds.has(record.id)}
            onChange={(checked) => void handleToggleEnabled(record, checked)}
          />
        );
        return isBuiltin ? (
          <Tooltip title={t('extensions.builtinNoToggle')}>{switchEl}</Tooltip>
        ) : (
          switchEl
        );
      },
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 140,
      render: (_, record) => (
        <TableActions
          actions={[
            {
              key: 'detail',
              icon: <EyeOutlined />,
              tooltip: t('extensions.viewDetail'),
              onClick: () => setDrawer(record),
            },
            {
              key: 'reload',
              icon: <ReloadOutlined />,
              tooltip: t('extensions.reload'),
              disabled: record.source === 'builtin' || busyIds.has(record.id),
              loading: busyIds.has(record.id),
              onClick: () => void handleReload(record),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <div className="space-y-4 p-6">
      {contextHolder}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Title level={4} className="!mb-1">
            {t('extensions.title')}
          </Title>
          <Text type="secondary">{t('extensions.subtitle')}</Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
          {t('common.refresh')}
        </Button>
      </div>

      {error && <Alert type="error" message={error} showIcon closable />}

      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          value={sourceFilter}
          onChange={(value) => setSourceFilter(value as SourceFilter)}
          options={[
            { label: t('extensions.filter.allSources'), value: 'all' },
            { label: t('extensions.source.builtin'), value: 'builtin' },
            { label: t('extensions.source.skill'), value: 'skill' },
            { label: t('extensions.source.mcp'), value: 'mcp' },
          ]}
        />
        <Segmented
          value={healthFilter}
          onChange={(value) => setHealthFilter(value as HealthFilter)}
          options={[
            { label: t('extensions.filter.allHealth'), value: 'all' },
            { label: t('extensions.health.healthy'), value: 'healthy' },
            { label: t('extensions.health.degraded'), value: 'degraded' },
            { label: t('extensions.health.error'), value: 'error' },
            { label: t('extensions.health.unknown'), value: 'unknown' },
          ]}
        />
        <Input.Search
          placeholder={t('extensions.searchPlaceholder')}
          allowClear
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          style={{ width: 240 }}
        />
        <Text type="secondary" className="ml-auto text-xs">
          {t('extensions.totalSummary', { filtered: filtered.length, total: extensions.length })}
        </Text>
      </div>

      <div className="rounded border border-border bg-background">
        {loading && extensions.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Spin />
          </div>
        ) : (
          <Table<ExtensionDescriptor>
            rowKey="id"
            columns={columns}
            dataSource={filtered}
            pagination={{ pageSize: 20, hideOnSinglePage: true }}
            locale={{ emptyText: <Empty description={t('extensions.empty')} /> }}
            size="middle"
            onRow={(record) => ({
              onClick: (event) => {
                const target = event.target as HTMLElement;
                if (target.closest('button, .ant-switch, .ant-dropdown-trigger, a')) return;
                setDrawer(record);
              },
              style: { cursor: 'pointer' },
            })}
          />
        )}
      </div>

      <Drawer
        title={drawer?.name ?? ''}
        open={!!drawer}
        onClose={() => setDrawer(null)}
        width={520}
      >
        {drawer && <ExtensionDetail extension={drawer} />}
      </Drawer>
    </div>
  );
}

function ExtensionDetail({ extension }: { extension: ExtensionDescriptor }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4 text-sm">
      <DetailRow label={t('extensions.detail.id')} value={<code>{extension.id}</code>} />
      <DetailRow
        label={t('extensions.detail.source')}
        value={
          <Tag color={SOURCE_COLOR[extension.source]}>
            {t(`extensions.source.${extension.source}`)}
          </Tag>
        }
      />
      <DetailRow
        label={t('extensions.detail.health')}
        value={
          <Badge
            status={HEALTH_STATUS_BADGE[extension.healthStatus]}
            text={t(`extensions.health.${extension.healthStatus}`)}
          />
        }
      />
      <DetailRow label={t('extensions.detail.kind')} value={extension.kind} />
      <DetailRow label={t('extensions.detail.description')} value={extension.description || '-'} />
      <DetailRow
        label={t('extensions.detail.entry')}
        value={
          <code className="text-xs">
            {extension.entry.kind} → {extension.entry.path ?? extension.entry.target}
          </code>
        }
      />
      <DetailRow
        label={t('extensions.detail.capabilities')}
        value={
          extension.capabilities.length > 0 ? (
            <Space size={4} wrap>
              {extension.capabilities.map((cap) => (
                <Tag key={cap} bordered={false}>
                  {cap}
                </Tag>
              ))}
            </Space>
          ) : (
            '-'
          )
        }
      />
      <DetailRow
        label={t('extensions.detail.permissionProfile')}
        value={
          extension.permissionProfile.length > 0 ? (
            <Space size={4} wrap>
              {extension.permissionProfile.map((perm) => (
                <Tag key={perm} bordered={false} color="orange">
                  {perm}
                </Tag>
              ))}
            </Space>
          ) : (
            '-'
          )
        }
      />
      {extension.errorMessage && (
        <DetailRow
          label={t('extensions.detail.errorMessage')}
          value={
            <pre className="whitespace-pre-wrap text-xs text-red-600">{extension.errorMessage}</pre>
          }
        />
      )}
      {extension.updatedAt && (
        <DetailRow label={t('extensions.detail.updatedAt')} value={extension.updatedAt} />
      )}
      {extension.metadata && Object.keys(extension.metadata).length > 0 && (
        <DetailRow
          label={t('extensions.detail.metadata')}
          value={
            <pre className="m-0 whitespace-pre-wrap rounded border border-border bg-muted/20 p-2 text-xs">
              {JSON.stringify(extension.metadata, null, 2)}
            </pre>
          }
        />
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div>{value}</div>
    </div>
  );
}
