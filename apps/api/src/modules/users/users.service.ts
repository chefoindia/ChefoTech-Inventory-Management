import { Types } from 'mongoose';
import type { InviteUserInput, UpdateMembershipInput, UpdateProfileInput, PaginationQuery } from '@pharmaos/shared';
import { env } from '@/config/env';
import { UserModel, type UserDoc } from '@/models/user.model';
import { MembershipModel, type MembershipDoc } from '@/models/membership.model';
import { RoleModel, type RoleDoc } from '@/models/role.model';
import { OutletModel } from '@/models/outlet.model';
import { InvitationModel, type InvitationDoc } from '@/models/invitation.model';
import { OrganizationModel } from '@/models/organization.model';
import { SessionModel } from '@/models/session.model';
import type { RequestContext } from '@/lib/context';
import { orgFilter, trustedFilter } from '@/lib/scoped';
import { BusinessRuleError, ConflictError, ForbiddenError, NotFoundError, PlanLimitError, AppError } from '@/lib/errors';
import { hashPassword, randomToken, sha256 } from '@/lib/crypto';
import { pageMeta } from '@/lib/pagination';
import { audit, diffObjects } from '@/services/audit.service';
import { sendEmail } from '@/services/email/email.service';
import { invalidateAccessCache } from '@/middleware/authenticate';
import { toMembershipDto, toUserDto } from '@/modules/common/serializers';
import { logger } from '@/lib/logger';

const INVITE_TTL_DAYS = 7;

/* ---------------------------------------------------------------- members */

export async function listMembers(ctx: RequestContext, query: PaginationQuery) {
  const filter = orgFilter<MembershipDoc>(ctx, {});
  const [memberships, total] = await Promise.all([
    MembershipModel.find(filter).sort({ isOwner: -1, createdAt: 1 }).lean<MembershipDoc[]>(),
    MembershipModel.countDocuments(filter),
  ]);
  const [users, roles] = await Promise.all([
    UserModel.find(trustedFilter({ _id: { $in: memberships.map((m) => m.userId) } })).lean<UserDoc[]>(),
    RoleModel.find(trustedFilter({ _id: { $in: memberships.map((m) => m.roleId) } })).lean<RoleDoc[]>(),
  ]);
  const userMap = new Map(users.map((u) => [String(u._id), u]));
  const roleMap = new Map(roles.map((r) => [String(r._id), r]));

  let items = memberships
    .map((m) => {
      const u = userMap.get(String(m.userId));
      const r = roleMap.get(String(m.roleId));
      return u && r ? toMembershipDto(m, u, r) : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (query.q) {
    const q = query.q.toLowerCase();
    items = items.filter((m) => m.user.name.toLowerCase().includes(q) || m.user.email.includes(q));
  }
  const start = (query.page - 1) * query.pageSize;
  return { items: items.slice(start, start + query.pageSize), meta: pageMeta(query, query.q ? items.length : total) };
}

async function assertRoleAndOutlets(ctx: RequestContext, roleId: string, outletIds: string[], defaultOutletId?: string | null) {
  const role = await RoleModel.findOne(orgFilter<RoleDoc>(ctx, { _id: roleId, status: 'active' })).lean<RoleDoc>();
  if (!role) throw new NotFoundError('Role');
  if (role.key === 'owner') throw new ForbiddenError('The Owner role cannot be assigned; transfer ownership instead');
  if (!ctx.isOwner) {
    const missing = role.permissions.filter((p) => !ctx.permissions.has(p));
    if (missing.length) throw new ForbiddenError('You cannot assign a role with permissions you do not hold');
  }
  const ids = [...new Set([...outletIds, ...(defaultOutletId ? [defaultOutletId] : [])])];
  if (ids.length) {
    const found = await OutletModel.countDocuments(orgFilter(ctx, { _id: { $in: ids }, status: { $ne: 'archived' } }));
    if (found !== ids.length) throw new NotFoundError('Outlet');
  }
  return role;
}

export async function updateMembership(ctx: RequestContext, membershipId: string, input: UpdateMembershipInput) {
  const membership = await MembershipModel.findOne(orgFilter<MembershipDoc>(ctx, { _id: membershipId }));
  if (!membership) throw new NotFoundError('Member');
  if (membership.isOwner) throw new ForbiddenError('The owner membership cannot be changed');
  if (String(membership._id) === String(ctx.membershipId)) throw new BusinessRuleError('You cannot change your own access');

  const before = {
    roleId: String(membership.roleId),
    outletAccess: membership.outletAccess,
    defaultOutletId: membership.defaultOutletId ? String(membership.defaultOutletId) : null,
    status: membership.status,
  };

  if (input.roleId || input.outletAccess || input.defaultOutletId !== undefined) {
    await assertRoleAndOutlets(
      ctx,
      input.roleId ?? String(membership.roleId),
      input.outletAccess?.outletIds ?? [],
      input.defaultOutletId ?? undefined,
    );
  }
  if (input.roleId) membership.roleId = new Types.ObjectId(input.roleId);
  if (input.outletAccess) membership.set('outletAccess', input.outletAccess);
  if (input.defaultOutletId !== undefined) membership.defaultOutletId = input.defaultOutletId ? new Types.ObjectId(input.defaultOutletId) : null;
  if (input.status && input.status !== 'invited') membership.status = input.status;
  await membership.save();

  if (membership.status === 'suspended') {
    await SessionModel.updateMany(
      { membershipId: membership._id, revokedAt: null },
      { $set: { revokedAt: new Date(), revokedReason: 'membership_suspended' } },
    );
  }
  invalidateAccessCache();

  const after = {
    roleId: String(membership.roleId),
    outletAccess: membership.outletAccess,
    defaultOutletId: membership.defaultOutletId ? String(membership.defaultOutletId) : null,
    status: membership.status,
  };
  await audit(ctx, {
    action: 'user.membership_updated',
    entityType: 'Membership',
    entityId: membership._id,
    summary: 'Updated member access',
    ...diffObjects(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>),
  });

  const [user, role] = await Promise.all([
    UserModel.findById(membership.userId).lean<UserDoc>(),
    RoleModel.findById(membership.roleId).lean<RoleDoc>(),
  ]);
  return toMembershipDto(membership.toObject() as MembershipDoc, user!, role!);
}

/* ---------------------------------------------------------------- invitations */

export async function listInvitations(ctx: RequestContext) {
  const invites = await InvitationModel.find(orgFilter<InvitationDoc>(ctx, { acceptedAt: null, revokedAt: null, expiresAt: { $gt: new Date() } }))
    .sort({ createdAt: -1 })
    .lean<InvitationDoc[]>();
  const roles = await RoleModel.find(trustedFilter({ _id: { $in: invites.map((i) => i.roleId) } })).select('name').lean<Pick<RoleDoc, '_id' | 'name'>[]>();
  const roleMap = new Map(roles.map((r) => [String(r._id), r.name]));
  return invites.map((i) => ({
    id: String(i._id),
    email: i.email,
    name: i.name,
    roleId: String(i.roleId),
    roleName: roleMap.get(String(i.roleId)) ?? '',
    outletAccess: { all: i.outletAccess?.all ?? false, outletIds: (i.outletAccess?.outletIds ?? []).map(String) },
    expiresAt: i.expiresAt.toISOString(),
    emailStatus: i.emailStatus,
    createdAt: i.createdAt?.toISOString() ?? new Date().toISOString(),
  }));
}

export async function inviteUser(ctx: RequestContext, input: InviteUserInput) {
  const org = await OrganizationModel.findById(ctx.organizationId).select('name subscription.limits').lean();
  const limit = org?.subscription?.limits?.users ?? 1;
  const [members, pending] = await Promise.all([
    MembershipModel.countDocuments(orgFilter<MembershipDoc>(ctx, { status: { $ne: 'suspended' } })),
    InvitationModel.countDocuments(orgFilter<InvitationDoc>(ctx, { acceptedAt: null, revokedAt: null, expiresAt: { $gt: new Date() } })),
  ]);
  if (members + pending >= limit) throw new PlanLimitError(`Your plan allows ${limit} user(s). Upgrade to invite more.`);

  const role = await assertRoleAndOutlets(ctx, input.roleId, input.outletAccess.outletIds, input.defaultOutletId);

  const existingUser = await UserModel.findOne({ email: input.email }).select('_id').lean();
  if (existingUser) {
    const existingMembership = await MembershipModel.exists({ userId: existingUser._id, organizationId: ctx.organizationId });
    if (existingMembership) throw new ConflictError('This person is already a member of your organization');
  }
  const openInvite = await InvitationModel.exists(
    orgFilter<InvitationDoc>(ctx, { email: input.email, acceptedAt: null, revokedAt: null, expiresAt: { $gt: new Date() } }),
  );
  if (openInvite) throw new ConflictError('An invitation is already pending for this email');

  const token = randomToken(32);
  const invitation = await InvitationModel.create({
    organizationId: ctx.organizationId,
    email: input.email,
    name: input.name,
    roleId: role._id,
    outletAccess: input.outletAccess,
    defaultOutletId: input.defaultOutletId ?? null,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000),
    invitedBy: ctx.userId,
  });

  const link = `${env.WEB_ORIGIN.split(',')[0]}/invite/${token}`;
  try {
    await sendEmail({
      to: [{ email: input.email, name: input.name }],
      subject: `You're invited to join ${org?.name ?? 'a pharmacy'} on PharmaOS`,
      html: `<p>Hi ${escapeHtml(input.name)},</p>
<p>You have been invited to join <strong>${escapeHtml(org?.name ?? '')}</strong> on PharmaOS as <strong>${escapeHtml(role.name)}</strong>.</p>
<p><a href="${link}">Accept the invitation</a> (valid for ${INVITE_TTL_DAYS} days).</p>
<p>If you were not expecting this, you can ignore this email.</p>`,
      text: `You have been invited to join ${org?.name ?? ''} on PharmaOS as ${role.name}. Accept: ${link}`,
      tags: ['invitation'],
    });
    invitation.emailStatus = 'sent';
  } catch (err) {
    invitation.emailStatus = 'failed';
    invitation.emailError = (err as Error).message.slice(0, 500);
    logger.warn({ err, invitationId: invitation._id }, 'invitation email failed');
  }
  await invitation.save();

  await audit(ctx, {
    action: 'user.invited',
    entityType: 'Invitation',
    entityId: invitation._id,
    summary: `Invited ${input.email} as ${role.name}`,
    after: { email: input.email, roleId: String(role._id), outletAccess: input.outletAccess },
  });

  return { id: String(invitation._id), email: invitation.email, emailStatus: invitation.emailStatus, expiresAt: invitation.expiresAt.toISOString() };
}

export async function revokeInvitation(ctx: RequestContext, id: string) {
  const invitation = await InvitationModel.findOne(orgFilter<InvitationDoc>(ctx, { _id: id, acceptedAt: null }));
  if (!invitation) throw new NotFoundError('Invitation');
  invitation.revokedAt = new Date();
  await invitation.save();
}

/** Public: shows the invitee what they are accepting. */
export async function previewInvitation(token: string) {
  const invitation = await InvitationModel.findOne({ tokenHash: sha256(token) }).lean<InvitationDoc>();
  if (!invitation || invitation.revokedAt || invitation.acceptedAt || invitation.expiresAt < new Date()) {
    throw new NotFoundError('Invitation');
  }
  const [org, role, existingUser] = await Promise.all([
    OrganizationModel.findById(invitation.organizationId).select('name').lean(),
    RoleModel.findById(invitation.roleId).select('name').lean(),
    UserModel.exists({ email: invitation.email }),
  ]);
  return {
    email: invitation.email,
    name: invitation.name,
    organizationName: org?.name ?? '',
    roleName: role?.name ?? '',
    requiresPassword: !existingUser,
    expiresAt: invitation.expiresAt.toISOString(),
  };
}

/** Public: accept an invitation. New users must supply a password; existing users just join. */
export async function acceptInvitation(input: { token: string; name?: string; password?: string }) {
  const invitation = await InvitationModel.findOne({ tokenHash: sha256(input.token) });
  if (!invitation || invitation.revokedAt || invitation.acceptedAt || invitation.expiresAt < new Date()) {
    throw new NotFoundError('Invitation');
  }

  let user = await UserModel.findOne({ email: invitation.email });
  if (!user) {
    if (!input.password) throw new AppError('VALIDATION_ERROR', 'A password is required to create your account', 400, {
      details: [{ path: 'body.password', message: 'Required' }],
    });
    user = await UserModel.create({
      email: invitation.email,
      name: input.name?.trim() || invitation.name,
      passwordHash: await hashPassword(input.password),
      emailVerifiedAt: new Date(),
    });
  }

  const existing = await MembershipModel.findOne({ userId: user._id, organizationId: invitation.organizationId });
  if (existing) throw new ConflictError('You are already a member of this organization');

  const membership = await MembershipModel.create({
    userId: user._id,
    organizationId: invitation.organizationId,
    roleId: invitation.roleId,
    outletAccess: invitation.outletAccess,
    defaultOutletId: invitation.defaultOutletId,
    isOwner: false,
    status: 'active',
    invitedBy: invitation.invitedBy,
    invitedAt: invitation.createdAt,
    joinedAt: new Date(),
  });
  invitation.acceptedAt = new Date();
  await invitation.save();

  return { user, membership };
}

/* ---------------------------------------------------------------- profile */

export async function updateProfile(ctx: RequestContext, input: UpdateProfileInput) {
  const user = await UserModel.findById(ctx.userId);
  if (!user) throw new NotFoundError('User');
  if (input.name !== undefined) user.name = input.name;
  if (input.phone !== undefined) user.phone = input.phone;
  await user.save();
  return toUserDto(user.toObject() as UserDoc);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
