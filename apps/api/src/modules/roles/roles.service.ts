import type { ClientSession, Types } from 'mongoose';
import { SYSTEM_ROLES, type CreateRoleInput, type UpdateRoleInput, type RoleDto, type PaginationQuery } from '@pharmaos/shared';
import { RoleModel, type RoleDoc } from '@/models/role.model';
import { MembershipModel } from '@/models/membership.model';
import type { RequestContext } from '@/lib/context';
import { orgFilter, findOrgDocOrThrow } from '@/lib/scoped';
import { BusinessRuleError, ConflictError, ForbiddenError } from '@/lib/errors';
import { audit, diffObjects } from '@/services/audit.service';
import { invalidateAccessCache } from '@/middleware/authenticate';

export function toRoleDto(role: RoleDoc & { memberCount?: number }): RoleDto {
  return {
    id: String(role._id),
    key: role.key,
    name: role.name,
    description: role.description ?? '',
    permissions: role.permissions,
    isSystem: role.isSystem,
    memberCount: role.memberCount,
    createdAt: role.createdAt?.toISOString?.() ?? new Date().toISOString(),
  };
}

/** Called once when an organization is created. Returns the owner role. */
export async function seedSystemRoles(
  organizationId: Types.ObjectId,
  createdBy: Types.ObjectId,
  session: ClientSession,
): Promise<RoleDoc> {
  const docs = await RoleModel.create(
    SYSTEM_ROLES.map((r) => ({
      organizationId,
      key: r.key,
      name: r.name,
      description: r.description,
      permissions: r.permissions,
      isSystem: true,
      createdBy,
    })),
    { session, ordered: true },
  );
  const owner = docs.find((d) => d.key === 'owner');
  if (!owner) throw new Error('Owner role missing after seed');
  return owner as unknown as RoleDoc;
}

export async function listRoles(ctx: RequestContext, query: PaginationQuery) {
  const filter = orgFilter<RoleDoc>(ctx, { status: 'active' });
  const roles = await RoleModel.find(filter).sort({ isSystem: -1, name: 1 }).lean<RoleDoc[]>();
  const counts = await MembershipModel.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { organizationId: ctx.organizationId, status: { $ne: 'suspended' } } },
    { $group: { _id: '$roleId', count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((c) => [String(c._id), c.count]));
  const items = roles.map((r) => toRoleDto({ ...r, memberCount: countMap.get(String(r._id)) ?? 0 }));
  const filtered = query.q ? items.filter((r) => r.name.toLowerCase().includes(query.q!.toLowerCase())) : items;
  return filtered;
}

export async function getRole(ctx: RequestContext, id: string) {
  const role = await findOrgDocOrThrow(RoleModel, ctx, id, 'Role');
  return toRoleDto(role.toObject() as RoleDoc);
}

function slugifyKey(name: string): string {
  return (
    'custom_' +
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40)
  );
}

export async function createRole(ctx: RequestContext, input: CreateRoleInput) {
  assertGrantable(ctx, input.permissions);
  let key = slugifyKey(input.name);
  const clash = await RoleModel.exists(orgFilter<RoleDoc>(ctx, { key }));
  if (clash) key = `${key}_${Date.now().toString(36)}`;

  const role = await RoleModel.create({
    organizationId: ctx.organizationId,
    key,
    name: input.name,
    description: input.description ?? '',
    permissions: input.permissions,
    isSystem: false,
    createdBy: ctx.userId,
  });
  await audit(ctx, {
    action: 'role.created',
    entityType: 'Role',
    entityId: role._id,
    summary: `Created role "${role.name}"`,
    after: { name: role.name, permissions: role.permissions },
  });
  return toRoleDto(role.toObject() as RoleDoc);
}

export async function updateRole(ctx: RequestContext, id: string, input: UpdateRoleInput) {
  const role = await findOrgDocOrThrow(RoleModel, ctx, id, 'Role');
  if (role.key === 'owner') throw new ForbiddenError('The Owner role cannot be modified');
  if (input.permissions) assertGrantable(ctx, input.permissions);

  const before = { name: role.name, description: role.description, permissions: [...role.permissions] };
  if (input.name !== undefined && !role.isSystem) role.name = input.name;
  if (input.name !== undefined && role.isSystem && input.name !== role.name) {
    throw new BusinessRuleError('System roles cannot be renamed; create a custom role instead');
  }
  if (input.description !== undefined) role.description = input.description;
  if (input.permissions !== undefined) role.permissions = input.permissions;
  role.updatedBy = ctx.userId;
  await role.save();
  invalidateAccessCache();

  const after = { name: role.name, description: role.description, permissions: [...role.permissions] };
  await audit(ctx, {
    action: 'role.updated',
    entityType: 'Role',
    entityId: role._id,
    summary: `Updated role "${role.name}"`,
    ...diffObjects(before, after),
  });
  return toRoleDto(role.toObject() as RoleDoc);
}

export async function deleteRole(ctx: RequestContext, id: string) {
  const role = await findOrgDocOrThrow(RoleModel, ctx, id, 'Role');
  if (role.isSystem) throw new ForbiddenError('System roles cannot be deleted');
  const inUse = await MembershipModel.countDocuments({ organizationId: ctx.organizationId, roleId: role._id });
  if (inUse > 0) throw new ConflictError(`Role is assigned to ${inUse} member(s); reassign them first`);
  role.status = 'archived';
  role.updatedBy = ctx.userId;
  await role.save();
  await audit(ctx, {
    action: 'role.deleted',
    entityType: 'Role',
    entityId: role._id,
    summary: `Deleted role "${role.name}"`,
    before: { name: role.name, permissions: role.permissions },
  });
}

/**
 * Privilege-escalation guard: a non-owner may only grant permissions they hold themselves.
 */
function assertGrantable(ctx: RequestContext, permissions: string[]) {
  if (ctx.isOwner) return;
  const missing = permissions.filter((p) => !ctx.permissions.has(p));
  if (missing.length) {
    throw new ForbiddenError(`You cannot grant permissions you do not hold: ${missing.slice(0, 5).join(', ')}`);
  }
}
