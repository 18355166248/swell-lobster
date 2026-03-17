import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '../../../api/base';

type EndpointItem = {
  name?: string;
  model?: string;
  api_type?: string;
  base_url?: string;
  api_key_env?: string;
  priority?: number;
  enabled?: boolean;
};

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

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-stone-600">加载中...</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-bold text-stone-800">LLM 端点</h1>
      <p className="mt-1 text-stone-600 text-sm">配置 AI 模型端点，支持主备自动切换</p>
      {error && (
        <div className="mt-3 px-3 py-2 bg-red-50 text-red-700 rounded text-sm">{error}</div>
      )}

      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-stone-800">主端点</h2>
        <button
          type="button"
          className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
        >
          + 添加端点
        </button>
      </div>
      <div className="mt-2 border border-stone-200 rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-stone-100 text-left">
            <tr>
              <th className="px-3 py-2 font-medium text-stone-700">端点</th>
              <th className="px-3 py-2 font-medium text-stone-700">模型</th>
              <th className="px-3 py-2 font-medium text-stone-700">Key</th>
              <th className="px-3 py-2 font-medium text-stone-700">Priority</th>
            </tr>
          </thead>
          <tbody>
            {endpoints.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-stone-500 text-center">
                  暂无端点，点击上方按钮添加
                </td>
              </tr>
            ) : (
              endpoints.map((ep, i) => (
                <tr key={i} className="border-t border-stone-200">
                  <td className="px-3 py-2">{ep.name ?? '-'}</td>
                  <td className="px-3 py-2">{ep.model ?? '-'}</td>
                  <td className="px-3 py-2">
                    {ep.api_key_env ? (
                      <span
                        className="inline-block w-2 h-2 rounded-full bg-green-500"
                        title="已配置"
                      />
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="px-3 py-2">{ep.priority ?? 1}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold text-stone-800">提示词编译模型</h2>
        <p className="mt-1 text-stone-600 text-sm">用于预处理指令的轻量模型，建议使用快速小模型</p>
        <div className="mt-2 px-4 py-6 border border-dashed border-stone-200 rounded text-center text-stone-500 text-sm">
          暂无端点，点击上方「+ 添加端点」添加
        </div>
      </div>

      <div className="mt-6">
        <h2 className="text-lg font-semibold text-stone-800">语音识别端点 (STT)</h2>
        <p className="mt-1 text-stone-600 text-sm">
          在线语音识别服务，支持 OpenAI Whisper / DashScope 等
        </p>
        <div className="mt-2 px-4 py-6 border border-dashed border-stone-200 rounded text-center text-stone-500 text-sm">
          暂无端点，点击上方「+ 添加端点」添加
        </div>
      </div>

      <div className="mt-8 flex gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 border border-stone-300 text-stone-700 rounded hover:bg-stone-100 disabled:opacity-50"
        >
          {saving ? '保存中...' : '保存配置'}
        </button>
        <button
          type="button"
          onClick={handleApplyRestart}
          disabled={reloading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {reloading ? '应用中...' : '应用并重启'}
        </button>
      </div>
    </div>
  );
}
