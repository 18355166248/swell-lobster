import { useEffect, useState } from 'react';
import { Alert, Spin, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { apiGet } from '../../api/base';

const { Title, Text } = Typography;

export function MCPPage() {
  const { t } = useTranslation();
  const [servers, setServers] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ servers: unknown[] }>('/api/mcp/servers')
      .then((data) => setServers(data.servers ?? []))
      .catch((e) => setError(e instanceof Error ? e.message : t('mcp.loadFailed')))
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
        {t('mcp.title')}
      </Title>
      <Text type="secondary">{t('mcp.subtitle')}</Text>

      {error && <Alert type="error" title={error} className="mt-3" showIcon />}

      <div className="mt-6 border border-border rounded overflow-hidden">
        {servers.length === 0 ? (
          <div className="px-4 py-8 text-muted-foreground text-sm text-center">
            {t('common.noData')}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {servers.map((_, i) => (
              <li key={i} className="px-4 py-3 text-foreground text-sm" />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
