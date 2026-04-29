import { useCallback, useEffect, useState } from 'react';
import { Button, Alert, Spin, Typography, Input, Form, Divider, message } from 'antd';
import { useTranslation } from 'react-i18next';
import { apiGet, apiPost } from '../../../api/base';

const { Title, Text } = Typography;

type EnvData = { env: Record<string, string> };

type SearchConfig = {
  embeddingBaseUrl: string;
  embeddingModel: string;
  embeddingApiKeyEnv: string;
  braveApiKeyEnv: string;
  tavilyApiKeyEnv: string;
};

export function ConfigAdvancedPage() {
  const { t } = useTranslation();
  const [disabledViews, setDisabledViews] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchConfig, setSearchConfig] = useState<SearchConfig>({
    embeddingBaseUrl: '',
    embeddingModel: 'text-embedding-3-small',
    embeddingApiKeyEnv: 'OPENAI_API_KEY',
    braveApiKeyEnv: 'BRAVE_SEARCH_API_KEY',
    tavilyApiKeyEnv: 'TAVILY_API_KEY',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [viewsData, envData] = await Promise.all([
        apiGet<{ disabled_views: string[] }>('/api/config/disabled-views'),
        apiGet<EnvData>('/api/config/env'),
      ]);
      setDisabledViews(viewsData.disabled_views ?? []);
      const env = envData.env ?? {};
      setSearchConfig({
        embeddingBaseUrl: env.SWELL_EMBEDDING_BASE_URL ?? '',
        embeddingModel: env.SWELL_EMBEDDING_MODEL ?? 'text-embedding-3-small',
        embeddingApiKeyEnv: env.SWELL_EMBEDDING_API_KEY_ENV ?? 'OPENAI_API_KEY',
        braveApiKeyEnv: env.SWELL_BRAVE_SEARCH_API_KEY_ENV ?? 'BRAVE_SEARCH_API_KEY',
        tavilyApiKeyEnv: env.SWELL_TAVILY_API_KEY_ENV ?? 'TAVILY_API_KEY',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('configAdvanced.loadFailed'));
      setDisabledViews([]);
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
      await apiPost('/api/config/disabled-views', { views: disabledViews });
      await apiPost('/api/config/env', {
        entries: {
          SWELL_EMBEDDING_BASE_URL: searchConfig.embeddingBaseUrl,
          SWELL_EMBEDDING_MODEL: searchConfig.embeddingModel,
          SWELL_EMBEDDING_API_KEY_ENV: searchConfig.embeddingApiKeyEnv,
          SWELL_BRAVE_SEARCH_API_KEY_ENV: searchConfig.braveApiKeyEnv,
          SWELL_TAVILY_API_KEY_ENV: searchConfig.tavilyApiKeyEnv,
        },
      });
      void message.success(t('configAdvanced.saveSuccess'));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('configAdvanced.saveFailed'));
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
    <div className="p-6 max-w-2xl">
      <Title level={4} style={{ marginBottom: 4 }}>
        {t('configAdvanced.title')}
      </Title>
      <Text type="secondary">{t('configAdvanced.subtitle')}</Text>

      {error && <Alert type="error" message={error} className="mt-3" showIcon />}

      <div className="mt-6">
        <Title level={5}>隐藏模块</Title>
        <Text type="secondary" className="block mb-2">
          在此配置的模块将不在侧栏显示（如 skills、im、token_stats 等）
        </Text>
        <Text className="text-sm">
          当前已隐藏：{disabledViews.length ? disabledViews.join(', ') : '无'}
        </Text>
      </div>

      <Divider />

      <div>
        <Title level={5}>{t('configAdvanced.embeddingTitle')}</Title>
        <Text type="secondary" className="block mb-4">
          {t('configAdvanced.embeddingSubtitle')}
        </Text>
        <Form layout="vertical" size="small">
          <Form.Item label={t('configAdvanced.embeddingBaseUrl')}>
            <Input
              value={searchConfig.embeddingBaseUrl}
              placeholder={t('configAdvanced.embeddingBaseUrlPlaceholder')}
              onChange={(e) =>
                setSearchConfig((prev) => ({ ...prev, embeddingBaseUrl: e.target.value }))
              }
            />
          </Form.Item>
          <Form.Item label={t('configAdvanced.embeddingModel')}>
            <Input
              value={searchConfig.embeddingModel}
              placeholder={t('configAdvanced.embeddingModelPlaceholder')}
              onChange={(e) =>
                setSearchConfig((prev) => ({ ...prev, embeddingModel: e.target.value }))
              }
            />
          </Form.Item>
          <Form.Item label={t('configAdvanced.embeddingApiKeyEnv')}>
            <Input
              value={searchConfig.embeddingApiKeyEnv}
              placeholder={t('configAdvanced.embeddingApiKeyEnvPlaceholder')}
              onChange={(e) =>
                setSearchConfig((prev) => ({ ...prev, embeddingApiKeyEnv: e.target.value }))
              }
            />
          </Form.Item>
        </Form>
      </div>

      <Divider />

      <div>
        <Title level={5}>{t('configAdvanced.searchTitle')}</Title>
        <Text type="secondary" className="block mb-4">
          {t('configAdvanced.searchSubtitle')}
        </Text>
        <Form layout="vertical" size="small">
          <Form.Item label={t('configAdvanced.braveApiKeyEnv')}>
            <Input
              value={searchConfig.braveApiKeyEnv}
              placeholder="BRAVE_SEARCH_API_KEY"
              onChange={(e) =>
                setSearchConfig((prev) => ({ ...prev, braveApiKeyEnv: e.target.value }))
              }
            />
          </Form.Item>
          <Form.Item label={t('configAdvanced.tavilyApiKeyEnv')}>
            <Input
              value={searchConfig.tavilyApiKeyEnv}
              placeholder="TAVILY_API_KEY"
              onChange={(e) =>
                setSearchConfig((prev) => ({ ...prev, tavilyApiKeyEnv: e.target.value }))
              }
            />
          </Form.Item>
        </Form>
      </div>

      <div className="mt-4">
        <Button type="primary" onClick={handleSave} loading={saving}>
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
}
