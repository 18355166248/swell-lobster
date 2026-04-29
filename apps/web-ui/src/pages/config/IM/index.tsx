import { useCallback, useEffect, useState } from 'react';
import { Button, Alert, Spin, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { apiGet, apiPost } from '../../../api/base';

const { Title, Text } = Typography;

type EnvMap = Record<string, string>;

export function ConfigIMPage() {
  const { t } = useTranslation();
  const [env, setEnv] = useState<EnvMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ env: EnvMap }>('/api/config/env');
      setEnv(data.env ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : t('configIM.loadFailed'));
      setEnv({});
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiPost('/api/config/env', { entries: env });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('configIM.saveFailed'));
    } finally {
      setSaving(false);
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
        {t('configIM.title')}
      </Title>
      <Text type="secondary">{t('configIM.subtitle')}</Text>

      {error && <Alert type="error" title={error} className="mt-3" showIcon />}

      <div className="mt-6 border border-border rounded overflow-hidden">
        <div className="px-4 py-3 bg-muted text-sm text-muted-foreground">
          {t('configIM.envHint')}
        </div>
        {Object.keys(env).length === 0 ? (
          <div className="px-4 py-6 text-muted-foreground text-sm text-center">
            {t('configIM.noEnv')}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {Object.entries(env).map(([k, v]) => (
              <li key={k} className="px-4 py-2 flex justify-between text-sm">
                <span className="font-mono text-foreground">{k}</span>
                <span className="text-muted-foreground truncate max-w-[60%]">{v}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-6">
        <Button type="primary" onClick={handleSave} loading={saving}>
          {t('configIM.saveConfig')}
        </Button>
      </div>
    </div>
  );
}
