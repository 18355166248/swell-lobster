import { useEffect, useState } from 'react';
import { apiGet } from '../../api/base';

export function StatusPage() {
  const [health, setHealth] = useState<{ status?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ status?: string }>('/api/health')
      .then(setHealth)
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
      <h1 className="text-2xl font-bold text-stone-800">状态面板</h1>
      <p className="mt-1 text-stone-600 text-sm">服务状态、端点健康、IM 在线状态</p>
      {error && (
        <div className="mt-3 px-3 py-2 bg-red-50 text-red-700 rounded text-sm">{error}</div>
      )}
      {health && (
        <div className="mt-6 border border-stone-200 rounded p-4">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                health.status === 'healthy' ? 'bg-green-500' : 'bg-stone-400'
              }`}
            />
            <span className="text-stone-800">服务状态：{health.status ?? 'unknown'}</span>
          </div>
        </div>
      )}
    </div>
  );
}
