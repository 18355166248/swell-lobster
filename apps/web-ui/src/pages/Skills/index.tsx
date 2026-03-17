import { useEffect, useState } from 'react';
import { apiGet } from '../../api/base';

export function SkillsPage() {
  const [skills, setSkills] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ skills: unknown[] }>('/api/skills')
      .then((data) => setSkills(data.skills ?? []))
      .catch((e) => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-stone-600">加载中...</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-bold text-stone-800">技能</h1>
      <p className="mt-1 text-stone-600 text-sm">技能管理：列表、启用/禁用、安装/卸载</p>
      {error && (
        <div className="mt-3 px-3 py-2 bg-red-50 text-red-700 rounded text-sm">{error}</div>
      )}
      <div className="mt-6 border border-stone-200 rounded overflow-hidden">
        {skills.length === 0 ? (
          <div className="px-4 py-8 text-stone-500 text-sm text-center">
            暂无技能，可在「配置 → 工具与技能」中配置
          </div>
        ) : (
          <ul className="divide-y divide-stone-200">
            {skills.map((s, i) => (
              <li key={i} className="px-4 py-3 text-stone-800 text-sm">
                {typeof s === 'object' && s && 'name' in s
                  ? String((s as { name: string }).name)
                  : String(s)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
