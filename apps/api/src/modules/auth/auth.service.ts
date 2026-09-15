import { Types } from 'mongoose';
import type {
  RegisterInput,
  LoginInput,
  ChangePasswordInput,
  MeDto,
  AuthTokensDto,
  OrganizationSummaryDto,
} from '@pharmaos/shared';
import { env } from '@/config/env';
import { withTransaction } from '@/db/transaction';
import { hashPassword, verifyPassword, randomToken, sha256 } from '@/lib/crypto';
import { signAccessToken } from '@/lib/jwt';
import { AuthError, ConflictError, ForbiddenError, NotFoundError, AppError } from '@/lib/errors';
import type { RequestContext } from '@/lib/context';
import { events } from '@/lib/events';
import { UserModel, type UserDoc } from '@/models/user.model';
import { OrganizationModel, type OrganizationDoc } from '@/models/organization.model';
import { OutletModel, type OutletDoc } from '@/models/outlet.model';
import { MembershipModel, type MembershipDoc } from '@/models/membership.model';
import { RoleModel, type RoleDoc } from '@/models/role.model';
import { SessionModel, type SessionDoc } from '@/models/session.model';
import { seedSystemRoles } from '@/modules/roles/roles.service';
import { audit } from '@/services/audit.service';
import { trustedFilter } from '@/lib/scoped';
import { invalidateAccessCache } from '@/middleware/authenticate';
import { toOrganizationDto, toOutletDto, toUserDto, toSessionDto } from '@/modules/common/serializers';

export interface ClientMeta {
  ip?: string;
  userAgent?: string;
  requestId: string;
}

export interface IssuedTokens extends AuthTokensDto {
  refreshToken: string;
  refreshExpiresAt: Date;
  sessionId: Types.ObjectId;
}

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

/* ---------------------------------------------------------------- helpers */

async function issueSession(
  user: Pick<UserDoc, '_id'>,
  membership: Pick<MembershipDoc, '_id' | 'organizationId'>,
  meta: ClientMeta,
): Promise<IssuedTokens> {
  const refreshToken = randomToken(32);
  const refreshExpiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
  const session = await SessionModel.create({
    userId: user._id,
    organizationId: membership.organizationId,
    membershipId: membership._id,
    tokenHash: sha256(refreshToken),
    userAgent: meta.userAgent ?? '',
    ip: meta.ip ?? '',
    expiresAt: refreshExpiresAt,
  });
  const { token, expiresAt } = signAccessToken({
    sub: String(user._id),
    org: String(membership.organizationId),
    mem: String(membership._id),
    sid: String(session._id),
  });
  return {
    accessToken: token,
    accessTokenExpiresAt: expiresAt.toISOString(),
    refreshToken,
    refreshExpiresAt,
    sessionId: session._id,
  };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base || 'pharmacy';
  let attempt = 0;
  while (await OrganizationModel.exists({ slug })) {
    attempt += 1;
    slug = `${base}-${attempt}`;
  }
  return slug;
}

/* ---------------------------------------------------------------- register */

export async function registerOrganization(input: RegisterInput, meta: ClientMeta) {
  const existing = await UserModel.exists({ email: input.email });
  if (existing) throw new ConflictError('An account with this email already exists. Sign in instead.');

  const slug = await uniqueSlug(input.organizationSlug ?? slugify(input.organizationName));
  const passwordHash = await hashPassword(input.password);

  const result = await withTransaction(async (session) => {
    const userId = new Types.ObjectId();
    const orgId = new Types.ObjectId();

    const [user] = await UserModel.create(
      [{ _id: userId, email: input.email, passwordHash, name: input.ownerName, phone: input.phone ?? '' }],
      { session },
    );

    const [org] = await OrganizationModel.create(
      [
        {
          _id: orgId,
          name: input.organizationName,
          slug,
          email: input.email,
          phone: input.phone ?? '',
          tax: { stateCode: input.stateCode, registrationType: 'regular' },
          subscription: { planKey: 'trial', status: 'trialing', trialEndsAt: new Date(Date.now() + 14 * 86_400_000) },
          createdBy: userId,
        },
      ],
      { session },
    );

    const [outlet] = await OutletModel.create(
      [
        {
          organizationId: orgId,
          name: input.outletName ?? `${input.organizationName} - Main`,
          code: 'MAIN',
          type: 'retail',
          stateCode: input.stateCode,
          isDefault: true,
          createdBy: userId,
        },
      ],
      { session },
    );

    const ownerRole = await seedSystemRoles(orgId, userId, session);

    const [membership] = await MembershipModel.create(
      [
        {
          userId,
          organizationId: orgId,
          roleId: ownerRole._id,
          outletAccess: { all: true, outletIds: [] },
          defaultOutletId: outlet!._id,
          isOwner: true,
          status: 'active',
          joinedAt: new Date(),
        },
      ],
      { session },
    );

    await audit(
      { organizationId: orgId, userId, requestId: meta.requestId, ip: meta.ip, userAgent: meta.userAgent },
      {
        action: 'organization.created',
        entityType: 'Organization',
        entityId: orgId,
        summary: `Organization "${org!.name}" created by ${user!.email}`,
      },
      session,
    );

    return { user: user!, org: org!, outlet: outlet!, membership: membership! };
  });

  const tokens = await issueSession(result.user, result.membership, meta);
  events.emit('organization.created', { organizationId: result.org._id, ownerUserId: result.user._id });
  return { tokens, me: await buildMe(result.user._id, result.membership._id) };
}

/* ---------------------------------------------------------------- login */

export async function login(input: LoginInput, meta: ClientMeta) {
  const user = await UserModel.findOne({ email: input.email }).select('+passwordHash');
  const invalid = () => new AuthError('Incorrect email or password');

  if (!user) {
    // Burn similar time to a real verification to blunt user-enumeration timing.
    await verifyPassword(input.password, 'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=$AA==');
    throw invalid();
  }
  if (user.status !== 'active') throw new AuthError('This account has been disabled');
  if (user.security?.lockedUntil && user.security.lockedUntil > new Date()) {
    const minutes = Math.ceil((user.security.lockedUntil.getTime() - Date.now()) / 60_000);
    throw new AppError('ACCOUNT_LOCKED', `Too many failed attempts. Try again in ${minutes} minute(s).`, 423);
  }

  const okPassword = await verifyPassword(input.password, user.passwordHash);
  if (!okPassword) {
    const attempts = (user.security?.failedLoginAttempts ?? 0) + 1;
    const update: Record<string, unknown> = { 'security.failedLoginAttempts': attempts };
    if (attempts >= MAX_FAILED_LOGINS) {
      update['security.lockedUntil'] = new Date(Date.now() + LOCK_MINUTES * 60_000);
      update['security.failedLoginAttempts'] = 0;
    }
    await UserModel.updateOne({ _id: user._id }, { $set: update });
    throw invalid();
  }

  const memberships = await MembershipModel.find({ userId: user._id, status: 'active' })
    .sort({ joinedAt: -1 })
    .lean<MembershipDoc[]>();
  if (!memberships.length) throw new ForbiddenError('You are not a member of any organization');

  let membership = memberships[0]!;
  if (input.organizationId) {
    const chosen = memberships.find((m) => String(m.organizationId) === input.organizationId);
    if (!chosen) throw new ForbiddenError('You are not a member of that organization');
    membership = chosen;
  }

  const org = await OrganizationModel.findById(membership.organizationId).select('status').lean();
  if (!org || org.status !== 'active') throw new ForbiddenError('This organization is suspended');

  await UserModel.updateOne(
    { _id: user._id },
    { $set: { lastLoginAt: new Date(), 'security.failedLoginAttempts': 0, 'security.lockedUntil': null } },
  );

  const tokens = await issueSession(user, membership, meta);
  await audit(
    { organizationId: membership.organizationId, userId: user._id, requestId: meta.requestId, ip: meta.ip, userAgent: meta.userAgent },
    { action: 'auth.login', entityType: 'User', entityId: user._id, summary: `${user.email} signed in` },
  );
  events.emit('auth.login', { userId: user._id, organizationId: membership.organizationId });
  return { tokens, me: await buildMe(user._id, membership._id) };
}

/* ---------------------------------------------------------------- refresh / logout */

export async function refreshSession(refreshToken: string, meta: ClientMeta): Promise<IssuedTokens> {
  const hash = sha256(refreshToken);
  const session = await SessionModel.findOne({ tokenHash: hash });

  if (!session) {
    // Reuse of an already-rotated token: the family is compromised, revoke it.
    const reused = await SessionModel.findOne({ previousTokenHash: hash });
    if (reused && !reused.revokedAt) {
      reused.revokedAt = new Date();
      reused.revokedReason = 'refresh_token_reuse';
      await reused.save();
      invalidateAccessCache(String(reused._id));
    }
    throw new AuthError('Session is no longer valid');
  }
  if (session.revokedAt || session.expiresAt < new Date()) throw new AuthError('Session has expired');

  const membership = await MembershipModel.findById(session.membershipId).lean<MembershipDoc>();
  if (!membership || membership.status !== 'active') throw new ForbiddenError('Your access is no longer active');

  const newToken = randomToken(32);
  session.previousTokenHash = session.tokenHash;
  session.tokenHash = sha256(newToken);
  session.lastUsedAt = new Date();
  session.ip = meta.ip ?? session.ip;
  session.userAgent = meta.userAgent ?? session.userAgent;
  await session.save();

  const { token, expiresAt } = signAccessToken({
    sub: String(session.userId),
    org: String(session.organizationId),
    mem: String(session.membershipId),
    sid: String(session._id),
  });
  return {
    accessToken: token,
    accessTokenExpiresAt: expiresAt.toISOString(),
    refreshToken: newToken,
    refreshExpiresAt: session.expiresAt,
    sessionId: session._id,
  };
}

export async function logout(sessionId: Types.ObjectId, ctx?: RequestContext): Promise<void> {
  await SessionModel.updateOne(
    { _id: sessionId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: 'logout' } },
  );
  invalidateAccessCache(String(sessionId));
  if (ctx) {
    await audit(ctx, { action: 'auth.logout', entityType: 'User', entityId: ctx.userId, summary: 'Signed out' });
  }
}

export async function logoutByRefreshToken(refreshToken: string): Promise<void> {
  const session = await SessionModel.findOne({ tokenHash: sha256(refreshToken) }).select('_id');
  if (session) await logout(session._id);
}

/* ---------------------------------------------------------------- organization switch */

export async function switchOrganization(ctx: RequestContext, organizationId: string, meta: ClientMeta) {
  const membership = await MembershipModel.findOne({
    userId: ctx.userId,
    organizationId: new Types.ObjectId(organizationId),
    status: 'active',
  }).lean<MembershipDoc>();
  if (!membership) throw new ForbiddenError('You are not a member of that organization');
  const org = await OrganizationModel.findById(membership.organizationId).select('status').lean();
  if (!org || org.status !== 'active') throw new ForbiddenError('This organization is suspended');

  const tokens = await issueSession({ _id: ctx.userId }, membership, meta);
  await logout(ctx.sessionId);
  return { tokens, me: await buildMe(ctx.userId, membership._id) };
}

/* ---------------------------------------------------------------- me */

export async function buildMe(userId: Types.ObjectId, membershipId: Types.ObjectId): Promise<MeDto> {
  const [user, membership] = await Promise.all([
    UserModel.findById(userId).lean<UserDoc>(),
    MembershipModel.findById(membershipId).lean<MembershipDoc>(),
  ]);
  if (!user || !membership) throw new AuthError();

  const [org, role, outlets, allMemberships] = await Promise.all([
    OrganizationModel.findById(membership.organizationId).lean<OrganizationDoc>(),
    RoleModel.findById(membership.roleId).lean<RoleDoc>(),
    OutletModel.find(trustedFilter({
      organizationId: membership.organizationId,
      status: { $ne: 'archived' },
      ...(membership.isOwner || membership.outletAccess?.all ? {} : { _id: { $in: membership.outletAccess?.outletIds ?? [] } }),
    }))
      .sort({ isDefault: -1, name: 1 })
      .lean<OutletDoc[]>(),
    MembershipModel.find({ userId, status: 'active' }).lean<MembershipDoc[]>(),
  ]);
  if (!org || !role) throw new AuthError();

  const orgIds = allMemberships.map((m) => m.organizationId);
  const roleIds = allMemberships.map((m) => m.roleId);
  const [orgs, roles] = await Promise.all([
    OrganizationModel.find(trustedFilter({ _id: { $in: orgIds } })).select('name slug').lean<Pick<OrganizationDoc, '_id' | 'name' | 'slug'>[]>(),
    RoleModel.find(trustedFilter({ _id: { $in: roleIds } })).select('name').lean<Pick<RoleDoc, '_id' | 'name'>[]>(),
  ]);
  const orgMap = new Map(orgs.map((o) => [String(o._id), o]));
  const roleMap = new Map(roles.map((r) => [String(r._id), r]));

  const organizations: OrganizationSummaryDto[] = allMemberships
    .map((m) => {
      const o = orgMap.get(String(m.organizationId));
      if (!o) return null;
      return {
        id: String(o._id),
        name: o.name,
        slug: o.slug,
        roleName: roleMap.get(String(m.roleId))?.name ?? '',
        isOwner: m.isOwner ?? false,
      };
    })
    .filter((x): x is OrganizationSummaryDto => x !== null);

  return {
    user: toUserDto(user),
    organization: toOrganizationDto(org),
    membership: {
      id: String(membership._id),
      isOwner: membership.isOwner ?? false,
      role: { id: String(role._id), key: role.key, name: role.name },
      outletAccess: {
        all: membership.isOwner || (membership.outletAccess?.all ?? false),
        outletIds: (membership.outletAccess?.outletIds ?? []).map(String),
      },
      defaultOutletId: membership.defaultOutletId ? String(membership.defaultOutletId) : null,
    },
    permissions: membership.isOwner ? role.permissions : role.permissions,
    outlets: outlets.map(toOutletDto),
    organizations,
  };
}

/* ---------------------------------------------------------------- sessions */

export async function listSessions(ctx: RequestContext) {
  const sessions = await SessionModel.find(trustedFilter({ userId: ctx.userId, revokedAt: null, expiresAt: { $gt: new Date() } }))
    .sort({ lastUsedAt: -1 })
    .lean<SessionDoc[]>();
  return sessions.map((s) => toSessionDto(s, String(ctx.sessionId)));
}

export async function revokeSession(ctx: RequestContext, sessionId: string) {
  const session = await SessionModel.findOne({ _id: sessionId, userId: ctx.userId });
  if (!session) throw new NotFoundError('Session');
  await logout(session._id);
  await audit(ctx, {
    action: 'auth.session_revoked',
    entityType: 'Session',
    entityId: session._id,
    summary: 'Revoked a sign-in session',
  });
}

/* ---------------------------------------------------------------- password */

export async function changePassword(ctx: RequestContext, input: ChangePasswordInput) {
  const user = await UserModel.findById(ctx.userId).select('+passwordHash');
  if (!user) throw new AuthError();
  const okPassword = await verifyPassword(input.currentPassword, user.passwordHash);
  if (!okPassword) throw new AuthError('Current password is incorrect');
  if (input.currentPassword === input.newPassword) {
    throw new AppError('VALIDATION_ERROR', 'New password must be different from the current password', 400);
  }
  user.passwordHash = await hashPassword(input.newPassword);
  user.security = { ...(user.security ?? {}), passwordChangedAt: new Date() } as typeof user.security;
  await user.save();

  // Sign out every other device.
  await SessionModel.updateMany(
    trustedFilter({ userId: ctx.userId, _id: { $ne: ctx.sessionId }, revokedAt: null }),
    { $set: { revokedAt: new Date(), revokedReason: 'password_changed' } },
  );
  invalidateAccessCache();
  await audit(ctx, {
    action: 'auth.password_changed',
    entityType: 'User',
    entityId: ctx.userId,
    summary: 'Changed password; other sessions signed out',
  });
}
