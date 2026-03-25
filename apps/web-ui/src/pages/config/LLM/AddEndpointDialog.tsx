import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  message,
  Modal,
  Button,
  Space,
  Alert,
  Collapse,
  Form,
  Input,
  Select,
  InputNumber,
  Checkbox,
} from 'antd';
import { useTranslation } from 'react-i18next';
import { apiGet, apiPost } from '../../../api/base';
import { CAPABILITY_OPTIONS } from './constants';
import type { EndpointFormData, ListedModel, ProviderInfo, EndpointItem } from './types';

const DEFAULT_CONTEXT_WINDOW = 200000;
const DEFAULT_TIMEOUT = 180;

type FormValues = {
  providerSlug: string;
  baseUrl: string;
  apiKeyValue: string;
  apiKeyEnv: string;
  apiType: 'openai' | 'anthropic';
  selectedModelId: string;
  endpointName: string;
  capabilities: string[];
  endpointPriority: number;
  maxTokens: number;
  contextWindow: number;
  timeoutSec: number;
  rpmLimit: number;
};

function isLocalProvider(p: ProviderInfo | null | undefined): boolean {
  return p?.requires_api_key === false || p?.is_local === true;
}

function localPlaceholderKey(p: ProviderInfo | null | undefined): string {
  return p?.slug || 'local';
}

export type AddEndpointDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: EndpointFormData) => void;
  existingNames?: string[];
  endpointCount?: number;
  mode?: 'add' | 'edit';
  initial?: EndpointItem | null;
};

export function AddEndpointDialog({
  open,
  onOpenChange,
  onConfirm,
  existingNames = [],
  endpointCount = 0,
  mode = 'add',
  initial = null,
}: AddEndpointDialogProps) {
  const { t } = useTranslation();
  const [messageApi, contextHolder] = message.useMessage();
  const [form] = Form.useForm<FormValues>();

  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [providersError, setProvidersError] = useState<string | null>(null);
  const [models, setModels] = useState<ListedModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [connTesting, setConnTesting] = useState(false);
  const [connTestResult, setConnTestResult] = useState<{
    ok: boolean;
    latencyMs: number;
    error?: string;
    modelCount?: number;
  } | null>(null);
  const [baseUrlExpanded, setBaseUrlExpanded] = useState(false);

  const providerSlug = Form.useWatch('providerSlug', form);
  const baseUrl = Form.useWatch('baseUrl', form) ?? '';
  const apiKeyValue = Form.useWatch('apiKeyValue', form) ?? '';
  const selectedModelId = Form.useWatch('selectedModelId', form) ?? '';
  const selectedProvider = useMemo(
    () => providers.find((p) => p.slug === providerSlug) ?? providers[0] ?? null,
    [providers, providerSlug]
  );

  const isCustomOrLocal =
    selectedProvider && ['custom', 'ollama', 'lmstudio'].includes(selectedProvider.slug);
  const showBaseUrl = isCustomOrLocal || baseUrlExpanded;
  const effectiveBaseUrl = baseUrl.trim() || selectedProvider?.default_base_url || '';

  useEffect(() => {
    if (!selectedProvider) return;
    form.setFieldValue(
      'apiType',
      (selectedProvider.api_type as 'openai' | 'anthropic') || 'anthropic'
    );
    if (!form.getFieldValue('baseUrl')) {
      form.setFieldValue('baseUrl', selectedProvider.default_base_url || '');
    }
    if (!form.getFieldValue('apiKeyEnv')) {
      const used = new Set(existingNames);
      let suggestion =
        selectedProvider.api_key_env_suggestion ||
        `LLM_API_KEY_${selectedProvider.slug.toUpperCase()}`;
      while (used.has(suggestion)) suggestion = `${suggestion}_2`;
      form.setFieldValue('apiKeyEnv', suggestion);
    }
    if (isLocalProvider(selectedProvider) && !(form.getFieldValue('apiKeyValue') ?? '').trim()) {
      form.setFieldValue('apiKeyValue', localPlaceholderKey(selectedProvider));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProvider]);

  useEffect(() => {
    if (mode === 'edit') return;
    if (!form.getFieldValue('endpointName') && selectedProvider && selectedModelId) {
      form.setFieldValue(
        'endpointName',
        `${selectedProvider.slug}-${selectedModelId}`.slice(0, 64)
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProvider, selectedModelId, mode]);

  useEffect(() => {
    if (!open) return;
    setBaseUrlExpanded(false);
    setModels([]);
    setConnTestResult(null);
    form.resetFields();
    if (mode === 'edit' && initial) {
      form.setFieldsValue({
        providerSlug: initial.provider || '',
        baseUrl: initial.base_url || '',
        apiKeyValue: '',
        apiKeyEnv: initial.api_key_env || '',
        apiType: (initial.api_type as 'openai' | 'anthropic') || 'anthropic',
        selectedModelId: initial.model || '',
        endpointName: initial.name || '',
        capabilities: initial.capabilities || [],
        endpointPriority: initial.priority ?? 1,
        maxTokens: initial.max_tokens ?? 0,
        contextWindow: initial.context_window ?? DEFAULT_CONTEXT_WINDOW,
        timeoutSec: initial.timeout ?? DEFAULT_TIMEOUT,
        rpmLimit: initial.rpm_limit ?? 0,
      });
    } else {
      form.setFieldsValue({
        providerSlug: '',
        baseUrl: '',
        apiKeyValue: '',
        apiKeyEnv: '',
        apiType: 'anthropic',
        selectedModelId: '',
        endpointName: '',
        capabilities: [],
        endpointPriority: endpointCount === 0 ? 1 : endpointCount + 1,
        maxTokens: 0,
        contextWindow: DEFAULT_CONTEXT_WINDOW,
        timeoutSec: DEFAULT_TIMEOUT,
        rpmLimit: 0,
      });
    }

    setProviders([]);
    setProvidersError(null);
    setProvidersLoading(true);
    apiGet<{ providers?: ProviderInfo[] } | ProviderInfo[]>('/api/config/providers')
      .then((data) => {
        const list = Array.isArray(data) ? data : (data.providers ?? []);
        setProviders(list);
        if (mode === 'edit' && initial && initial.provider) {
          form.setFieldValue('providerSlug', initial.provider);
        }
      })
      .catch(() => setProvidersError(t('addEndpoint.providerLoadFailed')))
      .finally(() => setProvidersLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, initial]);

  useEffect(() => {
    if (providers.length === 0) return;
    if (form.getFieldValue('providerSlug')) return;
    form.setFieldValue('providerSlug', providers[0].slug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providers]);

  const applyModelCapabilities = useCallback(
    (modelId: string) => {
      const id = modelId.trim();
      if (!id) {
        form.setFieldValue('capabilities', []);
        return;
      }
      const model = models.find((item) => item.id === id);
      const raw = model?.capabilities;
      if (!raw || typeof raw !== 'object') return;
      const selected = CAPABILITY_OPTIONS.filter((item) => raw[item.k] === true).map(
        (item) => item.k
      );
      form.setFieldValue('capabilities', selected.length > 0 ? selected : ['text']);
    },
    [form, models]
  );

  const fetchModels = useCallback(async () => {
    const effectiveKey =
      apiKeyValue.trim() ||
      (isLocalProvider(selectedProvider) ? localPlaceholderKey(selectedProvider) : '');
    const currentApiType = (form.getFieldValue('apiType') as string) || 'openai';
    const currentBaseUrl =
      ((form.getFieldValue('baseUrl') as string) || '').trim() ||
      selectedProvider?.default_base_url ||
      '';
    setModelsLoading(true);
    setModels([]);
    form.setFieldValue('selectedModelId', '');
    try {
      const data = await apiPost<{ models?: ListedModel[]; error?: string }>(
        '/api/config/list-models',
        {
          api_type: currentApiType,
          base_url: currentBaseUrl,
          provider_slug: selectedProvider?.slug ?? null,
          api_key: effectiveKey,
        }
      );
      const list = Array.isArray(data.models) ? data.models : [];
      setModels(list);
      if (data.error) {
        messageApi.error(t('addEndpoint.fetchFailed', { error: data.error }));
      } else {
        messageApi.success(t('addEndpoint.fetchSuccess', { count: list.length }));
      }
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : t('addEndpoint.fetchError'));
    } finally {
      setModelsLoading(false);
    }
  }, [selectedProvider, apiKeyValue, form, messageApi, t]);

  const testConnection = useCallback(async () => {
    const effectiveKey =
      apiKeyValue.trim() ||
      (isLocalProvider(selectedProvider) ? localPlaceholderKey(selectedProvider) : '');
    const currentApiType = (form.getFieldValue('apiType') as string) || 'openai';
    const currentBaseUrl =
      ((form.getFieldValue('baseUrl') as string) || '').trim() ||
      selectedProvider?.default_base_url ||
      '';
    setConnTesting(true);
    setConnTestResult(null);
    const t0 = performance.now();
    try {
      const data = await apiPost<{ models?: unknown[]; error?: string }>(
        '/api/config/list-models',
        {
          api_type: currentApiType,
          base_url: currentBaseUrl,
          provider_slug: selectedProvider?.slug ?? null,
          api_key: effectiveKey,
        }
      );
      const latency = Math.round(performance.now() - t0);
      if (data.error) {
        setConnTestResult({ ok: false, latencyMs: latency, error: data.error });
      } else {
        setConnTestResult({
          ok: true,
          latencyMs: latency,
          modelCount: Array.isArray(data.models) ? data.models.length : 0,
        });
      }
    } catch (e) {
      setConnTestResult({
        ok: false,
        latencyMs: Math.round(performance.now() - t0),
        error: e instanceof Error ? e.message : '请求失败',
      });
    } finally {
      setConnTesting(false);
    }
  }, [selectedProvider, apiKeyValue, form]);

  const onFinish = useCallback(
    (values: FormValues) => {
      const url = (values.baseUrl ?? '').trim() || selectedProvider?.default_base_url || '';
      const name =
        (values.endpointName ?? '').trim() ||
        `${selectedProvider?.slug ?? 'ep'}-${values.selectedModelId ?? ''}`.slice(0, 64);

      if (existingNames.includes(name)) {
        form.setFields([{ name: 'endpointName', errors: [t('addEndpoint.nameExists')] }]);
        return;
      }

      const effectiveKey =
        (values.apiKeyValue ?? '').trim() ||
        (isLocalProvider(selectedProvider) ? localPlaceholderKey(selectedProvider) : '');
      if (!isLocalProvider(selectedProvider) && !effectiveKey) {
        form.setFields([{ name: 'apiKeyValue', errors: [t('addEndpoint.apiKeyRequired')] }]);
        return;
      }

      const keyEnv =
        (values.apiKeyEnv ?? '').trim() ||
        `LLM_API_KEY_${selectedProvider?.slug ?? 'custom'}`.toUpperCase();

      const capabilities = values.capabilities ?? [];

      const payload: EndpointFormData = {
        name,
        model: (values.selectedModelId ?? '').trim(),
        api_type: (form.getFieldValue('apiType') as 'openai' | 'anthropic') ?? 'openai',
        base_url: url,
        api_key_env: keyEnv,
        api_key_value:
          effectiveKey && !isLocalProvider(selectedProvider) ? effectiveKey : undefined,
        priority: Math.max(1, values.endpointPriority ?? 1),
        enabled: true,
        provider: selectedProvider?.slug,
        capabilities: capabilities.length ? capabilities : ['text'],
        max_tokens: Math.max(0, values.maxTokens ?? 0),
        context_window: Math.max(1024, values.contextWindow ?? DEFAULT_CONTEXT_WINDOW),
        timeout: Math.max(10, values.timeoutSec ?? DEFAULT_TIMEOUT),
        rpm_limit: Math.max(0, values.rpmLimit ?? 0),
      };

      onConfirm(payload);
      onOpenChange(false);
    },
    [selectedProvider, existingNames, form, onConfirm, onOpenChange, t]
  );

  const canTest = !!effectiveBaseUrl && (!!apiKeyValue.trim() || isLocalProvider(selectedProvider));

  const footer = (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <Button onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
      <Space wrap>
        <Button onClick={testConnection} disabled={!canTest || connTesting} loading={connTesting}>
          {connTesting ? t('addEndpoint.testing') : t('addEndpoint.testConnection')}
        </Button>
        <Button type="primary" onClick={() => form.submit()}>
          {t('common.confirm')}
        </Button>
      </Space>
    </div>
  );

  const advancedItems = [
    {
      key: 'advanced',
      label: t('addEndpoint.advanced'),
      children: (
        <div className="space-y-1">
          <div className="grid grid-cols-2 gap-4">
            <Form.Item name="apiType" label={t('addEndpoint.apiType')}>
              <Select
                options={[
                  { value: 'openai', label: 'openai' },
                  { value: 'anthropic', label: 'anthropic' },
                ]}
              />
            </Form.Item>
            <Form.Item name="endpointPriority" label={t('addEndpoint.priority')}>
              <InputNumber min={1} className="w-full" />
            </Form.Item>
          </div>
          <Form.Item name="apiKeyEnv" label={t('addEndpoint.apiKeyEnvName')}>
            <Input placeholder={t('addEndpoint.apiKeyEnvPlaceholder')} />
          </Form.Item>
          <Form.Item
            name="maxTokens"
            label={t('addEndpoint.maxTokens')}
            extra={t('addEndpoint.maxTokensHint')}
          >
            <InputNumber min={0} className="w-full" />
          </Form.Item>
          <Form.Item
            name="contextWindow"
            label={t('addEndpoint.contextWindow')}
            extra={t('addEndpoint.contextWindowHint')}
            rules={[{ type: 'number', min: 1024, message: t('addEndpoint.contextWindowHint') }]}
          >
            <InputNumber min={1024} className="w-full" />
          </Form.Item>
          <Form.Item
            name="timeoutSec"
            label={t('addEndpoint.timeout')}
            rules={[{ type: 'number', min: 10, message: '超时至少 10 秒' }]}
          >
            <InputNumber min={10} className="w-full" />
          </Form.Item>
          <Form.Item
            name="rpmLimit"
            label={t('addEndpoint.rpmLimit')}
            extra={t('addEndpoint.rpmLimitHint')}
          >
            <InputNumber min={0} className="w-full" />
          </Form.Item>
        </div>
      ),
    },
  ];

  return (
    <>
      {contextHolder}
      <Modal
        open={open}
        onCancel={() => onOpenChange(false)}
        title={mode === 'edit' ? t('editEndpoint.title') : t('addEndpoint.title')}
        footer={footer}
        width={720}
        destroyOnHidden
      >
        <p className="text-sm text-muted-foreground mb-4">
          {mode === 'edit' ? t('addEndpoint.description') : t('addEndpoint.description')}
        </p>

        <Form form={form} layout="vertical" onFinish={onFinish}>
          {/* 服务商 */}
          <Form.Item
            name="providerSlug"
            label={t('addEndpoint.provider')}
            extra={
              !isCustomOrLocal ? (
                <span>
                  API 地址：{effectiveBaseUrl || '—'}{' '}
                  <button
                    type="button"
                    className="text-accent hover:underline focus:outline-none"
                    onClick={() => setBaseUrlExpanded((v) => !v)}
                  >
                    {baseUrlExpanded
                      ? t('addEndpoint.apiUrlCollapse')
                      : t('addEndpoint.apiUrlConfig')}
                  </button>
                </span>
              ) : undefined
            }
          >
            <Select
              loading={providersLoading}
              disabled={providersLoading}
              placeholder={
                providersLoading
                  ? t('addEndpoint.providerLoading')
                  : t('addEndpoint.providerPlaceholder')
              }
              options={providers.map((p) => ({ value: p.slug, label: p.name }))}
              onChange={() => {
                setBaseUrlExpanded(false);
                setModels([]);
                form.setFieldsValue({
                  selectedModelId: '',
                  capabilities: [],
                  baseUrl: '',
                });
              }}
            />
          </Form.Item>
          {providersError && <p className="text-xs text-red-500 -mt-3 mb-4">{providersError}</p>}

          {/* API 地址 */}
          {showBaseUrl && (
            <Form.Item
              name="baseUrl"
              label={t('addEndpoint.apiUrl')}
              extra={t('addEndpoint.apiUrlHint')}
              rules={[
                {
                  validator: (_, value) => {
                    if (!value || /^https?:\/\/.+/.test(value)) return Promise.resolve();
                    return Promise.reject(new Error(t('addEndpoint.apiUrlHint')));
                  },
                },
              ]}
            >
              <Input
                placeholder={selectedProvider?.default_base_url || 'https://api.example.com/v1'}
              />
            </Form.Item>
          )}

          {/* API Key */}
          <Form.Item
            name="apiKeyValue"
            label={
              <span>
                {t('addEndpoint.apiKey')}
                {isLocalProvider(selectedProvider) && (
                  <span className="text-muted-foreground ml-1 font-normal text-xs">
                    {t('addEndpoint.apiKeyOptional')}
                  </span>
                )}
              </span>
            }
          >
            <Input.Password
              placeholder={
                isLocalProvider(selectedProvider)
                  ? t('addEndpoint.apiKeyOptionalPlaceholder')
                  : t('addEndpoint.apiKeyPlaceholder')
              }
            />
          </Form.Item>

          {/* 选择模型 */}
          <Form.Item
            name="selectedModelId"
            label={t('addEndpoint.model')}
            rules={[{ required: true, message: '请填写或选择模型' }]}
            extra={
              <span>
                {t('addEndpoint.modelManualHint')}{' '}
                <button
                  type="button"
                  className="text-accent hover:underline disabled:opacity-50 focus:outline-none"
                  onClick={fetchModels}
                  disabled={modelsLoading || !effectiveBaseUrl}
                >
                  {modelsLoading ? t('addEndpoint.modelFetching') : t('addEndpoint.modelFetchBtn')}
                </button>
                {models.length > 0 && (
                  <span className="text-muted-foreground ml-1">
                    {t('addEndpoint.modelFetched', { count: models.length })}
                  </span>
                )}
              </span>
            }
          >
            {models.length > 0 ? (
              <Select
                allowClear
                options={models.map((m) => ({ value: m.id, label: m.name || m.id }))}
                placeholder={t('addEndpoint.modelPlaceholder')}
                onChange={(value) => applyModelCapabilities(value ?? '')}
              />
            ) : (
              <Input placeholder={t('addEndpoint.modelInputPlaceholder')} />
            )}
          </Form.Item>

          {/* 端点名称 */}
          <Form.Item
            name="endpointName"
            label={t('addEndpoint.endpointName')}
            rules={[{ max: 64 }]}
          >
            <Input
              placeholder={`${selectedProvider?.slug ?? 'ep'}-${selectedModelId || 'model'}`}
            />
          </Form.Item>

          {/* 模型能力 */}
          <Form.Item name="capabilities" label={t('addEndpoint.capabilities')}>
            <Checkbox.Group
              options={CAPABILITY_OPTIONS.map((c) => ({ label: c.name, value: c.k }))}
            />
          </Form.Item>

          {/* 高级参数 */}
          <Collapse size="small" items={advancedItems} />
        </Form>

        {/* 连接测试结果 */}
        {connTestResult && (
          <Alert
            type={connTestResult.ok ? 'success' : 'error'}
            className="mt-4"
            title={
              connTestResult.ok
                ? t('addEndpoint.testSuccess', {
                    ms: connTestResult.latencyMs,
                    count: connTestResult.modelCount ?? 0,
                  })
                : t('addEndpoint.testFailed', {
                    error: connTestResult.error ?? '未知',
                    ms: connTestResult.latencyMs,
                  })
            }
            showIcon
          />
        )}
      </Modal>
    </>
  );
}
