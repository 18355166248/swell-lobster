import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost } from '../../../api/base';
import { AddEndpointDialog } from './AddEndpointDialog';
import type { EndpointFormData, EndpointItem } from './types';

type EndpointsResponse = {
  endpoints: EndpointItem[];
  raw?: {
    endpoints?: EndpointItem[];
    compiler_endpoints?: EndpointItem[];
    stt_endpoints?: EndpointItem[];
  };
};

export function ConfigLLMPage() {
  const [endpoints, setEndpoints] = useState<EndpointItem[]>([]);
  const [raw, setRaw] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [addEndpointOpen, setAddEndpointOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<EndpointsResponse>('/api/config/endpoints');
      setEndpoints(data.endpoints ?? []);
      setRaw((data.raw as Record<string, unknown>) ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
      setEndpoints([]);
      setRaw({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiPost('/api/config/endpoints', { content: { ...raw, endpoints } });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleApplyRestart = async () => {
    setReloading(true);
    setError(null);
    try {
      await apiPost('/api/config/reload', {});
    } catch (e) {
      setError(e instanceof Error ? e.message : '应用失败');
    } finally {
      setReloading(false);
    }
  };

  const handleAddEndpoint = useCallback(async (data: EndpointFormData) => {
    setError(null);
    if (data.api_key_value && data.api_key_env) {
      try {
        await apiPost('/api/config/env', { entries: { [data.api_key_env]: data.api_key_value } });
      } catch (e) {
        setError(e instanceof Error ? e.message : '写入 API Key 失败');
      }
    }
    const newItem: EndpointItem = {
      name: data.name,
      model: data.model,
      api_type: data.api_type,
      base_url: data.base_url,
      api_key_env: data.api_key_env,
      priority: data.priority,
      enabled: data.enabled !== false,
      provider: data.provider,
      capabilities: data.capabilities,
      max_tokens: data.max_tokens,
      context_window: data.context_window,
      timeout: data.timeout,
      rpm_limit: data.rpm_limit,
    };
    setEndpoints((prev) =>
      [...prev, newItem].sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999))
    );
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">加载中...</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-bold text-foreground">LLM 端点</h1>
      <p className="mt-1 text-muted-foreground text-sm">配置 AI 模型端点，支持主备自动切换</p>
      {error && (
        <div className="mt-3 px-3 py-2 bg-red-500/10 dark:bg-red-500/20 border border-red-500/30 text-red-700 dark:text-red-400 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">主端点</h2>
        <button
          type="button"
          onClick={() => setAddEndpointOpen(true)}
          className="px-4 py-2 bg-accent text-accent-foreground text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
        >
          + 添加端点
        </button>
        <AddEndpointDialog
          open={addEndpointOpen}
          onOpenChange={setAddEndpointOpen}
          onConfirm={handleAddEndpoint}
          existingNames={endpoints.map((e) => String(e.name ?? '')).filter(Boolean)}
          endpointCount={endpoints.length}
        />
      </div>
      <div className="mt-2 border border-border rounded-xl overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left">
            <tr>
              <th className="px-4 py-3 font-medium text-foreground">端点</th>
              <th className="px-4 py-3 font-medium text-foreground">模型</th>
              <th className="px-4 py-3 font-medium text-foreground">Key</th>
              <th className="px-4 py-3 font-medium text-foreground">Priority</th>
            </tr>
          </thead>
          <tbody>
            {endpoints.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-muted-foreground text-center">
                  暂无端点，点击上方按钮添加
                </td>
              </tr>
            ) : (
              endpoints.map((ep, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-4 py-3 text-foreground">{ep.name ?? '-'}</td>
                  <td className="px-4 py-3 text-foreground">{ep.model ?? '-'}</td>
                  <td className="px-4 py-3">
                    {ep.api_key_env ? (
                      <span
                        className="inline-block w-2 h-2 rounded-full bg-green-500"
                        title="已配置"
                      />
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-foreground">{ep.priority ?? 1}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold text-foreground">提示词编译模型</h2>
        <p className="mt-1 text-muted-foreground text-sm">
          用于预处理指令的轻量模型，建议使用快速小模型
        </p>
        <div className="mt-2 px-4 py-6 border border-dashed border-border rounded-xl text-center text-muted-foreground text-sm">
          暂无端点，点击上方「+ 添加端点」添加
        </div>
      </div>

      <div className="mt-6">
        <h2 className="text-lg font-semibold text-foreground">语音识别端点 (STT)</h2>
        <p className="mt-1 text-muted-foreground text-sm">
          在线语音识别服务，支持 OpenAI Whisper / DashScope 等
        </p>
        <div className="mt-2 px-4 py-6 border border-dashed border-border rounded-xl text-center text-muted-foreground text-sm">
          暂无端点，点击上方「+ 添加端点」添加
        </div>
      </div>

      <div className="mt-8 flex gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 border border-border bg-transparent text-foreground rounded-lg font-medium hover:bg-muted disabled:opacity-50 transition-colors"
        >
          {saving ? '保存中...' : '保存配置'}
        </button>
        <button
          type="button"
          onClick={handleApplyRestart}
          disabled={reloading}
          className="px-4 py-2 bg-accent text-accent-foreground rounded-lg font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {reloading ? '应用中...' : '应用并重启'}
        </button>
      </div>
    </div>
  );
}
