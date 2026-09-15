import type { RequestHandler } from 'express';
import { Types } from 'mongoose';
import { verifyAccessToken } from '@/lib/jwt';
import { AuthError, ForbiddenError } from '@/lib/errors';
import type { RequestContext } from '@/lib/context';
import { MembershipModel } from '@/models/membership.model';
import { RoleModel } from '@/models/role.model';
import { SessionModel } from '@/models/session.model';
import { UserModel } from '@/models/user.model';
import { OrganizationModel } from '@/models/organization.model';

interface CachedAccess {
  expiresAt: number;
  ctxBase: Omit<RequestContext, 'requestId' | 'ip' | 'userAgent' | 'outletId'>;
}

/**
 * Small in-process cache so each request does not hit 4 collections. 30 s TTL means role /
 * membership / session changes take effect within half a minute; suspensions and revocations
 * that must be immediate call `invalidateAccessCache`.
 */
const cache = new Map<string, CachedAccess>();
const CACHE_TTL_MS = 30_000;

export function invalidateAccessCache(sessionId?: string): void {
  if (sessionId) cache.delete(sessionId);
  else cache.clear();
}

async function loadAccess(claims: { sub: string; org: string; mem: string; sid: string }) {
  const [session, membership, user, organization] = await Promise.all([
    SessionModel.findById(claims.sid).select('revokedAt expiresAt userId').lean(),
    MembershipModel.findById(claims.mem).lean(),
    UserModel.findById(claims.sub).select('status').lean(),
    OrganizationModel.findById(claims.org).select('status').lean(),
  ]);

  if (!session || session.revokedAt || session.expiresAt < new Date() || String(session.userId) !== claims.sub) {
    throw new AuthError('Session is no longer valid');
  }
  if (!user || user.status !== 'active') throw new AuthError('Account is disabled');
  if (!organization || organization.status !== 'active') throw new ForbiddenError('Organization is suspended');
  if (
    !membership ||
    String(membership.userId) !== claims.sub ||
    String(membership.organizationId) !== claims.org ||
    membership.status !== 'active'
  ) {
    throw new ForbiddenError('Your access to this organization is not active');
  }

  const role = await RoleModel.findOne({ _id: membership.roleId, organizationId: membership.organizationId })
    .select('key permissions status')
    .lean();
  if (!role || role.status !== 'active') throw new ForbiddenError('Your role is no longer active');

  const ctxBase: CachedAccess['ctxBase'] = {
    userId: new Types.ObjectId(claims.sub),
    organizationId: new Types.ObjectId(claims.org),
    membershipId: membership._id,
    sessionId: new Types.ObjectId(claims.sid),
    isOwner: membership.isOwner,
    roleKey: role.key,
    permissions: new Set(role.permissions),
    outletAccess: membership.isOwner || membership.outletAccess?.all ? null : (membership.outletAccess?.outletIds ?? []),
  };
  return ctxBase;
}

export const authenticate: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) throw new AuthError();
    const claims = verifyAccessToken(header.slice(7).trim());

    let cached = cache.get(claims.sid);
    if (!cached || cached.expiresAt < Date.now()) {
      const ctxBase = await loadAccess(claims);
      cached = { ctxBase, expiresAt: Date.now() + CACHE_TTL_MS };
      cache.set(claims.sid, cached);
    }

    req.ctx = {
      ...cached.ctxBase,
      requestId: req.requestId,
      ip: req.ip,
      userAgent: req.header('user-agent') ?? '',
    };
    next();
  } catch (err) {
    next(err);
  }
};

/** Convenience for controllers: throws if middleware order is wrong. */
export function ctxOf(req: { ctx?: RequestContext }): RequestContext {
  if (!req.ctx) throw new AuthError();
  return req.ctx;
}
