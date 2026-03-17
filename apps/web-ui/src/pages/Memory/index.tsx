import { useEffect, useState } from 'react';
import { apiGet } from '../../api/base';

export function MemoryPage() {
  const [memories, setMemories] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ memories: unknown[] }>('/api/memories')
      .then((data) => setMemories(data.memories ?? []))
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
      <h1 className="text-2xl font-bold text-stone-800">记忆管理</h1>
      <p className="mt-1 text-stone-600 text-sm">记忆列表与编辑/审查</p>
      {error && (
        <div className="mt-3 px-3 py-2 bg-red-50 text-red-700 rounded text-sm">{error}</div>
      )}
      <div className="mt-6 border border-stone-200 rounded overflow-hidden">
        {memories.length === 0 ? (
          <div className="px-4 py-8 text-stone-500 text-sm text-center">暂无记忆数据</div>
        ) : (
          <ul className="divide-y divide-stone-200">
            {memories.map((_, i) => (
              <li key={i} className="px-4 py-3 text-stone-800 text-sm" />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
