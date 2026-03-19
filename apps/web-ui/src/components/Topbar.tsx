import { useEffect, useState } from 'react';
import { getApiBase, apiGet } from '../api/base';
import { ThemeToggle } from './ThemeToggle';
import { RefreshCw, ExternalLink } from 'lucide-react';

export function Topbar() {
  const [status, setStatus] = useState<'unknown' | 'healthy' | 'error'>('unknown');
  const [endpointCount, setEndpointCount] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
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
    setRefreshing(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const statusConfig = {
    healthy: {
      dot: 'bg-green-500',
      badge: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20',
      label: '运行中',
    },
    error: {
      dot: 'bg-red-500',
      badge: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
      label: '未连接',
    },
    unknown: {
      dot: 'bg-muted-foreground/40 animate-pulse',
      badge: 'bg-muted text-muted-foreground border-border',
      label: '检查中',
    },
  }[status];

  return (
    <header className="flex items-center justify-between px-4 h-11 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 flex-shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">default</span>
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-medium ${statusConfig.badge}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`} />
          {statusConfig.label}
        </span>
        {endpointCount !== null && (
          <span className="text-xs text-muted-foreground/70">{endpointCount} 端点</span>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <ThemeToggle />
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors disabled:opacity-50"
          title="刷新"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
        <a
          href={getApiBase()}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 px-2 py-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md text-xs transition-colors"
          title={getApiBase()}
        >
          <ExternalLink className="w-3 h-3" />
          API
        </a>
      </div>
    </header>
  );
}
