import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Alert,
  Spin,
  Typography,
  Input,
  Form,
  Divider,
  Checkbox,
  InputNumber,
  Select,
  message,
} from 'antd';
import { useTranslation } from 'react-i18next';
import { apiGet, apiPost } from '../../../api/base';
import { ROUTES } from '../../../routes';

const { Title, Text, Paragraph } = Typography;

type EnvData = { env: Record<string, string>; path?: string };

type EmbeddingConfig = {
  embeddingBaseUrl: string;
  embeddingModel: string;
  embeddingApiKeyEnv: string;
  semanticMinScore: number;
};

type SearchConfig = {
  provider: 'auto' | 'brave' | 'tavily' | 'duckduckgo';
  braveApiKey: string;
  tavilyApiKey: string;
};

type LLMKeyConfig = {
  llmOpenAIKey: string;
  openAIKey: string;
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
  const [envPath, setEnvPath] = useState('');

  const [agentName, setAgentName] = useState('');
  const [disabledViews, setDisabledViews] = useState<string[]>([]);
  const [embeddingConfig, setEmbeddingConfig] = useState<EmbeddingConfig>({
    embeddingBaseUrl: '',
    embeddingModel: 'text-embedding-3-small',
    embeddingApiKeyEnv: 'OPENAI_API_KEY',
    semanticMinScore: 0.75,
  });
  const [searchConfig, setSearchConfig] = useState<SearchConfig>({
    provider: 'auto',
    braveApiKey: '',
    tavilyApiKey: '',
  });
  const [llmKeys, setLlmKeys] = useState<LLMKeyConfig>({
    llmOpenAIKey: '',
    openAIKey: '',
  });

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
      setEnvPath(envData.path ?? '');
      setAgentName(env.SWELL_AGENT_NAME ?? '');
      setEmbeddingConfig({
        embeddingBaseUrl: env.SWELL_EMBEDDING_BASE_URL ?? '',
        embeddingModel: env.SWELL_EMBEDDING_MODEL ?? 'text-embedding-3-small',
        embeddingApiKeyEnv: env.SWELL_EMBEDDING_API_KEY_ENV ?? 'OPENAI_API_KEY',
        semanticMinScore: Number(env.SWELL_MEMORY_SEMANTIC_MIN_SCORE ?? 0.75),
      });
      setSearchConfig({
        provider:
          env.SWELL_SEARCH_PROVIDER === 'brave' ||
          env.SWELL_SEARCH_PROVIDER === 'tavily' ||
          env.SWELL_SEARCH_PROVIDER === 'duckduckgo'
            ? env.SWELL_SEARCH_PROVIDER
            : 'auto',
        braveApiKey: env.BRAVE_SEARCH_API_KEY ?? '',
        tavilyApiKey: env.TAVILY_API_KEY ?? '',
      });
      setLlmKeys({
        llmOpenAIKey: env.LLM_API_KEY_OPENAI ?? '',
        openAIKey: env.OPENAI_API_KEY ?? '',
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
        SWELL_MEMORY_SEMANTIC_MIN_SCORE: String(embeddingConfig.semanticMinScore),
        SWELL_SEARCH_PROVIDER: searchConfig.provider,
      };
      // 跳过脱敏占位值（含 *** 说明是后端返回的掩码，不回写）
      if (searchConfig.braveApiKey && !searchConfig.braveApiKey.includes('***')) {
        envEntries.BRAVE_SEARCH_API_KEY = searchConfig.braveApiKey;
      }
      if (searchConfig.tavilyApiKey && !searchConfig.tavilyApiKey.includes('***')) {
        envEntries.TAVILY_API_KEY = searchConfig.tavilyApiKey;
      }
      if (llmKeys.llmOpenAIKey && !llmKeys.llmOpenAIKey.includes('***')) {
        envEntries.LLM_API_KEY_OPENAI = llmKeys.llmOpenAIKey;
      }
      if (llmKeys.openAIKey && !llmKeys.openAIKey.includes('***')) {
        envEntries.OPENAI_API_KEY = llmKeys.openAIKey;
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
      {envPath && (
        <Alert
          type="info"
          showIcon
          className="mt-3"
          message={t('configAdvanced.envPathLabel')}
          description={
            <Paragraph copyable={{ text: envPath }} style={{ marginBottom: 0 }}>
              <code>{envPath}</code>
            </Paragraph>
          }
        />
      )}

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
          <Form.Item label={t('configAdvanced.semanticMinScore')}>
            <InputNumber
              min={0}
              max={1}
              step={0.05}
              precision={2}
              value={embeddingConfig.semanticMinScore}
              className="w-full"
              onChange={(value) =>
                setEmbeddingConfig((prev) => ({
                  ...prev,
                  semanticMinScore: typeof value === 'number' ? value : prev.semanticMinScore,
                }))
              }
            />
          </Form.Item>
        </Form>
      </div>

      <Divider />

      <div>
        <Title level={5}>{t('configAdvanced.llmKeysTitle')}</Title>
        <Text type="secondary" className="block mb-4">
          {t('configAdvanced.llmKeysSubtitle')}
        </Text>
        <Form layout="vertical" size="small">
          <Form.Item label={t('configAdvanced.llmOpenAIKey')}>
            <Input.Password
              value={llmKeys.llmOpenAIKey}
              placeholder={
                llmKeys.llmOpenAIKey.includes('***')
                  ? t('configAdvanced.apiKeyConfigured')
                  : t('configAdvanced.apiKeyPlaceholder')
              }
              onChange={(e) => setLlmKeys((prev) => ({ ...prev, llmOpenAIKey: e.target.value }))}
            />
          </Form.Item>
          <Form.Item label={t('configAdvanced.openAIKey')}>
            <Input.Password
              value={llmKeys.openAIKey}
              placeholder={
                llmKeys.openAIKey.includes('***')
                  ? t('configAdvanced.apiKeyConfigured')
                  : t('configAdvanced.apiKeyPlaceholder')
              }
              onChange={(e) => setLlmKeys((prev) => ({ ...prev, openAIKey: e.target.value }))}
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
          <Form.Item label={t('configAdvanced.searchProvider')}>
            <Select
              value={searchConfig.provider}
              options={[
                { value: 'auto', label: t('configAdvanced.searchProviderAuto') },
                { value: 'brave', label: t('configAdvanced.searchProviderBrave') },
                { value: 'tavily', label: t('configAdvanced.searchProviderTavily') },
                { value: 'duckduckgo', label: t('configAdvanced.searchProviderDuckDuckGo') },
              ]}
              onChange={(value) =>
                setSearchConfig((prev) => ({
                  ...prev,
                  provider: value as SearchConfig['provider'],
                }))
              }
            />
          </Form.Item>
          <Form.Item label={t('configAdvanced.braveApiKey')}>
            <Input.Password
              value={searchConfig.braveApiKey}
              placeholder={
                searchConfig.braveApiKey.includes('***')
                  ? t('configAdvanced.searchKeyConfigured')
                  : t('configAdvanced.searchKeyPlaceholder')
              }
              onChange={(e) =>
                setSearchConfig((prev) => ({ ...prev, braveApiKey: e.target.value }))
              }
            />
          </Form.Item>
          <Form.Item label={t('configAdvanced.tavilyApiKey')}>
            <Input.Password
              value={searchConfig.tavilyApiKey}
              placeholder={
                searchConfig.tavilyApiKey.includes('***')
                  ? t('configAdvanced.searchKeyConfigured')
                  : t('configAdvanced.searchKeyPlaceholder')
              }
              onChange={(e) =>
                setSearchConfig((prev) => ({ ...prev, tavilyApiKey: e.target.value }))
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
