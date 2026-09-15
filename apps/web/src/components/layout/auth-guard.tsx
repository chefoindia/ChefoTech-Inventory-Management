'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useMe } from '@/features/auth/api';
import { useSession } from '@/stores/session';
import { Spinner } from '@/components/ui/states';

/**
 * Wraps authenticated routes. Attempts a silent refresh on first load, then redirects to login
 * (remembering the intended page) when no session exists.
 */
export function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const me = useSession((s) => s.me);
  const query = useMe();

  useEffect(() => {
    if (!query.isPending && !query.data && !me) {
      const next = pathname && pathname !== '/dashboard' ? `?next=${encodeURIComponent(pathname)}` : '';
      router.replace(`/login${next}`);
    }
  }, [query.isPending, query.data, me, router, pathname]);

  if (!me) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }
  return <>{children}</>;
}

/** Redirects signed-in users away from auth pages. */
export function GuestOnly({ children }: { children: ReactNode }) {
  const router = useRouter();
  const me = useSession((s) => s.me);
  const query = useMe();

  useEffect(() => {
    if (me) router.replace('/dashboard');
  }, [me, router]);

  if (query.isPending && !me) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (me) return null;
  return <>{children}</>;
}
