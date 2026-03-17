import { useEffect, useState } from 'react';
import { apiGet } from '../../api/base';

type Summary = { total_input?: number; total_output?: number; requests?: number };

export function TokenStatsPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Summary>('/api/stats/tokens/summary')
      .then(setSummary)
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
      <h1 className="text-2xl font-bold text-stone-800">Token 统计</h1>
      <p className="mt-1 text-stone-600 text-sm">Token 用量汇总与时间线</p>
      {error && (
        <div className="mt-3 px-3 py-2 bg-red-50 text-red-700 rounded text-sm">{error}</div>
      )}
      {summary && (
        <div className="mt-6 grid grid-cols-3 gap-4">
          <div className="border border-stone-200 rounded p-4">
            <div className="text-sm text-stone-500">输入 Token</div>
            <div className="text-xl font-semibold text-stone-800">{summary.total_input ?? 0}</div>
          </div>
          <div className="border border-stone-200 rounded p-4">
            <div className="text-sm text-stone-500">输出 Token</div>
            <div className="text-xl font-semibold text-stone-800">{summary.total_output ?? 0}</div>
          </div>
          <div className="border border-stone-200 rounded p-4">
            <div className="text-sm text-stone-500">请求数</div>
            <div className="text-xl font-semibold text-stone-800">{summary.requests ?? 0}</div>
          </div>
        </div>
      )}
    </div>
  );
}
