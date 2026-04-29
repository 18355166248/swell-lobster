import { useCallback, useEffect, useState } from 'react';
import { Button, Alert, Spin, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { apiGet, apiPost } from '../../../api/base';

const { Title, Text } = Typography;

export function ConfigToolsPage() {
  const { t } = useTranslation();
  const [skills, setSkills] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ skills: Record<string, unknown> }>('/api/config/skills');
      setSkills(data.skills ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : t('configTools.loadFailed'));
      setSkills({});
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
      await apiPost('/api/config/skills', { content: skills });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('configTools.loadFailed'));
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
        {t('configTools.title')}
      </Title>
      <Text type="secondary">{t('configTools.subtitle')}</Text>

      {error && <Alert type="error" title={error} className="mt-3" showIcon />}

      <div className="mt-6 border border-border rounded overflow-hidden">
        <div className="px-4 py-3 bg-muted text-sm text-muted-foreground">
          技能配置（data/skills.json）。与主菜单「技能」共享数据源。
        </div>
        {Object.keys(skills).length === 0 ? (
          <div className="px-4 py-6 text-muted-foreground text-sm text-center">
            {t('common.noData')}
          </div>
        ) : (
          <pre className="p-4 text-xs overflow-auto max-h-64 bg-muted text-foreground">
            {JSON.stringify(skills, null, 2)}
          </pre>
        )}
      </div>
      <div className="mt-6">
        <Button type="primary" onClick={handleSave} loading={saving}>
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
}
