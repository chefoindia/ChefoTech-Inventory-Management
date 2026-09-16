'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { BellRing, BellOff } from 'lucide-react';
import { usePushPublicKey, useSubscribePush, useUnsubscribePush } from './api';
import { errorMessage } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

/** Enables browser push on this device: registers the service worker and stores the subscription on the server. */
export function PushToggleCard() {
  const key = usePushPublicKey();
  const subscribe = useSubscribePush();
  const unsubscribe = useUnsubscribePush();
  const [endpoint, setEndpoint] = React.useState<string | null>(null);
  const [supported, setSupported] = React.useState(true);
  React.useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) { setSupported(false); return; }
    navigator.serviceWorker.getRegistration('/sw.js').then((reg) => reg?.pushManager.getSubscription()).then((sub) => setEndpoint(sub?.endpoint ?? null)).catch(() => undefined);
  }, []);
  const enable = async () => {
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return toast.error('Notifications are blocked for this site in the browser.');
      const reg = await navigator.serviceWorker.register('/sw.js');
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key.data!.publicKey) });
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      await subscribe.mutateAsync({ endpoint: json.endpoint, keys: json.keys, userAgent: navigator.userAgent.slice(0, 300) });
      setEndpoint(json.endpoint);
      toast.success('Push notifications enabled on this device');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  const disable = async () => {
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      const sub = await reg?.pushManager.getSubscription();
      if (sub) { await unsubscribe.mutateAsync(sub.endpoint); await sub.unsubscribe(); }
      setEndpoint(null);
      toast.success('Push notifications disabled on this device');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  const configured = Boolean(key.data?.publicKey);
  return (
    <Card>
      <CardHeader><CardTitle>Push notifications on this device</CardTitle><CardDescription>Get alerts even when PharmaOS is not open. Each device is enabled separately.</CardDescription></CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        {!supported ? <p className="text-[13px] text-fg-subtle">This browser does not support web push.</p> : !configured ? <p className="text-[13px] text-fg-subtle">Push is not enabled for this deployment (VAPID keys are missing on the server).</p> : endpoint ? (
          <Button variant="secondary" size="sm" loading={unsubscribe.isPending} onClick={() => void disable()}><BellOff className="h-3.5 w-3.5" /> Disable on this device</Button>
        ) : (
          <Button size="sm" loading={subscribe.isPending} onClick={() => void enable()}><BellRing className="h-3.5 w-3.5" /> Enable push here</Button>
        )}
      </CardContent>
    </Card>
  );
}
