import { useEffect, useState } from 'react';
import { Badge, Button, Space, Select, Tooltip } from 'antd';
import { ReloadOutlined, LinkOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAtomValue, useSetAtom } from 'jotai';
import { getApiBase, apiGet } from '../api/base';
import { ThemeToggle } from './ThemeToggle';
import { WindowControls } from './WindowControls';
import { localeAtom, applyLocale, type Locale } from '../store/locale';
import { isTauri } from '../utils/platform';

type HealthStatus = 'unknown' | 'healthy' | 'error';

const statusBadgeMap: Record<HealthStatus, 'processing' | 'success' | 'error'> = {
  healthy: 'success',
  error: 'error',
  unknown: 'processing',
};

export function Topbar() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<HealthStatus>('unknown');
  const [endpointCount, setEndpointCount] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const locale = useAtomValue(localeAtom);
  const setLocale = useSetAtom(localeAtom);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const health = await apiGet<{ status?: string }>('/api/health');
      setStatus(health.status === 'healthy' ? 'healthy' : 'unknown');
    } catch {
      setStatus('error');
    }
    try {
      const data = await apiGet<{ endpoints?: unknown[] }>('/api/config/endpoints');
      setEndpointCount(Array.isArray(data.endpoints) ? data.endpoints.length : 0);
    } catch {
      setEndpointCount(null);
    }
    setRefreshing(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const statusLabel = {
    healthy: t('topbar.running'),
    error: t('topbar.disconnected'),
    unknown: t('topbar.checking'),
  }[status];

  const handleLocaleChange = (val: Locale) => {
    setLocale(val);
    applyLocale(val);
  };

  return (
    <header
      className="flex items-center justify-between px-4 h-11 border-b border-border bg-background/95 backdrop-blur flex-shrink-0"
      {...(isTauri() ? { 'data-tauri-drag-region': true } : {})}
    >
      <Space size={8}>
        <span className="text-sm text-muted-foreground">{t('topbar.default')}</span>
        <Badge status={statusBadgeMap[status]} text={statusLabel} />
        {endpointCount !== null && (
          <span className="text-xs text-muted-foreground/70">
            {t('topbar.endpoints', { count: endpointCount })}
          </span>
        )}
      </Space>

      <Space size={6}>
        <ThemeToggle />
        <Select
          size="small"
          value={locale}
          onChange={handleLocaleChange}
          style={{ width: 88 }}
          options={[
            { value: 'zh', label: '中文' },
            { value: 'en', label: 'English' },
          ]}
        />
        <Tooltip title={t('common.refresh')}>
          <Button
            type="text"
            size="small"
            icon={<ReloadOutlined spin={refreshing} />}
            onClick={refresh}
            disabled={refreshing}
          />
        </Tooltip>
        <Tooltip title={getApiBase()}>
          <Button
            type="text"
            size="small"
            icon={<LinkOutlined />}
            href={getApiBase()}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('common.api')}
          </Button>
        </Tooltip>
      </Space>

      <WindowControls />
    </header>
  );
}
