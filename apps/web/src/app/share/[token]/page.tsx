'use client';

import { use, useEffect, useState } from 'react';
import { API_URL } from '@/lib/api-client';
import { Logo } from '@/components/layout/logo';

/** Public document viewer for signed share links (WhatsApp/SMS). No session required. */
export default function SharedDocumentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const src = `${API_URL.replace(/\/api\/v1\/?$/, '')}/share/${encodeURIComponent(token)}`;
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  useEffect(() => {
    let alive = true;
    fetch(src, { method: 'GET' }).then((r) => { if (alive) setStatus(r.ok ? 'ok' : 'error'); }).catch(() => { if (alive) setStatus('error'); });
    return () => { alive = false; };
  }, [src]);
  return (
    <div className="flex min-h-screen flex-col bg-surface-muted">
      <header className="flex h-14 items-center justify-between border-b border-border bg-surface px-4">
        <Logo />
        {status === 'ok' ? <a href={src} download className="text-[13px] font-medium text-primary-700 hover:underline">Download PDF</a> : null}
      </header>
      <main className="flex flex-1 items-stretch justify-center p-2 sm:p-4">
        {status === 'error' ? (
          <div className="m-auto max-w-md rounded-[var(--radius-card)] border border-border bg-surface p-6 text-center">
            <h1 className="text-[15px] font-semibold">This link is no longer valid</h1>
            <p className="mt-1 text-[13px] text-fg-subtle">Share links expire after 7 days. Ask the pharmacy to send the document again.</p>
          </div>
        ) : (
          <iframe title="Shared document" src={src} className="h-[calc(100vh-88px)] w-full max-w-4xl rounded-[var(--radius-card)] border border-border bg-white" />
        )}
      </main>
    </div>
  );
}
