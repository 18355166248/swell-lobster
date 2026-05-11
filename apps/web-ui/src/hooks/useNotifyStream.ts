import { useEffect, useRef } from 'react';
import { getApiBase } from '../api/base';
import { resolveAuthToken } from '../api/authToken';

type NotifyEvent = {
  type: 'im_start' | 'im_done';
  session_id: string;
  channel_type?: string;
};

export function useNotifyStream(onEvent: (e: NotifyEvent) => void) {
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    async function connect() {
      const base = getApiBase();
      const token = await resolveAuthToken(base);
      const url = token
        ? `${base}/api/notify/stream?token=${encodeURIComponent(token)}`
        : `${base}/api/notify/stream`;

      es = new EventSource(url);
      es.addEventListener('notify', (e) => {
        try {
          onEventRef.current(JSON.parse((e as MessageEvent).data) as NotifyEvent);
        } catch {
          /* 非 JSON 或结构异常时忽略 */
        }
      });
      es.onerror = () => {
        es?.close();
        if (!stopped) {
          retryTimer = setTimeout(() => void connect(), 3000);
        }
      };
    }

    void connect();
    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      es?.close();
    };
  }, []);
}
