import { useEffect, useState } from 'react';
import { getApiBase, apiGet } from '../api/base';

export function Topbar() {
  const [status, setStatus] = useState<'unknown' | 'healthy' | 'error'>('unknown');
  const [endpointCount, setEndpointCount] = useState<number | null>(null);

  const refresh = async () => {
    try {
      const health = await apiGet<{ status?: string }>('/api/health');
      setStatus(health.status === 'healthy' ? 'healthy' : 'unknown');
    } catch {
      setStatus('error');
    }
    try {
      const data = await apiGet<{ endpoints?: unknown[] }>('/api/config/endpoints');
      setEndpointCount(Array.isArray(data.endpoints) ? data.endpoints.length : 0);
    } catch {
      setEndpointCount(null);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <header className="flex items-center justify-between px-4 py-2 border-b border-stone-200 bg-white/90">
      <div className="flex items-center gap-3 text-sm">
        <span className="text-stone-600">default</span>
        <span className="flex items-center gap-1.5">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              status === 'healthy'
                ? 'bg-green-500'
                : status === 'error'
                  ? 'bg-red-500'
                  : 'bg-stone-400'
            }`}
          />
          {status === 'healthy' ? '运行中' : status === 'error' ? '未连接' : '检查中...'}
        </span>
        {endpointCount !== null && <span className="text-stone-500">{endpointCount} 端点</span>}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={refresh}
          className="px-2 py-1 text-stone-600 hover:bg-stone-100 rounded text-sm"
        >
          刷新
        </button>
        <a
          href={getApiBase()}
          target="_blank"
          rel="noopener noreferrer"
          className="text-stone-500 hover:text-stone-700 text-xs"
        >
          API: {getApiBase()}
        </a>
      </div>
    </header>
  );
}
