import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '../../../api/base';

export function ConfigToolsPage() {
  const [skills, setSkills] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ skills: Record<string, unknown> }>('/api/config/skills');
      setSkills(data.skills ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
      setSkills({});
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
      await apiPost('/api/config/skills', { content: skills });
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
      <h1 className="text-2xl font-bold text-stone-800">工具与技能</h1>
      <p className="mt-1 text-stone-600 text-sm">Skills / MCP / 桌面自动化配置</p>
      {error && (
        <div className="mt-3 px-3 py-2 bg-red-50 text-red-700 rounded text-sm">{error}</div>
      )}
      <div className="mt-6 border border-stone-200 rounded overflow-hidden">
        <div className="px-4 py-3 bg-stone-50 text-sm text-stone-600">
          技能配置（data/skills.json）。与主菜单「技能」共享数据源。
        </div>
        {Object.keys(skills).length === 0 ? (
          <div className="px-4 py-6 text-stone-500 text-sm text-center">暂无技能配置</div>
        ) : (
          <pre className="p-4 text-xs overflow-auto max-h-64 bg-stone-50 text-stone-700">
            {JSON.stringify(skills, null, 2)}
          </pre>
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
