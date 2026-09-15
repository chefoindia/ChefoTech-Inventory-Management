import type { Types } from 'mongoose';

/**
 * Everything a service needs to know about the caller.
 * Built by the auth + tenant middleware; never constructed from request bodies.
 */
export interface RequestContext {
  requestId: string;
  userId: Types.ObjectId;
  organizationId: Types.ObjectId;
  membershipId: Types.ObjectId;
  sessionId: Types.ObjectId;
  /** Active outlet (from X-Outlet-Id) once validated against membership. */
  outletId?: Types.ObjectId;
  isOwner: boolean;
  roleKey: string;
  permissions: ReadonlySet<string>;
  /** Outlet ids the caller may access; null means all outlets. */
  outletAccess: Types.ObjectId[] | null;
  ip?: string;
  userAgent?: string;
}

export function hasPermission(ctx: RequestContext, permission: string): boolean {
  return ctx.isOwner || ctx.permissions.has(permission);
}

export function canAccessOutlet(ctx: RequestContext, outletId: Types.ObjectId | string): boolean {
  if (ctx.isOwner || ctx.outletAccess === null) return true;
  const id = outletId.toString();
  return ctx.outletAccess.some((o) => o.toString() === id);
}

declare module 'express-serve-static-core' {
  interface Request {
    ctx?: RequestContext;
    requestId: string;
    /** Set by the idempotency middleware when a stored response was replayed. */
    idempotencyKey?: string;
  }
}
