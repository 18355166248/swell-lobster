import { useEffect, useState } from 'react';
import { Badge, Alert, Spin, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { apiGet } from '../../api/base';

const { Title, Text } = Typography;

type Channel = {
  channel?: string;
  name?: string;
  status?: string;
  session_count?: number;
};

export function IMPage() {
  const { t } = useTranslation();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiGet<{ channels: Channel[] }>('/api/im/channels')
      .then((data) => {
        if (!cancelled) setChannels(data.channels ?? []);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : t('im.loadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
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
        {t('im.title')}
      </Title>
      <Text type="secondary">{t('im.subtitle')}</Text>

      {error && <Alert type="error" title={error} className="mt-3" showIcon />}

      <div className="mt-6 border border-border rounded overflow-hidden">
        {channels.length === 0 ? (
          <div className="px-4 py-8 text-muted-foreground text-sm text-center">
            {t('common.noData')}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {channels.map((ch, i) => (
              <li key={i} className="px-4 py-3 flex items-center justify-between">
                <span className="font-medium text-foreground">{ch.name ?? ch.channel ?? '-'}</span>
                <Badge
                  status={ch.status === 'online' ? 'success' : 'default'}
                  text={ch.status === 'online' ? '在线' : '离线'}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
