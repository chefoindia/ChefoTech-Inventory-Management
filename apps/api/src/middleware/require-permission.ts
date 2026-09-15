import type { RequestHandler } from 'express';
import { AuthError, ForbiddenError } from '@/lib/errors';
import { hasPermission } from '@/lib/context';

/**
 * Server-side permission gate. Owner bypasses. `mode: 'any'` passes if the caller holds at
 * least one of the listed permissions; `'all'` (default) requires every one.
 */
export function requirePermission(
  permission: string | string[],
  mode: 'all' | 'any' = 'all',
): RequestHandler {
  const list = Array.isArray(permission) ? permission : [permission];
  return (req, _res, next) => {
    const ctx = req.ctx;
    if (!ctx) return next(new AuthError());
    const check = (p: string) => hasPermission(ctx, p);
    const allowed = mode === 'all' ? list.every(check) : list.some(check);
    if (!allowed) return next(new ForbiddenError());
    next();
  };
}
