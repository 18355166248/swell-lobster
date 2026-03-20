import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { apiGet, apiPost } from '../../../api/base';
import { FormField, Input, Select, SharedDialog } from '../../../components/ui';
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
  /** 已有端点名称，用于校验重名 */
  existingNames?: string[];
  /** 当前端点数量，用于默认 priority */
  endpointCount?: number;
};

export function AddEndpointDialog({
  open,
  onOpenChange,
  onConfirm,
  existingNames = [],
  endpointCount = 0,
}: AddEndpointDialogProps) {
  // 非表单 UI 状态
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
  const [advancedOpen, setAdvancedOpen] = useState(false);

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

  // 随服务商更新 base_url / api_type / api_key_env 建议
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

  // 建议端点名称：服务商-模型
  useEffect(() => {
    if (!dirtyFields.endpointName && selectedProvider && selectedModelId) {
      setValue('endpointName', `${selectedProvider.slug}-${selectedModelId}`.slice(0, 64));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProvider, selectedModelId]);

  // API Key 校验在 onValid 里做（提交时），避免弹窗一打开就报错

  // 重置表单 & 拉取 providers
  useEffect(() => {
    if (!open) return;
    setBaseUrlExpanded(false);
    setAdvancedOpen(false);
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
      .catch(() => {
        setProvidersError('服务商列表加载失败');
      })
      .finally(() => setProvidersLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // providers 加载完成后自动选中默认服务商
  useEffect(() => {
    if (providers.length === 0) return;
    if (watch('providerSlug')) return;
    const slug = providers[0].slug;
    setValue('providerSlug', slug);
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
        toast.error(`拉取失败：${data.error}`);
      } else {
        toast.success(`成功拉取 ${list.length} 个模型`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '拉取模型列表失败');
      setModels([]);
    } finally {
      setModelsLoading(false);
    }
  }, [apiType, effectiveBaseUrl, selectedProvider, apiKeyValue, setValue]);

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
        setError('endpointName', { message: '端点名称已存在，请修改' });
        return;
      }

      // 非本地服务商必须填写 API Key（在提交时校验，避免弹窗刚打开就报错）
      const effectiveKey =
        values.apiKeyValue.trim() ||
        (isLocalProvider(selectedProvider) ? localPlaceholderKey(selectedProvider) : '');
      if (!isLocalProvider(selectedProvider) && !effectiveKey) {
        setError('apiKeyValue', { message: 'API Key 不能为空', type: 'manual' });
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
    [selectedProvider, existingNames, onConfirm, onOpenChange, setError]
  );

  const canTest = !!effectiveBaseUrl && (!!apiKeyValue.trim() || isLocalProvider(selectedProvider));

  return (
    <SharedDialog
      open={open}
      onOpenChange={onOpenChange}
      title="添加端点"
      description="配置新的 LLM 端点：服务商、API 地址、API Key、模型、端点名称与模型能力。"
      size="4"
      contentClassName="max-h-[85vh] flex flex-col"
      footer={
        <div className="flex flex-1 items-center justify-between gap-4 flex-wrap">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 rounded-lg border border-border bg-transparent text-foreground text-sm font-medium hover:bg-muted transition-colors"
          >
            取消
          </button>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={testConnection}
              disabled={!canTest || connTesting}
              className="px-4 py-2 rounded-lg border border-border bg-transparent text-foreground text-sm font-medium hover:bg-muted disabled:opacity-50 transition-colors"
            >
              {connTesting ? '测试中…' : '测试连接'}
            </button>
            <button
              type="button"
              onClick={handleSubmit(onValid)}
              className="px-4 py-2 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              确定
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-5 overflow-y-auto min-h-0 flex-1 pr-1">
        {/* 服务商 */}
        <FormField
          label="服务商"
          hint={
            !isCustomOrLocal ? (
              <>
                API 地址：{effectiveBaseUrl || '—'}{' '}
                <button
                  type="button"
                  className="text-accent hover:underline focus:outline-none"
                  onClick={() => setBaseUrlExpanded((v) => !v)}
                >
                  {baseUrlExpanded ? '收起' : '配置'}
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
            placeholder={providersLoading ? '加载中…' : '选择服务商'}
          />
          {providersError && <p className="text-xs text-red-500 mt-1">{providersError}</p>}
        </FormField>

        {/* API 地址 */}
        {showBaseUrl && (
          <FormField
            label="API 地址"
            hint="以 http:// 或 https:// 开头"
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
          label="API Key"
          hint={isLocalProvider(selectedProvider) ? '（本地服务可留空）' : undefined}
          error={errors.apiKeyValue?.message}
        >
          <Input
            type="password"
            {...register('apiKeyValue')}
            placeholder={isLocalProvider(selectedProvider) ? '可选' : '输入调用大模型的 API Key'}
          />
        </FormField>

        {/* 选择模型 */}
        <FormField
          label="选择模型"
          hint={
            <>
              可手动输入或
              <button
                type="button"
                className="text-accent hover:underline ml-0.5 disabled:opacity-50 focus:outline-none"
                onClick={fetchModels}
                disabled={modelsLoading || !effectiveBaseUrl}
              >
                {modelsLoading ? '拉取中…' : '拉取模型列表'}
              </button>
              {models.length > 0 && (
                <span className="text-muted-foreground">（已拉取 {models.length} 个）</span>
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
              placeholder="选择模型 ID"
            />
          ) : (
            <Input
              type="text"
              {...register('selectedModelId')}
              placeholder="例如 gpt-4o、claude-3-5-sonnet"
            />
          )}
        </FormField>

        {/* 端点名称 */}
        <FormField label="端点名称" error={errors.endpointName?.message}>
          <Input
            type="text"
            {...register('endpointName')}
            placeholder={`${selectedProvider?.slug ?? 'ep'}-${selectedModelId || 'model'}`}
          />
        </FormField>

        {/* 模型能力 */}
        <FormField label="模型能力">
          <div className="flex flex-wrap gap-2">
            {CAPABILITY_OPTIONS.map((c) => {
              const on = capSelected.includes(c.k);
              return (
                <button
                  key={c.k}
                  type="button"
                  onClick={() => {
                    const set = new Set(capSelected);
                    if (set.has(c.k)) set.delete(c.k);
                    else set.add(c.k);
                    const out = Array.from(set);
                    setValue('capSelected', out.length ? out : ['text'], { shouldDirty: true });
                  }}
                  className={
                    'inline-flex items-center justify-center h-9 px-4 rounded-lg border text-sm font-medium cursor-pointer transition-colors ' +
                    (on
                      ? 'border-accent bg-accent text-accent-foreground hover:opacity-90'
                      : 'border-border bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground')
                  }
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        </FormField>

        {/* 高级参数 */}
        <div className="rounded-xl border border-border overflow-hidden bg-muted/30">
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="w-full cursor-pointer flex items-center gap-2 px-4 py-3 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors text-left border-0"
          >
            <span
              className="inline-block w-4 h-4 transition-transform duration-200"
              style={{ transform: advancedOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
              aria-hidden
            >
              ▼
            </span>
            高级参数
          </button>
          {advancedOpen && (
            <div className="border-t border-border px-4 py-4 space-y-4 bg-card/50">
              <div className="grid grid-cols-2 gap-4">
                <FormField label="API 类型">
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
                <FormField label="优先级" error={errors.endpointPriority?.message}>
                  <Input
                    type="number"
                    min={1}
                    {...register('endpointPriority', { valueAsNumber: true })}
                  />
                </FormField>
              </div>
              <FormField label="API Key 环境变量名">
                <Input type="text" {...register('apiKeyEnv')} placeholder="例如 OPENAI_API_KEY" />
              </FormField>
              <FormField
                label="最大 Token 数"
                hint="0 表示不限制"
                error={errors.maxTokens?.message}
              >
                <Input type="number" min={0} {...register('maxTokens', { valueAsNumber: true })} />
              </FormField>
              <FormField
                label="上下文窗口"
                hint="建议 1024 以上"
                error={errors.contextWindow?.message}
              >
                <Input
                  type="number"
                  min={1024}
                  {...register('contextWindow', { valueAsNumber: true })}
                />
              </FormField>
              <FormField label="超时（秒）" error={errors.timeoutSec?.message}>
                <Input
                  type="number"
                  min={10}
                  {...register('timeoutSec', { valueAsNumber: true })}
                />
              </FormField>
              <FormField label="RPM 限制" hint="0 表示不限制" error={errors.rpmLimit?.message}>
                <Input type="number" min={0} {...register('rpmLimit', { valueAsNumber: true })} />
              </FormField>
            </div>
          )}
        </div>

        {/* 测试连接结果 */}
        {connTestResult && (
          <div
            className={
              'rounded-lg px-4 py-3 text-sm ' +
              (connTestResult.ok
                ? 'bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
                : 'bg-red-500/10 dark:bg-red-500/20 border border-red-500/30 text-red-700 dark:text-red-400')
            }
          >
            {connTestResult.ok
              ? `连接成功 · ${connTestResult.latencyMs}ms · 模型数：${connTestResult.modelCount ?? 0}`
              : `连接失败：${connTestResult.error ?? '未知'} (${connTestResult.latencyMs}ms)`}
          </div>
        )}
      </div>
    </SharedDialog>
  );
}
