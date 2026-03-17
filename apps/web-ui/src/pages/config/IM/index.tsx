import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '../../../api/base';

type EnvMap = Record<string, string>;

export function ConfigIMPage() {
  const [env, setEnv] = useState<EnvMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ env: EnvMap }>('/api/config/env');
      setEnv(data.env ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
      setEnv({});
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
      await apiPost('/api/config/env', { entries: env });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
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
      <h1 className="text-2xl font-bold text-stone-800">IM 通道</h1>
      <p className="mt-1 text-stone-600 text-sm">
        启用通道开关，然后在「消息通道 → Bot 配置」中添加和管理 Bot
      </p>
      {error && (
        <div className="mt-3 px-3 py-2 bg-red-50 text-red-700 rounded text-sm">{error}</div>
      )}
      <div className="mt-6 border border-stone-200 rounded overflow-hidden">
        <div className="px-4 py-3 bg-stone-50 text-sm text-stone-600">
          环境变量（.env）中与 IM 相关的配置将在此展示，当前为只读预览；完整编辑可在高级配置或 .env
          文件中进行。
        </div>
        {Object.keys(env).length === 0 ? (
          <div className="px-4 py-6 text-stone-500 text-sm text-center">
            暂无环境变量或 .env 不存在
          </div>
        ) : (
          <ul className="divide-y divide-stone-200">
            {Object.entries(env).map(([k, v]) => (
              <li key={k} className="px-4 py-2 flex justify-between text-sm">
                <span className="font-mono text-stone-700">{k}</span>
                <span className="text-stone-500 truncate max-w-[60%]">{v}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-6">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? '保存中...' : '保存配置'}
        </button>
      </div>
    </div>
  );
}
