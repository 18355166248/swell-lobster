import { useEffect, useState } from 'react';
import { App as AntApp, Badge, Button, Space, Select, Tooltip } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAtomValue, useSetAtom } from 'jotai';
import { invoke } from '@tauri-apps/api/core';
import { apiGet } from '../api/base';
import { ThemeToggle } from './ThemeToggle';
import { WindowControls } from './WindowControls';
import { localeAtom, applyLocale, type Locale } from '../store/locale';
import { endpointsAtom, endpointsLoadedAtom, refreshEndpointsAtom } from '../store/endpoints';
import { isTauri } from '../utils/platform';

type HealthStatus = 'unknown' | 'healthy' | 'error';

const statusBadgeMap: Record<HealthStatus, 'processing' | 'success' | 'error'> = {
  healthy: 'success',
  error: 'error',
  unknown: 'processing',
};

const isDevBuild = Boolean(
  typeof import.meta !== 'undefined' && (import.meta as { env?: Record<string, unknown> }).env?.DEV
);

export function Topbar() {
  const { t } = useTranslation();
  const { message } = AntApp.useApp();
  const [status, setStatus] = useState<HealthStatus>('unknown');
  const endpoints = useAtomValue(endpointsAtom);
  const endpointsLoaded = useAtomValue(endpointsLoadedAtom);
  const refreshEndpoints = useSetAtom(refreshEndpointsAtom);
  const [restarting, setRestarting] = useState(false);
  const locale = useAtomValue(localeAtom);
  const setLocale = useSetAtom(localeAtom);

  const endpointCount = endpoints.length;

  const loadHealth = async () => {
    try {
      const health = await apiGet<{ status?: string }>('/api/health');
      setStatus(health.status === 'healthy' ? 'healthy' : 'unknown');
    } catch {
      setStatus('error');
    }
  };

  useEffect(() => {
    queueMicrotask(() => {
      void loadHealth();
    });
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

  const handleRestart = async () => {
    if (!isTauri() || restarting) return;
    setRestarting(true);
    try {
      if (isDevBuild) {
        window.location.reload();
        return;
      }
      await invoke('restart_backend');
      await Promise.all([loadHealth(), refreshEndpoints().catch(() => {})]);
      void message.success(t('topbar.restartSucceeded'));
      setRestarting(false);
    } catch (error) {
      setRestarting(false);
      void message.error(error instanceof Error ? error.message : t('topbar.restartFailed'));
    }
  };

  return (
    <header
      className="flex items-center justify-between px-4 h-11 border-b border-border bg-background/95 backdrop-blur flex-shrink-0"
      {...(isTauri() ? { 'data-tauri-drag-region': true } : {})}
    >
      <Space size={8}>
        <span className="text-sm text-muted-foreground">{t('topbar.default')}</span>
        <Badge status={statusBadgeMap[status]} text={statusLabel} />
        {endpointsLoaded && (
          <span className="text-xs text-muted-foreground/70">
            {t('topbar.endpoints', { count: endpointCount })}
          </span>
        )}
      </Space>

      <Space size={6}>
        <div className="flex items-center gap-1" data-tauri-drag-region="false">
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
          {isTauri() && (
            <Tooltip title={t(isDevBuild ? 'topbar.reloadWindow' : 'topbar.restart')}>
              <Button
                type="text"
                size="small"
                icon={<ReloadOutlined spin={restarting} />}
                onClick={() => void handleRestart()}
                disabled={restarting}
              >
                {t('common.restart')}
              </Button>
            </Tooltip>
          )}
        </div>
      </Space>

      <WindowControls />
    </header>
  );
}
