import { useEffect, useState } from 'react';
import { apiGet } from '../../api/base';

type Channel = {
  channel?: string;
  name?: string;
  status?: string;
  session_count?: number;
};

export function IMPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiGet<{ channels: Channel[] }>('/api/im/channels')
      .then((data) => {
        if (!cancelled) setChannels(data.channels ?? []);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
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
      <h1 className="text-2xl font-bold text-stone-800">消息通道</h1>
      <p className="mt-1 text-stone-600 text-sm">
        IM 通道列表与在线状态，可在「配置 → IM 通道」中配置 Bot
      </p>
      {error && (
        <div className="mt-3 px-3 py-2 bg-red-50 text-red-700 rounded text-sm">{error}</div>
      )}
      <div className="mt-6 border border-stone-200 rounded overflow-hidden">
        {channels.length === 0 ? (
          <div className="px-4 py-8 text-stone-500 text-sm text-center">暂无已配置的 IM 通道</div>
        ) : (
          <ul className="divide-y divide-stone-200">
            {channels.map((ch, i) => (
              <li key={i} className="px-4 py-3 flex items-center justify-between">
                <span className="font-medium text-stone-800">{ch.name ?? ch.channel ?? '-'}</span>
                <span
                  className={`text-sm ${ch.status === 'online' ? 'text-green-600' : 'text-stone-500'}`}
                >
                  {ch.status === 'online' ? '在线' : '离线'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
