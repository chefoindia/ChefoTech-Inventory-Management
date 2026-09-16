'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/layout/logo';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Route-level error boundary for unexpected rendering errors. Shows a plain message, never a stack trace. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Keep the details in the console for support; nothing sensitive is rendered.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col bg-surface-muted">
      <header className="flex h-14 items-center px-6">
        <Link href="/" aria-label="PharmaOS home"><Logo /></Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md text-center" role="alert">
          <h1 className="text-2xl font-semibold tracking-tight text-fg">Something went wrong on this page</h1>
          <p className="mt-2 text-[14px] text-fg-muted">Your data is safe. You can try again, or go back to the dashboard. If it keeps happening, tell us and mention the reference below.</p>
          {error.digest ? <p className="mt-3 font-mono text-[12px] text-fg-subtle">Reference: {error.digest}</p> : null}
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <Button onClick={reset}>Try again</Button>
            <Link href="/dashboard" className={cn(buttonVariants({ variant: 'secondary' }))}>Go to dashboard</Link>
            <Link href="/contact" className={cn(buttonVariants({ variant: 'ghost' }))}>Contact support</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
