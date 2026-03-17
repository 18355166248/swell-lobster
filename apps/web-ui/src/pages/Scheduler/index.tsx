import { useEffect, useState } from 'react';
import { apiGet } from '../../api/base';

export function SchedulerPage() {
  const [tasks, setTasks] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ tasks: unknown[] }>('/api/scheduler/tasks')
      .then((data) => setTasks(data.tasks ?? []))
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
      <h1 className="text-2xl font-bold text-stone-800">计划任务</h1>
      <p className="mt-1 text-stone-600 text-sm">定时任务列表与新建/编辑</p>
      {error && (
        <div className="mt-3 px-3 py-2 bg-red-50 text-red-700 rounded text-sm">{error}</div>
      )}
      <div className="mt-6 border border-stone-200 rounded overflow-hidden">
        {tasks.length === 0 ? (
          <div className="px-4 py-8 text-stone-500 text-sm text-center">暂无计划任务</div>
        ) : (
          <ul className="divide-y divide-stone-200">
            {tasks.map((_, i) => (
              <li key={i} className="px-4 py-3 text-stone-800 text-sm" />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
