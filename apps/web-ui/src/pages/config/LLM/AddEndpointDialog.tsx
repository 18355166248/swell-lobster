import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiPost } from '../../../api/base';
import { Input, Select, SharedDialog } from '../../../components/ui';
import { BUILTIN_PROVIDERS, CAPABILITY_OPTIONS } from './constants';
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
  const [providerSlug, setProviderSlug] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [baseUrlTouched, setBaseUrlTouched] = useState(false);
  const [apiKeyValue, setApiKeyValue] = useState('');
  const [apiKeyEnv, setApiKeyEnv] = useState('');
  const [apiKeyEnvTouched, setApiKeyEnvTouched] = useState(false);
  const [apiType, setApiType] = useState<'openai' | 'anthropic'>('openai');
  const [selectedModelId, setSelectedModelId] = useState('');
  const [endpointName, setEndpointName] = useState('');
  const [endpointNameTouched, setEndpointNameTouched] = useState(false);
  const [capSelected, setCapSelected] = useState<string[]>(['text']);
  const [endpointPriority, setEndpointPriority] = useState(1);
  const [maxTokens, setMaxTokens] = useState(0);
  const [contextWindow, setContextWindow] = useState(DEFAULT_CONTEXT_WINDOW);
  const [timeoutSec, setTimeoutSec] = useState(DEFAULT_TIMEOUT);
  const [rpmLimit, setRpmLimit] = useState(0);
  const [baseUrlExpanded, setBaseUrlExpanded] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [models, setModels] = useState<ListedModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [connTesting, setConnTesting] = useState(false);
  const [connTestResult, setConnTestResult] = useState<{
    ok: boolean;
    latencyMs: number;
    error?: string;
    modelCount?: number;
  } | null>(null);

  const providers = BUILTIN_PROVIDERS;
  const selectedProvider = useMemo(
    () => providers.find((p) => p.slug === providerSlug) ?? providers[0] ?? null,
    [providers, providerSlug]
  );

  const isCustomOrLocal =
    selectedProvider && ['custom', 'ollama', 'lmstudio'].includes(selectedProvider.slug);
  const showBaseUrl = isCustomOrLocal || baseUrlExpanded;

  // 初始化默认服务商
  useEffect(() => {
    if (open && providers.length > 0 && !providerSlug) {
      const defaultSlug =
        providers.find((p) => p.slug === 'openai')?.slug ?? providers[0]?.slug ?? '';
      setProviderSlug(defaultSlug);
    }
  }, [open, providers, providerSlug]);

  // 随服务商更新 base_url / api_type / api_key_env 建议
  useEffect(() => {
    if (!selectedProvider) return;
    setApiType((selectedProvider.api_type as 'openai' | 'anthropic') || 'openai');
    if (!baseUrlTouched) setBaseUrl(selectedProvider.default_base_url || '');
    setContextWindow(DEFAULT_CONTEXT_WINDOW);
    if (!apiKeyEnvTouched) {
      const used = new Set(existingNames);
      let suggestion =
        selectedProvider.api_key_env_suggestion ||
        `LLM_API_KEY_${selectedProvider.slug.toUpperCase()}`;
      while (used.has(suggestion)) {
        suggestion = `${suggestion}_2`;
      }
      setApiKeyEnv(suggestion);
    }
    if (isLocalProvider(selectedProvider) && !apiKeyValue.trim()) {
      setApiKeyValue(localPlaceholderKey(selectedProvider));
    }
  }, [selectedProvider, baseUrlTouched, apiKeyEnvTouched, existingNames, apiKeyValue]);

  // 建议端点名称：服务商-模型
  useEffect(() => {
    if (!endpointNameTouched && selectedProvider && selectedModelId) {
      const name = `${selectedProvider.slug}-${selectedModelId}`.slice(0, 64);
      setEndpointName(name);
    }
  }, [selectedProvider, selectedModelId, endpointNameTouched]);

  // 默认 priority
  useEffect(() => {
    if (open) {
      setEndpointPriority(endpointCount === 0 ? 1 : endpointCount + 1);
    }
  }, [open, endpointCount]);

  const fetchModels = useCallback(async () => {
    const effectiveKey =
      apiKeyValue.trim() ||
      (isLocalProvider(selectedProvider) ? localPlaceholderKey(selectedProvider) : '');
    setModelsLoading(true);
    setModels([]);
    setSelectedModelId('');
    try {
      const data = await apiPost<{ models?: ListedModel[]; error?: string }>(
        '/api/config/list-models',
        {
          api_type: apiType,
          base_url: baseUrl.trim() || selectedProvider?.default_base_url || '',
          provider_slug: selectedProvider?.slug ?? null,
          api_key: effectiveKey,
        }
      );
      const list = Array.isArray(data.models) ? data.models : [];
      setModels(list);
    } catch (e) {
      setModels([]);
    } finally {
      setModelsLoading(false);
    }
  }, [apiType, baseUrl, selectedProvider, apiKeyValue]);

  const testConnection = useCallback(async () => {
    const effectiveKey =
      apiKeyValue.trim() ||
      (isLocalProvider(selectedProvider) ? localPlaceholderKey(selectedProvider) : '');
    const url = baseUrl.trim() || selectedProvider?.default_base_url || '';
    setConnTesting(true);
    setConnTestResult(null);
    const t0 = performance.now();
    try {
      const data = await apiPost<{ models?: unknown[]; error?: string }>(
        '/api/config/list-models',
        {
          api_type: apiType,
          base_url: url,
          provider_slug: selectedProvider?.slug ?? null,
          api_key: effectiveKey,
        }
      );
      const latency = Math.round(performance.now() - t0);
      if (data.error) {
        setConnTestResult({ ok: false, latencyMs: latency, error: data.error });
      } else {
        const modelCount = Array.isArray(data.models) ? data.models.length : 0;
        setConnTestResult({ ok: true, latencyMs: latency, modelCount });
      }
    } catch (e) {
      const latency = Math.round(performance.now() - t0);
      setConnTestResult({
        ok: false,
        latencyMs: latency,
        error: e instanceof Error ? e.message : '请求失败',
      });
    } finally {
      setConnTesting(false);
    }
  }, [apiType, baseUrl, selectedProvider, apiKeyValue]);

  const handleSubmit = useCallback(() => {
    const effectiveKey =
      apiKeyValue.trim() ||
      (isLocalProvider(selectedProvider) ? localPlaceholderKey(selectedProvider) : '');
    const url = baseUrl.trim() || selectedProvider?.default_base_url || '';
    const name =
      endpointName.trim() || `${selectedProvider?.slug ?? 'ep'}-${selectedModelId}`.slice(0, 64);
    if (existingNames.includes(name)) {
      return;
    }
    const keyEnv =
      apiKeyEnv.trim() || `LLM_API_KEY_${selectedProvider?.slug ?? 'custom'}`.toUpperCase();
    const payload: EndpointFormData = {
      name,
      model: selectedModelId.trim(),
      api_type: apiType,
      base_url: url,
      api_key_env: keyEnv,
      api_key_value: effectiveKey && !isLocalProvider(selectedProvider) ? effectiveKey : undefined,
      priority: Math.max(1, endpointPriority),
      enabled: true,
      provider: selectedProvider?.slug,
      capabilities: capSelected.length ? capSelected : ['text'],
      max_tokens: Math.max(0, maxTokens),
      context_window: Math.max(1024, contextWindow),
      timeout: Math.max(10, timeoutSec),
      rpm_limit: Math.max(0, rpmLimit),
    };
    onConfirm(payload);
    onOpenChange(false);
  }, [
    apiKeyValue,
    selectedProvider,
    baseUrl,
    endpointName,
    selectedModelId,
    apiType,
    apiKeyEnv,
    endpointPriority,
    capSelected,
    maxTokens,
    contextWindow,
    timeoutSec,
    rpmLimit,
    existingNames,
    onConfirm,
    onOpenChange,
  ]);

  const missing: string[] = [];
  const effectiveBaseUrl = baseUrl.trim() || selectedProvider?.default_base_url || '';
  if (!effectiveBaseUrl) missing.push('API 地址');
  if (!isLocalProvider(selectedProvider) && !apiKeyValue.trim()) missing.push('API Key');
  if (!selectedModelId.trim()) missing.push('模型');
  const canSubmit = missing.length === 0;
  const canTest = !!effectiveBaseUrl && (!!apiKeyValue.trim() || isLocalProvider(selectedProvider));

  const resetForm = useCallback(() => {
    setProviderSlug(providers[0]?.slug ?? '');
    setBaseUrl('');
    setBaseUrlTouched(false);
    setApiKeyValue('');
    setApiKeyEnv('');
    setApiKeyEnvTouched(false);
    setEndpointName('');
    setEndpointNameTouched(false);
    setSelectedModelId('');
    setModels([]);
    setCapSelected(['text']);
    setEndpointPriority(endpointCount === 0 ? 1 : endpointCount + 1);
    setMaxTokens(0);
    setContextWindow(DEFAULT_CONTEXT_WINDOW);
    setTimeoutSec(DEFAULT_TIMEOUT);
    setRpmLimit(0);
    setConnTestResult(null);
    setAdvancedOpen(false);
    setBaseUrlExpanded(false);
  }, [providers, endpointCount]);

  useEffect(() => {
    if (!open) return;
    resetForm();
  }, [open, resetForm]);

  const labelClass = 'block text-sm font-medium text-foreground';
  const hintClass = 'text-xs text-muted-foreground';

  return (
    <SharedDialog
      open={open}
      onOpenChange={onOpenChange}
      title="添加端点"
      description="配置新的 LLM 端点：服务商、API 地址、API Key、模型、端点名称与模型能力。"
      size="4"
      contentClassName="max-h-[85vh] flex flex-col"
      footer={
        <>
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
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="px-4 py-2 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                确定
              </button>
            </div>
          </div>
          {missing.length > 0 && (
            <p className={`text-xs ${hintClass} text-right mt-1`}>缺少：{missing.join('、')}</p>
          )}
        </>
      }
    >
      <div className="space-y-5 overflow-y-auto min-h-0 flex-1 pr-1">
        {/* 服务商 */}
        <div className="space-y-2">
          <label className={labelClass}>
            服务商
            {!isCustomOrLocal && (
              <span className={`ml-1.5 ${hintClass}`}>
                API 地址：{effectiveBaseUrl || '—'}{' '}
                <button
                  type="button"
                  className="text-accent hover:underline focus:outline-none"
                  onClick={() => setBaseUrlExpanded((v) => !v)}
                >
                  {baseUrlExpanded ? '收起' : '配置'}
                </button>
              </span>
            )}
          </label>
          <Select
            value={providerSlug}
            onValueChange={(v) => {
              setProviderSlug(v);
              setBaseUrlExpanded(false);
            }}
            options={providers.map((p) => ({ value: p.slug, label: p.name }))}
          />
        </div>

        {/* API 地址 */}
        {showBaseUrl && (
          <div className="space-y-2">
            <label className={labelClass}>
              API 地址 <span className={hintClass}>以 http:// 或 https:// 开头</span>
            </label>
            <Input
              type="url"
              value={baseUrl}
              onChange={(e) => {
                setBaseUrl(e.target.value);
                setBaseUrlTouched(true);
              }}
              placeholder={selectedProvider?.default_base_url || 'https://api.example.com/v1'}
            />
          </div>
        )}

        {/* API Key */}
        <div className="space-y-2">
          <label className={labelClass}>
            API Key
            {isLocalProvider(selectedProvider) && (
              <span className={`ml-1 ${hintClass}`}>（本地服务可留空）</span>
            )}
          </label>
          <Input
            type="password"
            value={apiKeyValue}
            onChange={(e) => setApiKeyValue(e.target.value)}
            placeholder={isLocalProvider(selectedProvider) ? '可选' : '输入调用大模型的 API Key'}
          />
        </div>

        {/* 选择模型 */}
        <div className="space-y-2">
          <label className={labelClass}>
            选择模型{' '}
            <span className={hintClass}>
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
            </span>
          </label>
          <Input
            type="text"
            value={selectedModelId}
            onChange={(e) => setSelectedModelId(e.target.value)}
            list="add-ep-model-list"
            placeholder={models.length > 0 ? '输入或选择模型 ID' : '例如 gpt-4o、claude-3-5-sonnet'}
          />
          <datalist id="add-ep-model-list">
            {models.map((m) => (
              <option key={m.id} value={m.id} />
            ))}
          </datalist>
        </div>

        {/* 端点名称 */}
        <div className="space-y-2">
          <label className={labelClass}>端点名称</label>
          <Input
            type="text"
            value={endpointName}
            onChange={(e) => {
              setEndpointNameTouched(true);
              setEndpointName(e.target.value);
            }}
            placeholder={`${selectedProvider?.slug ?? 'ep'}-${selectedModelId || 'model'}`}
          />
        </div>

        {/* 模型能力 */}
        <div className="space-y-2">
          <label className={labelClass}>模型能力</label>
          <div className="flex flex-wrap gap-2">
            {CAPABILITY_OPTIONS.map((c) => {
              const on = capSelected.includes(c.k);
              return (
                <button
                  key={c.k}
                  type="button"
                  onClick={() => {
                    setCapSelected((prev) => {
                      const set = new Set(prev);
                      if (set.has(c.k)) set.delete(c.k);
                      else set.add(c.k);
                      const out = Array.from(set);
                      return out.length ? out : ['text'];
                    });
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
        </div>

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
                <div className="space-y-2">
                  <label className={labelClass}>API 类型</label>
                  <Select
                    value={apiType}
                    onValueChange={(v) => setApiType(v as 'openai' | 'anthropic')}
                    options={[
                      { value: 'openai', label: 'openai' },
                      { value: 'anthropic', label: 'anthropic' },
                    ]}
                  />
                </div>
                <div className="space-y-2">
                  <label className={labelClass}>优先级</label>
                  <Input
                    type="number"
                    min={1}
                    value={endpointPriority}
                    onChange={(e) => setEndpointPriority(Number(e.target.value) || 1)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className={labelClass}>API Key 环境变量名</label>
                <Input
                  type="text"
                  value={apiKeyEnv}
                  onChange={(e) => {
                    setApiKeyEnvTouched(true);
                    setApiKeyEnv(e.target.value);
                  }}
                  placeholder="例如 OPENAI_API_KEY"
                />
              </div>
              <div className="space-y-2">
                <label className={labelClass}>
                  最大 Token 数 <span className={hintClass}>0 表示不限制</span>
                </label>
                <Input
                  type="number"
                  min={0}
                  value={maxTokens || ''}
                  onChange={(e) => setMaxTokens(Math.max(0, parseInt(e.target.value, 10) || 0))}
                />
              </div>
              <div className="space-y-2">
                <label className={labelClass}>
                  上下文窗口 <span className={hintClass}>建议 1024 以上</span>
                </label>
                <Input
                  type="number"
                  min={1024}
                  value={contextWindow}
                  onChange={(e) =>
                    setContextWindow(
                      Math.max(1024, parseInt(e.target.value, 10) || DEFAULT_CONTEXT_WINDOW)
                    )
                  }
                />
              </div>
              <div className="space-y-2">
                <label className={labelClass}>超时（秒）</label>
                <Input
                  type="number"
                  min={10}
                  value={timeoutSec}
                  onChange={(e) =>
                    setTimeoutSec(Math.max(10, parseInt(e.target.value, 10) || DEFAULT_TIMEOUT))
                  }
                />
              </div>
              <div className="space-y-2">
                <label className={labelClass}>
                  RPM 限制 <span className={hintClass}>0 表示不限制</span>
                </label>
                <Input
                  type="number"
                  min={0}
                  value={rpmLimit || ''}
                  onChange={(e) => setRpmLimit(Math.max(0, parseInt(e.target.value, 10) || 0))}
                />
              </div>
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
