import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { message } from 'antd';
import { Modal, Button, Space, Alert, Collapse } from 'antd';
import { useTranslation } from 'react-i18next';
import { apiGet, apiPost } from '../../../api/base';
import { FormField, Input, Select } from '../../../components/ui';
import { CAPABILITY_OPTIONS } from './constants';
import { endpointSchema, type EndpointFormValues } from './endpointSchema';
import type { EndpointFormData, ListedModel, ProviderInfo } from './types';

const DEFAULT_CONTEXT_WINDOW = 200000;
const DEFAULT_TIMEOUT = 180;

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
};

export function AddEndpointDialog({
  open,
  onOpenChange,
  onConfirm,
  existingNames = [],
  endpointCount = 0,
}: AddEndpointDialogProps) {
  const { t } = useTranslation();
  const [messageApi, contextHolder] = message.useMessage();

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

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    reset,
    formState: { errors, dirtyFields },
  } = useForm<EndpointFormValues>({
    resolver: zodResolver(endpointSchema),
    defaultValues: {
      providerSlug: '',
      baseUrl: '',
      apiKeyValue: '',
      apiKeyEnv: '',
      apiType: 'anthropic',
      selectedModelId: '',
      endpointName: '',
      capSelected: ['text'],
      endpointPriority: endpointCount === 0 ? 1 : endpointCount + 1,
      maxTokens: 0,
      contextWindow: DEFAULT_CONTEXT_WINDOW,
      timeoutSec: DEFAULT_TIMEOUT,
      rpmLimit: 0,
    },
  });

  const providerSlug = watch('providerSlug');
  const baseUrl = watch('baseUrl');
  const apiKeyValue = watch('apiKeyValue');
  const apiType = watch('apiType');
  const selectedModelId = watch('selectedModelId');
  const capSelected = watch('capSelected');

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
    setValue('apiType', (selectedProvider.api_type as 'openai' | 'anthropic') || 'anthropic');
    if (!dirtyFields.baseUrl) {
      setValue('baseUrl', selectedProvider.default_base_url || '');
    }
    if (!dirtyFields.apiKeyEnv) {
      const used = new Set(existingNames);
      let suggestion =
        selectedProvider.api_key_env_suggestion ||
        `LLM_API_KEY_${selectedProvider.slug.toUpperCase()}`;
      while (used.has(suggestion)) suggestion = `${suggestion}_2`;
      setValue('apiKeyEnv', suggestion);
    }
    if (isLocalProvider(selectedProvider) && !apiKeyValue.trim()) {
      setValue('apiKeyValue', localPlaceholderKey(selectedProvider));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProvider]);

  useEffect(() => {
    if (!dirtyFields.endpointName && selectedProvider && selectedModelId) {
      setValue('endpointName', `${selectedProvider.slug}-${selectedModelId}`.slice(0, 64));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProvider, selectedModelId]);

  useEffect(() => {
    if (!open) return;
    setBaseUrlExpanded(false);
    setModels([]);
    setConnTestResult(null);
    reset({
      providerSlug: '',
      baseUrl: '',
      apiKeyValue: '',
      apiKeyEnv: '',
      apiType: 'anthropic',
      selectedModelId: '',
      endpointName: '',
      capSelected: ['text'],
      endpointPriority: endpointCount === 0 ? 1 : endpointCount + 1,
      maxTokens: 0,
      contextWindow: DEFAULT_CONTEXT_WINDOW,
      timeoutSec: DEFAULT_TIMEOUT,
      rpmLimit: 0,
    });

    setProviders([]);
    setProvidersError(null);
    setProvidersLoading(true);
    apiGet<{ providers?: ProviderInfo[] } | ProviderInfo[]>('/api/config/providers')
      .then((data) => {
        const list = Array.isArray(data) ? data : (data.providers ?? []);
        setProviders(list);
      })
      .catch(() => setProvidersError(t('addEndpoint.providerLoadFailed')))
      .finally(() => setProvidersLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (providers.length === 0) return;
    if (watch('providerSlug')) return;
    setValue('providerSlug', providers[0].slug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providers]);

  const fetchModels = useCallback(async () => {
    const effectiveKey =
      apiKeyValue.trim() ||
      (isLocalProvider(selectedProvider) ? localPlaceholderKey(selectedProvider) : '');
    setModelsLoading(true);
    setModels([]);
    setValue('selectedModelId', '');
    try {
      const data = await apiPost<{ models?: ListedModel[]; error?: string }>(
        '/api/config/list-models',
        {
          api_type: apiType,
          base_url: effectiveBaseUrl,
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
      setModels([]);
    } finally {
      setModelsLoading(false);
    }
  }, [apiType, effectiveBaseUrl, selectedProvider, apiKeyValue, setValue, messageApi, t]);

  const testConnection = useCallback(async () => {
    const effectiveKey =
      apiKeyValue.trim() ||
      (isLocalProvider(selectedProvider) ? localPlaceholderKey(selectedProvider) : '');
    setConnTesting(true);
    setConnTestResult(null);
    const t0 = performance.now();
    try {
      const data = await apiPost<{ models?: unknown[]; error?: string }>(
        '/api/config/list-models',
        {
          api_type: apiType,
          base_url: effectiveBaseUrl,
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
  }, [apiType, effectiveBaseUrl, selectedProvider, apiKeyValue]);

  const onValid = useCallback(
    (values: EndpointFormValues) => {
      const url = values.baseUrl.trim() || selectedProvider?.default_base_url || '';
      const name =
        values.endpointName.trim() ||
        `${selectedProvider?.slug ?? 'ep'}-${values.selectedModelId}`.slice(0, 64);

      if (existingNames.includes(name)) {
        setError('endpointName', { message: t('addEndpoint.nameExists') });
        return;
      }

      const effectiveKey =
        values.apiKeyValue.trim() ||
        (isLocalProvider(selectedProvider) ? localPlaceholderKey(selectedProvider) : '');
      if (!isLocalProvider(selectedProvider) && !effectiveKey) {
        setError('apiKeyValue', { message: t('addEndpoint.apiKeyRequired'), type: 'manual' });
        return;
      }

      const keyEnv =
        values.apiKeyEnv.trim() ||
        `LLM_API_KEY_${selectedProvider?.slug ?? 'custom'}`.toUpperCase();

      const payload: EndpointFormData = {
        name,
        model: values.selectedModelId.trim(),
        api_type: values.apiType,
        base_url: url,
        api_key_env: keyEnv,
        api_key_value:
          effectiveKey && !isLocalProvider(selectedProvider) ? effectiveKey : undefined,
        priority: Math.max(1, values.endpointPriority),
        enabled: true,
        provider: selectedProvider?.slug,
        capabilities: values.capSelected.length ? values.capSelected : ['text'],
        max_tokens: Math.max(0, values.maxTokens),
        context_window: Math.max(1024, values.contextWindow),
        timeout: Math.max(10, values.timeoutSec),
        rpm_limit: Math.max(0, values.rpmLimit),
      };

      onConfirm(payload);
      onOpenChange(false);
    },
    [selectedProvider, existingNames, onConfirm, onOpenChange, setError, t]
  );

  const canTest = !!effectiveBaseUrl && (!!apiKeyValue.trim() || isLocalProvider(selectedProvider));

  const footer = (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <Button onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
      <Space wrap>
        <Button onClick={testConnection} disabled={!canTest || connTesting} loading={connTesting}>
          {connTesting ? t('addEndpoint.testing') : t('addEndpoint.testConnection')}
        </Button>
        <Button type="primary" onClick={handleSubmit(onValid)}>
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
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label={t('addEndpoint.apiType')}>
              <Select
                value={apiType}
                onValueChange={(v) =>
                  setValue('apiType', v as 'openai' | 'anthropic', { shouldDirty: true })
                }
                options={[
                  { value: 'openai', label: 'openai' },
                  { value: 'anthropic', label: 'anthropic' },
                ]}
              />
            </FormField>
            <FormField label={t('addEndpoint.priority')} error={errors.endpointPriority?.message}>
              <Input
                type="number"
                min={1}
                {...register('endpointPriority', { valueAsNumber: true })}
              />
            </FormField>
          </div>
          <FormField label={t('addEndpoint.apiKeyEnvName')}>
            <Input
              type="text"
              {...register('apiKeyEnv')}
              placeholder={t('addEndpoint.apiKeyEnvPlaceholder')}
            />
          </FormField>
          <FormField
            label={t('addEndpoint.maxTokens')}
            hint={t('addEndpoint.maxTokensHint')}
            error={errors.maxTokens?.message}
          >
            <Input type="number" min={0} {...register('maxTokens', { valueAsNumber: true })} />
          </FormField>
          <FormField
            label={t('addEndpoint.contextWindow')}
            hint={t('addEndpoint.contextWindowHint')}
            error={errors.contextWindow?.message}
          >
            <Input
              type="number"
              min={1024}
              {...register('contextWindow', { valueAsNumber: true })}
            />
          </FormField>
          <FormField label={t('addEndpoint.timeout')} error={errors.timeoutSec?.message}>
            <Input type="number" min={10} {...register('timeoutSec', { valueAsNumber: true })} />
          </FormField>
          <FormField
            label={t('addEndpoint.rpmLimit')}
            hint={t('addEndpoint.rpmLimitHint')}
            error={errors.rpmLimit?.message}
          >
            <Input type="number" min={0} {...register('rpmLimit', { valueAsNumber: true })} />
          </FormField>
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
        title={t('addEndpoint.title')}
        footer={footer}
        width={720}
        destroyOnHidden
        styles={{ body: { maxHeight: '65vh', overflowY: 'auto', paddingTop: 8 } }}
      >
        <p className="text-sm text-muted-foreground mb-4">{t('addEndpoint.description')}</p>

        {/* 服务商 */}
        <FormField
          label={t('addEndpoint.provider')}
          hint={
            !isCustomOrLocal ? (
              <>
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
              </>
            ) : undefined
          }
        >
          <Select
            value={providerSlug}
            onValueChange={(v) => {
              setValue('providerSlug', v, { shouldDirty: true });
              setBaseUrlExpanded(false);
            }}
            options={providers.map((p) => ({ value: p.slug, label: p.name }))}
            disabled={providersLoading}
            placeholder={
              providersLoading
                ? t('addEndpoint.providerLoading')
                : t('addEndpoint.providerPlaceholder')
            }
          />
          {providersError && <p className="text-xs text-red-500 mt-1">{providersError}</p>}
        </FormField>

        {/* API 地址 */}
        {showBaseUrl && (
          <FormField
            label={t('addEndpoint.apiUrl')}
            hint={t('addEndpoint.apiUrlHint')}
            error={errors.baseUrl?.message}
          >
            <Input
              type="url"
              {...register('baseUrl')}
              placeholder={selectedProvider?.default_base_url || 'https://api.example.com/v1'}
            />
          </FormField>
        )}

        {/* API Key */}
        <FormField
          label={t('addEndpoint.apiKey')}
          hint={isLocalProvider(selectedProvider) ? t('addEndpoint.apiKeyOptional') : undefined}
          error={errors.apiKeyValue?.message}
        >
          <Input
            type="password"
            {...register('apiKeyValue')}
            placeholder={
              isLocalProvider(selectedProvider)
                ? t('addEndpoint.apiKeyOptionalPlaceholder')
                : t('addEndpoint.apiKeyPlaceholder')
            }
          />
        </FormField>

        {/* 选择模型 */}
        <FormField
          label={t('addEndpoint.model')}
          hint={
            <>
              {t('addEndpoint.modelManualHint')}
              <button
                type="button"
                className="text-accent hover:underline ml-0.5 disabled:opacity-50 focus:outline-none"
                onClick={fetchModels}
                disabled={modelsLoading || !effectiveBaseUrl}
              >
                {modelsLoading ? t('addEndpoint.modelFetching') : t('addEndpoint.modelFetchBtn')}
              </button>
              {models.length > 0 && (
                <span className="text-muted-foreground">
                  {t('addEndpoint.modelFetched', { count: models.length })}
                </span>
              )}
            </>
          }
          error={errors.selectedModelId?.message}
        >
          {models.length > 0 ? (
            <Select
              value={selectedModelId}
              onValueChange={(v) => setValue('selectedModelId', v, { shouldDirty: true })}
              options={models.map((m) => ({ value: m.id, label: m.name || m.id }))}
              placeholder={t('addEndpoint.modelPlaceholder')}
            />
          ) : (
            <Input
              type="text"
              {...register('selectedModelId')}
              placeholder={t('addEndpoint.modelInputPlaceholder')}
            />
          )}
        </FormField>

        {/* 端点名称 */}
        <FormField label={t('addEndpoint.endpointName')} error={errors.endpointName?.message}>
          <Input
            type="text"
            {...register('endpointName')}
            placeholder={`${selectedProvider?.slug ?? 'ep'}-${selectedModelId || 'model'}`}
          />
        </FormField>

        {/* 模型能力 */}
        <FormField label={t('addEndpoint.capabilities')}>
          <div className="flex flex-wrap gap-2">
            {CAPABILITY_OPTIONS.map((c) => {
              const on = capSelected.includes(c.k);
              return (
                <Button
                  key={c.k}
                  type={on ? 'primary' : 'default'}
                  size="small"
                  onClick={() => {
                    const set = new Set(capSelected);
                    if (set.has(c.k)) set.delete(c.k);
                    else set.add(c.k);
                    const out = Array.from(set);
                    setValue('capSelected', out.length ? out : ['text'], { shouldDirty: true });
                  }}
                >
                  {c.name}
                </Button>
              );
            })}
          </div>
        </FormField>

        {/* 高级参数 */}
        <Collapse size="small" items={advancedItems} className="mt-2" />

        {/* 连接测试结果 */}
        {connTestResult && (
          <Alert
            type={connTestResult.ok ? 'success' : 'error'}
            className="mt-4"
            message={
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
