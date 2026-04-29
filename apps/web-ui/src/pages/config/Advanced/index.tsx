import { useCallback, useEffect, useState } from 'react';
import { Button, Alert, Spin, Typography, Input, Form, Divider, Checkbox, message } from 'antd';
import { useTranslation } from 'react-i18next';
import { apiGet, apiPost } from '../../../api/base';
import { ROUTES } from '../../../routes';

const { Title, Text } = Typography;

type EnvData = { env: Record<string, string> };

type EmbeddingConfig = {
  embeddingBaseUrl: string;
  embeddingModel: string;
  embeddingApiKeyEnv: string;
};

type SearchKeys = {
  braveApiKey: string;
  tavilyApiKey: string;
};

const HIDEABLE_VIEWS = [
  { key: ROUTES.IM, labelKey: 'sidebar.im' },
  { key: ROUTES.SKILLS, labelKey: 'sidebar.skills' },
  { key: ROUTES.MCP, labelKey: 'sidebar.mcp' },
  { key: ROUTES.SCHEDULER, labelKey: 'sidebar.scheduler' },
  { key: ROUTES.MEMORY, labelKey: 'sidebar.memory' },
  { key: ROUTES.JOURNAL, labelKey: 'journal.title' },
  { key: ROUTES.STATUS, labelKey: 'sidebar.status' },
  { key: ROUTES.TOKEN_STATS, labelKey: 'sidebar.tokenStats' },
] as const;

export function ConfigAdvancedPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [agentName, setAgentName] = useState('');
  const [disabledViews, setDisabledViews] = useState<string[]>([]);
  const [embeddingConfig, setEmbeddingConfig] = useState<EmbeddingConfig>({
    embeddingBaseUrl: '',
    embeddingModel: 'text-embedding-3-small',
    embeddingApiKeyEnv: 'OPENAI_API_KEY',
  });
  const [searchKeys, setSearchKeys] = useState<SearchKeys>({ braveApiKey: '', tavilyApiKey: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [viewsData, envData] = await Promise.all([
        apiGet<{ disabled?: string[] }>('/api/config/views'),
        apiGet<EnvData>('/api/config/env'),
      ]);
      setDisabledViews(viewsData.disabled ?? []);
      const env = envData.env ?? {};
      setAgentName(env.SWELL_AGENT_NAME ?? '');
      setEmbeddingConfig({
        embeddingBaseUrl: env.SWELL_EMBEDDING_BASE_URL ?? '',
        embeddingModel: env.SWELL_EMBEDDING_MODEL ?? 'text-embedding-3-small',
        embeddingApiKeyEnv: env.SWELL_EMBEDDING_API_KEY_ENV ?? 'OPENAI_API_KEY',
      });
      setSearchKeys({
        braveApiKey: env.BRAVE_SEARCH_API_KEY ?? '',
        tavilyApiKey: env.TAVILY_API_KEY ?? '',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('configAdvanced.loadFailed'));
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
      await apiPost('/api/config/views', { disabled: disabledViews });

      const envEntries: Record<string, string> = {
        SWELL_AGENT_NAME: agentName,
        SWELL_EMBEDDING_BASE_URL: embeddingConfig.embeddingBaseUrl,
        SWELL_EMBEDDING_MODEL: embeddingConfig.embeddingModel,
        SWELL_EMBEDDING_API_KEY_ENV: embeddingConfig.embeddingApiKeyEnv,
      };
      // 跳过脱敏占位值（含 *** 说明是后端返回的掩码，不回写）
      if (searchKeys.braveApiKey && !searchKeys.braveApiKey.includes('***')) {
        envEntries.BRAVE_SEARCH_API_KEY = searchKeys.braveApiKey;
      }
      if (searchKeys.tavilyApiKey && !searchKeys.tavilyApiKey.includes('***')) {
        envEntries.TAVILY_API_KEY = searchKeys.tavilyApiKey;
      }

      await apiPost('/api/config/env', { entries: envEntries });
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

      {/* 基本设置 */}
      <div className="mt-6">
        <Form layout="vertical" size="small">
          <Form.Item label={t('configAdvanced.agentName')} help={t('configAdvanced.agentNameHint')}>
            <Input
              value={agentName}
              placeholder={t('configAdvanced.agentNamePlaceholder')}
              onChange={(e) => setAgentName(e.target.value)}
            />
          </Form.Item>
        </Form>
      </div>

      <Divider />

      {/* 隐藏模块 */}
      <div>
        <Title level={5}>{t('configAdvanced.hiddenModules')}</Title>
        <Text type="secondary" className="block mb-3">
          {t('configAdvanced.hiddenModulesHint')}
        </Text>
        <Checkbox.Group
          value={disabledViews}
          onChange={(vals) => setDisabledViews(vals as string[])}
          className="flex flex-wrap gap-x-6 gap-y-2"
        >
          {HIDEABLE_VIEWS.map(({ key, labelKey }) => (
            <Checkbox key={key} value={key}>
              {t(labelKey as Parameters<typeof t>[0])}
            </Checkbox>
          ))}
        </Checkbox.Group>
      </div>

      <Divider />

      {/* 向量 Embedding */}
      <div>
        <Title level={5}>{t('configAdvanced.embeddingTitle')}</Title>
        <Text type="secondary" className="block mb-4">
          {t('configAdvanced.embeddingSubtitle')}
        </Text>
        <Form layout="vertical" size="small">
          <Form.Item label={t('configAdvanced.embeddingBaseUrl')}>
            <Input
              value={embeddingConfig.embeddingBaseUrl}
              placeholder={t('configAdvanced.embeddingBaseUrlPlaceholder')}
              onChange={(e) =>
                setEmbeddingConfig((prev) => ({ ...prev, embeddingBaseUrl: e.target.value }))
              }
            />
          </Form.Item>
          <Form.Item label={t('configAdvanced.embeddingModel')}>
            <Input
              value={embeddingConfig.embeddingModel}
              placeholder={t('configAdvanced.embeddingModelPlaceholder')}
              onChange={(e) =>
                setEmbeddingConfig((prev) => ({ ...prev, embeddingModel: e.target.value }))
              }
            />
          </Form.Item>
          <Form.Item label={t('configAdvanced.embeddingApiKeyEnv')}>
            <Input
              value={embeddingConfig.embeddingApiKeyEnv}
              placeholder={t('configAdvanced.embeddingApiKeyEnvPlaceholder')}
              onChange={(e) =>
                setEmbeddingConfig((prev) => ({ ...prev, embeddingApiKeyEnv: e.target.value }))
              }
            />
          </Form.Item>
        </Form>
      </div>

      <Divider />

      {/* 网络搜索 */}
      <div>
        <Title level={5}>{t('configAdvanced.searchTitle')}</Title>
        <Text type="secondary" className="block mb-4">
          {t('configAdvanced.searchSubtitle')}
        </Text>
        <Form layout="vertical" size="small">
          <Form.Item label={t('configAdvanced.braveApiKey')}>
            <Input.Password
              value={searchKeys.braveApiKey}
              placeholder={
                searchKeys.braveApiKey.includes('***')
                  ? t('configAdvanced.searchKeyConfigured')
                  : t('configAdvanced.searchKeyPlaceholder')
              }
              onChange={(e) => setSearchKeys((prev) => ({ ...prev, braveApiKey: e.target.value }))}
            />
          </Form.Item>
          <Form.Item label={t('configAdvanced.tavilyApiKey')}>
            <Input.Password
              value={searchKeys.tavilyApiKey}
              placeholder={
                searchKeys.tavilyApiKey.includes('***')
                  ? t('configAdvanced.searchKeyConfigured')
                  : t('configAdvanced.searchKeyPlaceholder')
              }
              onChange={(e) => setSearchKeys((prev) => ({ ...prev, tavilyApiKey: e.target.value }))}
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
