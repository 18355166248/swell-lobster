import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Button,
  Alert,
  Spin,
  Typography,
  Input,
  Form,
  Collapse,
  Divider,
  Checkbox,
  InputNumber,
  Select,
  Space,
  Tag,
  message,
} from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { apiGet, apiPost, getApiBase } from '../../../api/base';
import { ROUTES } from '../../../routes';
import { isTauri } from '../../../utils/platform';

const { Title, Text, Paragraph } = Typography;

type EnvData = { env: Record<string, string>; path?: string; raw?: string };

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

type EnvImportMode = 'merge' | 'replace';

type EnvChangeSummary = {
  added: string[];
  updated: string[];
  deleted: string[];
};

type EditableEnvRow = {
  id: string;
  key: string;
  value: string;
  maskedValue: string;
  isSensitive: boolean;
  isExisting: boolean;
};

type EnvPreset = {
  hintKey: string;
  key: string;
  value?: string;
};

type EnvPresetGroup = {
  presets: EnvPreset[];
  titleKey: string;
};

const SENSITIVE_ENV_KEY_PATTERN = /(TOKEN|SECRET|PASSWORD|KEY|APIKEY)/i;
const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MANAGED_ENV_KEYS = new Set([
  'SWELL_AGENT_NAME',
  'SWELL_EMBEDDING_BASE_URL',
  'SWELL_EMBEDDING_MODEL',
  'SWELL_EMBEDDING_API_KEY_ENV',
  'SWELL_MEMORY_SEMANTIC_MIN_SCORE',
  'SWELL_SEARCH_PROVIDER',
  'BRAVE_SEARCH_API_KEY',
  'TAVILY_API_KEY',
  'LLM_API_KEY_OPENAI',
  'OPENAI_API_KEY',
]);

let envRowSequence = 0;

function createEnvRow({
  key,
  value,
  isExisting,
}: {
  key: string;
  value: string;
  isExisting: boolean;
}): EditableEnvRow {
  envRowSequence += 1;
  const isSensitive = SENSITIVE_ENV_KEY_PATTERN.test(key);
  return {
    id: `env-row-${envRowSequence}`,
    key,
    value: isSensitive ? '' : value,
    maskedValue: value,
    isSensitive,
    isExisting,
  };
}

function buildEditableEnvRows(env: Record<string, string>): EditableEnvRow[] {
  return Object.entries(env)
    .filter(([key]) => !MANAGED_ENV_KEYS.has(key))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => createEnvRow({ key, value, isExisting: true }));
}

const ENV_PRESET_GROUPS: EnvPresetGroup[] = [
  {
    titleKey: 'configAdvanced.envPresetGroupIM',
    presets: [
      { key: 'TELEGRAM_BOT_TOKEN', hintKey: 'configAdvanced.envPresetHintTelegram' },
      { key: 'DINGTALK_CLIENT_ID', hintKey: 'configAdvanced.envPresetHintDingTalkClientId' },
      {
        key: 'DINGTALK_CLIENT_SECRET',
        hintKey: 'configAdvanced.envPresetHintDingTalkClientSecret',
      },
      { key: 'DINGTALK_APP_ID', hintKey: 'configAdvanced.envPresetHintDingTalkAppId' },
    ],
  },
  {
    titleKey: 'configAdvanced.envPresetGroupProxy',
    presets: [
      { key: 'HTTPS_PROXY', hintKey: 'configAdvanced.envPresetHintHttpsProxy' },
      { key: 'HTTP_PROXY', hintKey: 'configAdvanced.envPresetHintHttpProxy' },
      { key: 'ALL_PROXY', hintKey: 'configAdvanced.envPresetHintAllProxy' },
      {
        key: 'NO_PROXY',
        value: 'localhost,127.0.0.1,::1,0.0.0.0',
        hintKey: 'configAdvanced.envPresetHintNoProxy',
      },
    ],
  },
  {
    titleKey: 'configAdvanced.envPresetGroupMcp',
    presets: [
      {
        key: 'SWELL_MCP_EPHEMERAL_CONNECT_TIMEOUT_MS',
        value: '120000',
        hintKey: 'configAdvanced.envPresetHintMcpTimeout',
      },
      {
        key: 'SWELL_MCP_NPX_REGISTRY',
        value: 'https://registry.npmjs.org/',
        hintKey: 'configAdvanced.envPresetHintMcpRegistry',
      },
    ],
  },
];

function findPresetByKey(envKey: string): EnvPreset | undefined {
  return ENV_PRESET_GROUPS.flatMap((group) => group.presets).find(
    (preset) => preset.key === envKey
  );
}

function parseEnvText(content: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (let line of content.split('\n')) {
    line = line.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const eqIdx = line.indexOf('=');
    const key = line.slice(0, eqIdx).trim();
    if (!ENV_KEY_PATTERN.test(key)) continue;
    let value = line.slice(eqIdx + 1).trim();
    if (
      value.length >= 2 &&
      value[0] === value[value.length - 1] &&
      (value[0] === '"' || value[0] === "'")
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function summarizeEnvChanges(
  previousEnv: Record<string, string>,
  nextEnv: Record<string, string>
): EnvChangeSummary {
  const previousKeys = new Set(Object.keys(previousEnv));
  const nextKeys = new Set(Object.keys(nextEnv));

  const added = Array.from(nextKeys)
    .filter((key) => !previousKeys.has(key))
    .sort((a, b) => a.localeCompare(b));
  const updated = Array.from(nextKeys)
    .filter((key) => previousKeys.has(key) && previousEnv[key] !== nextEnv[key])
    .sort((a, b) => a.localeCompare(b));
  const deleted = Array.from(previousKeys)
    .filter((key) => !nextKeys.has(key))
    .sort((a, b) => a.localeCompare(b));

  return { added, updated, deleted };
}

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
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [envPath, setEnvPath] = useState('');
  const [rawEnv, setRawEnv] = useState('');

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
  const [customEnvRows, setCustomEnvRows] = useState<EditableEnvRow[]>([]);
  const [deletedEnvKeys, setDeletedEnvKeys] = useState<string[]>([]);
  const [envFilter, setEnvFilter] = useState(() => searchParams.get('env') ?? '');
  const [envImportMode, setEnvImportMode] = useState<EnvImportMode>('merge');
  const [envChangeSummary, setEnvChangeSummary] = useState<EnvChangeSummary | null>(null);
  const envEditorRef = useRef<HTMLDivElement | null>(null);
  const envImportInputRef = useRef<HTMLInputElement | null>(null);

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
      setRawEnv(envData.raw ?? '');
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
      setCustomEnvRows(buildEditableEnvRows(env));
      setDeletedEnvKeys([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('configAdvanced.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const nextEnv = searchParams.get('env') ?? '';
    setEnvFilter(nextEnv);
    if (nextEnv || window.location.hash === '#env-editor') {
      requestAnimationFrame(() => {
        envEditorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }, [searchParams]);

  const updateCustomEnvRow = useCallback((id: string, patch: Partial<EditableEnvRow>) => {
    setCustomEnvRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const nextKey = patch.key ?? row.key;
        return {
          ...row,
          ...patch,
          isSensitive: SENSITIVE_ENV_KEY_PATTERN.test(nextKey.trim()),
        };
      })
    );
  }, []);

  const handleAddEnvRow = useCallback(() => {
    setCustomEnvRows((prev) => [...prev, createEnvRow({ key: '', value: '', isExisting: false })]);
  }, []);

  const handleAddPreset = useCallback((preset: EnvPreset) => {
    setDeletedEnvKeys((prev) => prev.filter((key) => key !== preset.key));
    setCustomEnvRows((prev) => {
      if (prev.some((row) => row.key.trim() === preset.key)) return prev;
      return [
        ...prev,
        createEnvRow({ key: preset.key, value: preset.value ?? '', isExisting: false }),
      ];
    });
  }, []);

  const handleRemoveEnvRow = useCallback(
    (id: string) => {
      const target = customEnvRows.find((row) => row.id === id);
      if (!target) return;
      if (target.isExisting) {
        setDeletedEnvKeys((prev) => (prev.includes(target.key) ? prev : [...prev, target.key]));
      }
      setCustomEnvRows((prev) => prev.filter((row) => row.id !== id));
    },
    [customEnvRows]
  );

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const previousEnv = parseEnvText(rawEnv);
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

      const customKeys = new Set<string>();
      for (const row of customEnvRows) {
        const key = row.key.trim();
        const value = row.value.trim();
        if (!key && !value) continue;
        if (!key) {
          setError(t('configAdvanced.envKeyRequired'));
          setSaving(false);
          return;
        }
        if (!ENV_KEY_PATTERN.test(key)) {
          setError(t('configAdvanced.envInvalidKey', { key }));
          setSaving(false);
          return;
        }
        if (customKeys.has(key)) {
          setError(t('configAdvanced.envDuplicateKey', { key }));
          setSaving(false);
          return;
        }
        customKeys.add(key);
        if (!row.isExisting && value === '') {
          setError(t('configAdvanced.envValueRequired'));
          setSaving(false);
          return;
        }
        if (row.isSensitive && row.isExisting && value === '') {
          continue;
        }
        envEntries[key] = value;
      }

      for (const key of deletedEnvKeys) {
        if (customKeys.has(key)) continue;
        envEntries[key] = '';
      }

      await apiPost('/api/config/env', { entries: envEntries });
      const nextEnv = { ...previousEnv };
      for (const [key, value] of Object.entries(envEntries)) {
        if (value === '') delete nextEnv[key];
        else nextEnv[key] = value;
      }
      setEnvChangeSummary(summarizeEnvChanges(previousEnv, nextEnv));
      void message.success(t('configAdvanced.saveSuccess'));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('configAdvanced.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleExportEnv = useCallback(async () => {
    if (!rawEnv.trim()) {
      setError(t('configAdvanced.envExportEmpty'));
      return;
    }
    setError(null);
    try {
      const url = `${getApiBase()}/api/config/env/download`;
      if (isTauri()) {
        const savePath = await save({
          defaultPath: 'swell-lobster.env',
          filters: [{ name: 'Environment File', extensions: ['env'] }],
        });
        if (!savePath) return;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${res.status}`);
        const buf = await res.arrayBuffer();
        await writeFile(savePath, new Uint8Array(buf));
        return;
      }
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'swell-lobster.env';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('configAdvanced.envExportFailed'));
    }
  }, [rawEnv, t]);

  const handleImportEnvFile = useCallback(
    async (file: File) => {
      try {
        const content = await file.text();
        const previousEnv = parseEnvText(rawEnv);
        const importedEntries = parseEnvText(content);
        const importedKeys = Object.keys(importedEntries);
        if (importedKeys.length === 0) {
          setError(t('configAdvanced.envImportEmpty'));
          return;
        }
        const entries: Record<string, string> = { ...importedEntries };
        if (envImportMode === 'replace') {
          const existingEntries = parseEnvText(rawEnv);
          for (const existingKey of Object.keys(existingEntries)) {
            if (!(existingKey in importedEntries)) {
              entries[existingKey] = '';
            }
          }
        }
        setSaving(true);
        setError(null);
        await apiPost('/api/config/env', { entries });
        const nextEnv = { ...previousEnv };
        for (const [key, value] of Object.entries(entries)) {
          if (value === '') delete nextEnv[key];
          else nextEnv[key] = value;
        }
        setEnvChangeSummary(summarizeEnvChanges(previousEnv, nextEnv));
        void message.success(
          t(
            envImportMode === 'replace'
              ? 'configAdvanced.envImportReplaceSuccess'
              : 'configAdvanced.envImportSuccess',
            { n: importedKeys.length }
          )
        );
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : t('configAdvanced.envImportFailed'));
      } finally {
        setSaving(false);
        if (envImportInputRef.current) envImportInputRef.current.value = '';
      }
    },
    [envImportMode, load, rawEnv, t]
  );

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2">
        <Spin size="small" />
        <Text type="secondary">{t('common.loading')}</Text>
      </div>
    );
  }

  const visibleCustomEnvRows = customEnvRows.filter((row) => {
    const keyword = envFilter.trim().toLowerCase();
    if (!keyword) return true;
    return (
      row.key.toLowerCase().includes(keyword) ||
      row.value.toLowerCase().includes(keyword) ||
      row.maskedValue.toLowerCase().includes(keyword)
    );
  });

  const envCollapseDefaultKeys = envFilter.trim() !== '' ? ['presets', 'variables'] : ['variables'];

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

      <Divider />

      <div id="env-editor" ref={envEditorRef}>
        <Title level={5}>{t('configAdvanced.envEditorTitle')}</Title>
        <Text type="secondary" className="block mb-3">
          {t('configAdvanced.envEditorSubtitle')}
        </Text>
        <Alert type="info" showIcon className="mb-4" message={t('configAdvanced.envEditorHint')} />
        <Alert
          type="warning"
          showIcon
          className="mb-4"
          message={t('configAdvanced.envRuntimeHint')}
        />
        {envChangeSummary && (
          <Alert
            type="success"
            showIcon
            className="mb-4"
            message={t('configAdvanced.envChangeSummaryTitle')}
            description={
              <div className="flex flex-col gap-1">
                <Text>
                  {t('configAdvanced.envChangeAdded')}: {envChangeSummary.added.join(', ') || '-'}
                </Text>
                <Text>
                  {t('configAdvanced.envChangeUpdated')}:{' '}
                  {envChangeSummary.updated.join(', ') || '-'}
                </Text>
                <Text>
                  {t('configAdvanced.envChangeDeleted')}:{' '}
                  {envChangeSummary.deleted.join(', ') || '-'}
                </Text>
              </div>
            }
          />
        )}
        <div className="mb-4 flex flex-wrap gap-2">
          <Button onClick={handleExportEnv}>{t('configAdvanced.envExport')}</Button>
          <Select
            size="small"
            value={envImportMode}
            style={{ minWidth: 150 }}
            options={[
              { value: 'merge', label: t('configAdvanced.envImportModeMerge') },
              { value: 'replace', label: t('configAdvanced.envImportModeReplace') },
            ]}
            onChange={(value) => setEnvImportMode(value as EnvImportMode)}
          />
          <Button onClick={() => envImportInputRef.current?.click()}>
            {t('configAdvanced.envImport')}
          </Button>
          <input
            ref={envImportInputRef}
            hidden
            type="file"
            accept=".env,text/plain"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleImportEnvFile(file);
            }}
          />
        </div>
        <Text type="secondary" className="mb-4 block text-sm">
          {t(
            envImportMode === 'replace'
              ? 'configAdvanced.envImportModeReplaceHint'
              : 'configAdvanced.envImportModeMergeHint'
          )}
        </Text>
        <Collapse
          size="small"
          defaultActiveKey={envCollapseDefaultKeys}
          items={[
            {
              key: 'presets',
              label: t('configAdvanced.envPresetTitle'),
              children: (
                <div className="rounded border border-border px-4 py-3">
                  <Text type="secondary" className="mt-1 block mb-3">
                    {t('configAdvanced.envPresetSubtitle')}
                  </Text>
                  <div className="flex flex-col gap-3">
                    {ENV_PRESET_GROUPS.map((group) => (
                      <div key={group.titleKey}>
                        <Text type="secondary" className="mb-2 block text-xs uppercase">
                          {t(group.titleKey as Parameters<typeof t>[0])}
                        </Text>
                        <div className="flex flex-wrap gap-2">
                          {group.presets.map((preset) => {
                            const exists = customEnvRows.some(
                              (row) => row.key.trim() === preset.key
                            );
                            return (
                              <Button
                                key={preset.key}
                                size="small"
                                disabled={exists}
                                onClick={() => handleAddPreset(preset)}
                              >
                                {preset.key}
                              </Button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ),
            },
            {
              key: 'variables',
              label: `${t('configAdvanced.envVariableListTitle')} (${visibleCustomEnvRows.length}/${customEnvRows.length})`,
              children: (
                <>
                  <Input
                    value={envFilter}
                    className="mb-3"
                    placeholder={t('configAdvanced.envFilterPlaceholder')}
                    onChange={(e) => setEnvFilter(e.target.value)}
                  />
                  {customEnvRows.length === 0 ? (
                    <div className="mb-3 rounded border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                      {t('configAdvanced.envEmptyState')}
                    </div>
                  ) : visibleCustomEnvRows.length === 0 ? (
                    <div className="mb-3 rounded border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                      {t('configAdvanced.envFilterEmptyState')}
                    </div>
                  ) : (
                    <div className="mb-3 flex flex-col gap-2">
                      {visibleCustomEnvRows.map((row) => {
                        const preset = findPresetByKey(row.key);
                        return (
                          <Space key={row.id} align="baseline" className="w-full" wrap>
                            <div className="min-w-[220px] flex-1">
                              <Input
                                value={row.key}
                                disabled={row.isExisting}
                                placeholder={t('configAdvanced.envKeyPlaceholder')}
                                onChange={(e) =>
                                  updateCustomEnvRow(row.id, { key: e.target.value })
                                }
                              />
                              {row.isExisting && (
                                <div className="mt-1">
                                  <Tag>{t('configAdvanced.envExistingTag')}</Tag>
                                </div>
                              )}
                            </div>
                            {row.isSensitive ? (
                              <div className="min-w-[260px] flex-1">
                                <Input.Password
                                  value={row.value}
                                  placeholder={
                                    row.maskedValue
                                      ? t('configAdvanced.envSensitiveConfigured', {
                                          value: row.maskedValue,
                                        })
                                      : t('configAdvanced.envValuePlaceholder')
                                  }
                                  onChange={(e) =>
                                    updateCustomEnvRow(row.id, { value: e.target.value })
                                  }
                                />
                                <Text type="secondary" className="mt-1 block text-xs">
                                  {preset
                                    ? `${t('configAdvanced.envPresetHintLabel')}: ${t(
                                        preset.hintKey as Parameters<typeof t>[0]
                                      )}`
                                    : t('configAdvanced.envCustomHint')}
                                </Text>
                              </div>
                            ) : (
                              <div className="min-w-[260px] flex-1">
                                <Input
                                  value={row.value}
                                  placeholder={t('configAdvanced.envValuePlaceholder')}
                                  onChange={(e) =>
                                    updateCustomEnvRow(row.id, { value: e.target.value })
                                  }
                                />
                                <Text type="secondary" className="mt-1 block text-xs">
                                  {preset
                                    ? `${t('configAdvanced.envPresetHintLabel')}: ${t(
                                        preset.hintKey as Parameters<typeof t>[0]
                                      )}`
                                    : t('configAdvanced.envCustomHint')}
                                </Text>
                              </div>
                            )}
                            <Button
                              danger
                              icon={<DeleteOutlined />}
                              onClick={() => handleRemoveEnvRow(row.id)}
                            >
                              {t('common.delete')}
                            </Button>
                          </Space>
                        );
                      })}
                    </div>
                  )}
                  <Button type="dashed" icon={<PlusOutlined />} onClick={handleAddEnvRow}>
                    {t('configAdvanced.envAddPair')}
                  </Button>
                </>
              ),
            },
          ]}
        />
      </div>

      <div className="mt-4">
        <Button type="primary" onClick={handleSave} loading={saving}>
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
}
