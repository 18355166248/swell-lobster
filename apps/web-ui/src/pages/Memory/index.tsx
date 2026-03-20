import { useEffect, useState } from 'react';
import { Alert, Spin, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { apiGet } from '../../api/base';

const { Title, Text } = Typography;

export function MemoryPage() {
  const { t } = useTranslation();
  const [memories, setMemories] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ memories: unknown[] }>('/api/memories')
      .then((data) => setMemories(data.memories ?? []))
      .catch((e) => setError(e instanceof Error ? e.message : t('memory.loadFailed')))
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
        {t('memory.title')}
      </Title>
      <Text type="secondary">{t('memory.subtitle')}</Text>

      {error && <Alert type="error" message={error} className="mt-3" showIcon />}

      <div className="mt-6 border border-border rounded overflow-hidden">
        {memories.length === 0 ? (
          <div className="px-4 py-8 text-muted-foreground text-sm text-center">
            {t('common.noData')}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {memories.map((_, i) => (
              <li key={i} className="px-4 py-3 text-foreground text-sm" />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
