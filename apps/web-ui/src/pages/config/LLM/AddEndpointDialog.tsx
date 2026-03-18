import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiPost } from '../../../api/base';
import { SharedDialog } from '../../../components/ui';
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
  const [capTouched, setCapTouched] = useState(false);
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
    setCapTouched(false);
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
              className="px-3 py-1.5 border border-stone-300 text-stone-700 rounded hover:bg-stone-100 text-sm"
            >
              取消
            </button>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={testConnection}
                disabled={!canTest || connTesting}
                className="px-3 py-1.5 border border-stone-300 text-stone-700 rounded hover:bg-stone-100 text-sm disabled:opacity-50"
              >
                {connTesting ? '测试中…' : '测试连接'}
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm disabled:opacity-50"
              >
                确定
              </button>
            </div>
          </div>
          {missing.length > 0 && (
            <p className="text-[10px] text-stone-500 w-full text-right mt-1">
              缺少：{missing.join('、')}
            </p>
          )}
        </>
      }
    >
      <div className="space-y-4 overflow-y-auto min-h-0 flex-1 pr-1">
        {/* 服务商 */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-stone-800">
            服务商
            {!isCustomOrLocal && (
              <span className="ml-1.5 text-[11px] font-normal text-stone-500">
                API 地址：{effectiveBaseUrl || '—'}{' '}
                <button
                  type="button"
                  className="text-blue-600 hover:underline"
                  onClick={() => setBaseUrlExpanded((v) => !v)}
                >
                  {baseUrlExpanded ? '收起' : '配置'}
                </button>
              </span>
            )}
          </label>
          <select
            value={providerSlug}
            onChange={(e) => {
              setProviderSlug(e.target.value);
              setBaseUrlExpanded(false);
            }}
            className="w-full px-3 py-2 border border-stone-300 rounded text-sm bg-white text-stone-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {providers.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* API 地址 */}
        {showBaseUrl && (
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-stone-800">
              API 地址{' '}
              <span className="text-[11px] font-normal text-stone-500">
                以 http:// 或 https:// 开头
              </span>
            </label>
            <input
              type="url"
              value={baseUrl}
              onChange={(e) => {
                setBaseUrl(e.target.value);
                setBaseUrlTouched(true);
              }}
              placeholder={selectedProvider?.default_base_url || 'https://api.example.com/v1'}
              className="w-full px-3 py-2 border border-stone-300 rounded text-sm bg-white text-stone-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}

        {/* API Key */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-stone-800">
            API Key
            {isLocalProvider(selectedProvider) && (
              <span className="ml-1 text-[11px] font-normal text-stone-500">
                （本地服务可留空）
              </span>
            )}
          </label>
          <input
            type="password"
            value={apiKeyValue}
            onChange={(e) => setApiKeyValue(e.target.value)}
            placeholder={isLocalProvider(selectedProvider) ? '可选' : '输入调用大模型的 API Key'}
            className="w-full px-3 py-2 border border-stone-300 rounded text-sm bg-white text-stone-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* 选择模型 */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-stone-800">
            选择模型{' '}
            <span className="text-[11px] font-normal text-stone-500">
              可手动输入或
              <button
                type="button"
                className="text-blue-600 hover:underline ml-0.5 disabled:opacity-50"
                onClick={fetchModels}
                disabled={modelsLoading || !effectiveBaseUrl}
              >
                {modelsLoading ? '拉取中…' : '拉取模型列表'}
              </button>
              {models.length > 0 && (
                <span className="text-stone-400">（已拉取 {models.length} 个）</span>
              )}
            </span>
          </label>
          <input
            type="text"
            value={selectedModelId}
            onChange={(e) => setSelectedModelId(e.target.value)}
            list="add-ep-model-list"
            placeholder={models.length > 0 ? '输入或选择模型 ID' : '例如 gpt-4o、claude-3-5-sonnet'}
            className="w-full px-3 py-2 border border-stone-300 rounded text-sm bg-white text-stone-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <datalist id="add-ep-model-list">
            {models.map((m) => (
              <option key={m.id} value={m.id} />
            ))}
          </datalist>
        </div>

        {/* 端点名称 */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-stone-800">端点名称</label>
          <input
            type="text"
            value={endpointName}
            onChange={(e) => {
              setEndpointNameTouched(true);
              setEndpointName(e.target.value);
            }}
            placeholder={`${selectedProvider?.slug ?? 'ep'}-${selectedModelId || 'model'}`}
            className="w-full px-3 py-2 border border-stone-300 rounded text-sm bg-white text-stone-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* 模型能力 */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-stone-800">模型能力</label>
          <div className="flex flex-wrap gap-2">
            {CAPABILITY_OPTIONS.map((c) => {
              const on = capSelected.includes(c.k);
              return (
                <button
                  key={c.k}
                  type="button"
                  onClick={() => {
                    setCapTouched(true);
                    setCapSelected((prev) => {
                      const set = new Set(prev);
                      if (set.has(c.k)) set.delete(c.k);
                      else set.add(c.k);
                      const out = Array.from(set);
                      return out.length ? out : ['text'];
                    });
                  }}
                  className={
                    'inline-flex items-center justify-center h-8 px-3.5 rounded-md border text-sm font-medium cursor-pointer transition-colors ' +
                    (on
                      ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700'
                      : 'border-stone-300 bg-transparent text-stone-600 hover:bg-stone-100')
                  }
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* 高级参数 */}
        <div className="rounded-lg border border-stone-200 overflow-hidden">
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="w-full cursor-pointer flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-stone-600 list-none select-none hover:text-stone-800 text-left bg-transparent border-0"
          >
            <span
              className="inline-block w-4 h-4 transition-transform"
              style={{ transform: advancedOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
            >
              ▼
            </span>
            高级参数
          </button>
          {advancedOpen && (
            <div className="border-t border-stone-200 px-4 py-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-stone-700">API 类型</label>
                  <select
                    value={apiType}
                    onChange={(e) => setApiType(e.target.value as 'openai' | 'anthropic')}
                    className="w-full px-3 py-2 border border-stone-300 rounded text-sm bg-white text-stone-800"
                  >
                    <option value="openai">openai</option>
                    <option value="anthropic">anthropic</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-stone-700">优先级</label>
                  <input
                    type="number"
                    min={1}
                    value={endpointPriority}
                    onChange={(e) => setEndpointPriority(Number(e.target.value) || 1)}
                    className="w-full px-3 py-2 border border-stone-300 rounded text-sm bg-white text-stone-800"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-stone-700">
                  API Key 环境变量名
                </label>
                <input
                  type="text"
                  value={apiKeyEnv}
                  onChange={(e) => {
                    setApiKeyEnvTouched(true);
                    setApiKeyEnv(e.target.value);
                  }}
                  placeholder="例如 OPENAI_API_KEY"
                  className="w-full px-3 py-2 border border-stone-300 rounded text-sm bg-white text-stone-800"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-stone-700">
                  最大 Token 数{' '}
                  <span className="text-[11px] font-normal text-stone-500">0 表示不限制</span>
                </label>
                <input
                  type="number"
                  min={0}
                  value={maxTokens || ''}
                  onChange={(e) => setMaxTokens(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="w-full px-3 py-2 border border-stone-300 rounded text-sm bg-white text-stone-800"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-stone-700">
                  上下文窗口{' '}
                  <span className="text-[11px] font-normal text-stone-500">建议 1024 以上</span>
                </label>
                <input
                  type="number"
                  min={1024}
                  value={contextWindow}
                  onChange={(e) =>
                    setContextWindow(
                      Math.max(1024, parseInt(e.target.value, 10) || DEFAULT_CONTEXT_WINDOW)
                    )
                  }
                  className="w-full px-3 py-2 border border-stone-300 rounded text-sm bg-white text-stone-800"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-stone-700">超时（秒）</label>
                <input
                  type="number"
                  min={10}
                  value={timeoutSec}
                  onChange={(e) =>
                    setTimeoutSec(Math.max(10, parseInt(e.target.value, 10) || DEFAULT_TIMEOUT))
                  }
                  className="w-full px-3 py-2 border border-stone-300 rounded text-sm bg-white text-stone-800"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-stone-700">
                  RPM 限制{' '}
                  <span className="text-[11px] font-normal text-stone-500">0 表示不限制</span>
                </label>
                <input
                  type="number"
                  min={0}
                  value={rpmLimit || ''}
                  onChange={(e) => setRpmLimit(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="w-full px-3 py-2 border border-stone-300 rounded text-sm bg-white text-stone-800"
                />
              </div>
            </div>
          )}
        </div>

        {/* 测试连接结果 */}
        {connTestResult && (
          <div
            className={
              'rounded-lg px-3 py-2 text-xs ' +
              (connTestResult.ok
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                : 'bg-red-50 border border-red-200 text-red-700')
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
