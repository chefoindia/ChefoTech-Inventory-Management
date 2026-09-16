'use client';

import * as React from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { API_URL } from '@/lib/api-client';

/**
 * Tracks connectivity two ways: the browser's online flag and a lightweight ping to the API health
 * endpoint. Shows a persistent banner while offline; queued React Query fetches resume on recovery.
 */
export function useConnectionStatus() {
  const [online, setOnline] = React.useState(true);
  const [apiUp, setApiUp] = React.useState(true);
  const qc = useQueryClient();
  React.useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => { window.removeEventListener('online', sync); window.removeEventListener('offline', sync); };
  }, []);
  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const ping = async () => {
      try {
        const res = await fetch(`${API_URL.replace(/\/api\/v1\/?$/, '')}/health`, { cache: 'no-store' });
        if (!cancelled) {
          const wasDown = !apiUp;
          setApiUp(res.ok);
          if (res.ok && wasDown) qc.invalidateQueries();
        }
      } catch {
        if (!cancelled) setApiUp(false);
      }
      timer = setTimeout(ping, apiUp && online ? 30_000 : 5_000);
    };
    void ping();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, apiUp]);
  return { online, apiUp, connected: online && apiUp };
}

export function ConnectionBanner() {
  const { online, apiUp } = useConnectionStatus();
  if (online && apiUp) return null;
  return (
    <div role="status" className="flex items-center gap-2 bg-warning-50 px-4 py-1.5 text-[13px] text-warning-700 border-b border-warning-600/20">
      <WifiOff className="h-4 w-4" />
      <span className="flex-1">{!online ? 'You are offline. Bills you are typing are kept on this device; completing a sale needs a connection.' : 'Cannot reach the PharmaOS server. Retrying…'}</span>
      <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden />
    </div>
  );
}
