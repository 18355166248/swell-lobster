import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '../../../api/base';

export function ConfigAdvancedPage() {
  const [disabledViews, setDisabledViews] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ disabled_views: string[] }>('/api/config/disabled-views');
      setDisabledViews(data.disabled_views ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
      setDisabledViews([]);
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
      await apiPost('/api/config/disabled-views', { views: disabledViews });
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
      <h1 className="text-2xl font-bold text-stone-800">高级配置</h1>
      <p className="mt-1 text-stone-600 text-sm">隐藏模块开关、诊断、日志、清理等</p>
      {error && (
        <div className="mt-3 px-3 py-2 bg-red-50 text-red-700 rounded text-sm">{error}</div>
      )}
      <div className="mt-6">
        <h2 className="text-lg font-semibold text-stone-800">隐藏模块</h2>
        <p className="mt-1 text-stone-600 text-sm">
          在此配置的模块将不在侧栏显示（如 skills、im、token_stats 等）
        </p>
        <div className="mt-2 text-sm text-stone-500">
          当前已隐藏：{disabledViews.length ? disabledViews.join(', ') : '无'}
        </div>
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
