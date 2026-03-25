import { useEffect, useState } from 'react';
import { Alert, Spin, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { apiGet } from '../../api/base';

const { Title, Text } = Typography;

export function SkillsPage() {
  const { t } = useTranslation();
  const [skills, setSkills] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ skills: unknown[] }>('/api/skills')
      .then((data) => setSkills(data.skills ?? []))
      .catch((e) => setError(e instanceof Error ? e.message : t('skills.loadFailed')))
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
        {t('skills.title')}
      </Title>
      <Text type="secondary">{t('skills.subtitle')}</Text>

      {error && <Alert type="error" title={error} className="mt-3" showIcon />}

      <div className="mt-6 border border-border rounded overflow-hidden">
        {skills.length === 0 ? (
          <div className="px-4 py-8 text-muted-foreground text-sm text-center">
            {t('skills.empty')}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {skills.map((s, i) => (
              <li key={i} className="px-4 py-3 text-foreground text-sm">
                {typeof s === 'object' && s && 'name' in s
                  ? String((s as { name: string }).name)
                  : String(s)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
