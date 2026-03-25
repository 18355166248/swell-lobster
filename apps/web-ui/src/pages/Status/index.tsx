import { useEffect, useState } from 'react';
import { Badge, Alert, Spin, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { apiGet } from '../../api/base';

const { Title, Text } = Typography;

export function StatusPage() {
  const { t } = useTranslation();
  const [health, setHealth] = useState<{ status?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ status?: string }>('/api/health')
      .then(setHealth)
      .catch((e) => setError(e instanceof Error ? e.message : t('status.loadFailed')))
      .finally(() => setLoading(false));
  }, [t]);

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
    </div>
  );
}
