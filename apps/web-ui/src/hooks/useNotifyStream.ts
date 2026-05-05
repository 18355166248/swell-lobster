import { useEffect, useRef } from 'react';
import { getApiBase } from '../api/base';

type NotifyEvent = {
  type: 'im_start' | 'im_done';
  session_id: string;
  channel_type?: string;
};

export function useNotifyStream(onEvent: (e: NotifyEvent) => void) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    let es: EventSource;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    function connect() {
      es = new EventSource(`${getApiBase()}/api/notify/stream`);
      es.addEventListener('notify', (e) => {
        try {
          onEventRef.current(JSON.parse((e as MessageEvent).data) as NotifyEvent);
        } catch {}
      });
      es.onerror = () => {
        es.close();
        if (!stopped) {
          retryTimer = setTimeout(connect, 3000);
        }
      };
    }

    connect();
    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      es.close();
    };
  }, []);
}
