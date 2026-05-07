import { useEffect, useRef } from 'react';

export interface WatchEvent {
  type: 'created' | 'modified' | 'deleted';
  path: string;
  at: number;
}

export interface UseWatchOptions {
  url?: string;
  onEvent: (event: WatchEvent) => void;
}

/**
 * Subscribe to /api/watch SSE. EventSource handles reconnection automatically;
 * the latest onEvent is read through a ref so callbacks can close over the
 * latest app state without restarting the connection.
 */
export function useWatch({ url = '/api/watch', onEvent }: UseWatchOptions): void {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    const source = new EventSource(url);
    source.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data) as WatchEvent;
        onEventRef.current(data);
      } catch {
        // Ignore malformed events (heartbeat comments come through onmessage as empty data).
      }
    };
    return () => source.close();
  }, [url]);
}
