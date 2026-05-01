const API_BASE =
  (typeof import.meta !== 'undefined' &&
    (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE) ||
  'http://127.0.0.1:18900';

export type FrontendLogLevel = 'error' | 'warn' | 'info';

type FrontendLogEntry = {
  level: FrontendLogLevel;
  message: string;
  context?: unknown;
};

function getApiBase(): string {
  return API_BASE.replace(/\/$/, '');
}

function shouldSkip(path: string): boolean {
  return path.includes('/api/logs');
}

export async function reportFrontendLog(entry: FrontendLogEntry): Promise<void> {
  await fetch(`${getApiBase()}/api/logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...entry, source: 'frontend' }),
  });
}

export async function reportFrontendError(args: {
  message: string;
  context?: unknown;
  path?: string;
}): Promise<void> {
  if (args.path && shouldSkip(args.path)) return;
  await reportFrontendLog({ level: 'error', message: args.message, context: args.context });
}

export function installGlobalErrorHandlers(): void {
  window.addEventListener('error', (event) => {
    void reportFrontendError({
      message: event.message || String(event.error),
      context: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack,
      },
    }).catch(() => {});
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason as Error | undefined;
    void reportFrontendError({
      message: reason?.message ?? String(event.reason),
      context: { stack: reason?.stack },
    }).catch(() => {});
  });
}
