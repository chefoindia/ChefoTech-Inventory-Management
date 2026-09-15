'use client';

import type { ReactNode } from 'react';
import { useSession, hasPermission } from '@/stores/session';

/** True when the current user holds the permission (owner always does). UI-only; the API enforces. */
export function usePermission(permission: string | string[], mode: 'all' | 'any' = 'all'): boolean {
  const me = useSession((s) => s.me);
  const list = Array.isArray(permission) ? permission : [permission];
  return mode === 'all' ? list.every((p) => hasPermission(me, p)) : list.some((p) => hasPermission(me, p));
}

export function Can({
  permission,
  mode,
  fallback = null,
  children,
}: {
  permission: string | string[];
  mode?: 'all' | 'any';
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const allowed = usePermission(permission, mode);
  return <>{allowed ? children : fallback}</>;
}
