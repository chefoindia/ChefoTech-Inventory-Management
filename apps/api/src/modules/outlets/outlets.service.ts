import type { CreateOutletInput, UpdateOutletInput } from '@pharmaos/shared';
import { OutletModel, type OutletDoc } from '@/models/outlet.model';
import { OrganizationModel } from '@/models/organization.model';
import { MembershipModel } from '@/models/membership.model';
import type { RequestContext } from '@/lib/context';
import { canAccessOutlet } from '@/lib/context';
import { orgFilter, findOrgDocOrThrow } from '@/lib/scoped';
import { BusinessRuleError, ConflictError, ForbiddenError, PlanLimitError } from '@/lib/errors';
import { audit, diffObjects } from '@/services/audit.service';
import { invalidateAccessCache } from '@/middleware/authenticate';
import { toOutletDto } from '@/modules/common/serializers';

/** Outlets visible to the caller (all for owner / all-access, otherwise assigned ones). */
export async function listOutlets(ctx: RequestContext, includeArchived = false) {
  const filter = orgFilter<OutletDoc>(ctx, {
    ...(includeArchived ? {} : { status: { $ne: 'archived' } }),
    ...(ctx.outletAccess !== null ? { _id: { $in: ctx.outletAccess } } : {}),
  });
  const outlets = await OutletModel.find(filter).sort({ isDefault: -1, name: 1 }).lean<OutletDoc[]>();
  return outlets.map(toOutletDto);
}

export async function getOutlet(ctx: RequestContext, id: string) {
  const outlet = await findOrgDocOrThrow(OutletModel, ctx, id, 'Outlet');
  if (!canAccessOutlet(ctx, outlet._id)) throw new ForbiddenError('You do not have access to this outlet');
  return toOutletDto(outlet.toObject() as OutletDoc);
}

export async function createOutlet(ctx: RequestContext, input: CreateOutletInput) {
  const org = await OrganizationModel.findById(ctx.organizationId).select('subscription.limits').lean();
  const limit = org?.subscription?.limits?.outlets ?? 1;
  const count = await OutletModel.countDocuments(orgFilter<OutletDoc>(ctx, { status: { $ne: 'archived' } }));
  if (count >= limit) throw new PlanLimitError(`Your plan allows ${limit} outlet(s). Upgrade to add more.`);

  const clash = await OutletModel.exists(orgFilter<OutletDoc>(ctx, { code: input.code }));
  if (clash) throw new ConflictError('An outlet with this code already exists', [{ path: 'code', message: 'Already in use' }]);

  const outlet = await OutletModel.create({
    organizationId: ctx.organizationId,
    ...input,
    address: input.address ?? {},
    settings: input.settings ?? {},
    isDefault: count === 0,
    createdBy: ctx.userId,
  });

  // Members with explicit outlet lists do not automatically gain the new outlet; owners and
  // all-access members do. Nothing to update here, but caches must refresh outlet visibility.
  invalidateAccessCache();

  await audit(ctx, {
    action: 'outlet.created',
    entityType: 'Outlet',
    entityId: outlet._id,
    summary: `Created outlet "${outlet.name}" (${outlet.code})`,
    after: { name: outlet.name, code: outlet.code, stateCode: outlet.stateCode },
  });
  return toOutletDto(outlet.toObject() as OutletDoc);
}

export async function updateOutlet(ctx: RequestContext, id: string, input: UpdateOutletInput) {
  const outlet = await findOrgDocOrThrow(OutletModel, ctx, id, 'Outlet');
  if (!canAccessOutlet(ctx, outlet._id)) throw new ForbiddenError('You do not have access to this outlet');
  if (outlet.status === 'archived') throw new BusinessRuleError('Archived outlets cannot be edited');

  if (input.code && input.code !== outlet.code) {
    const clash = await OutletModel.exists(orgFilter<OutletDoc>(ctx, { code: input.code, _id: { $ne: outlet._id } }));
    if (clash) throw new ConflictError('An outlet with this code already exists', [{ path: 'code', message: 'Already in use' }]);
  }

  const plain = outlet.toObject() as OutletDoc;
  const before = toOutletDto(plain);
  const { address, settings, ...scalars } = input;
  for (const [k, v] of Object.entries(scalars)) if (v !== undefined) outlet.set(k, v);
  if (address) outlet.set('address', { ...(plain.address ?? {}), ...address });
  if (settings) outlet.set('settings', { ...(plain.settings ?? {}), ...settings });
  outlet.updatedBy = ctx.userId;
  await outlet.save();

  const after = toOutletDto(outlet.toObject() as OutletDoc);
  await audit(ctx, {
    action: 'outlet.updated',
    entityType: 'Outlet',
    entityId: outlet._id,
    summary: `Updated outlet "${outlet.name}"`,
    ...diffObjects(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>),
  });
  return after;
}

export async function archiveOutlet(ctx: RequestContext, id: string) {
  const outlet = await findOrgDocOrThrow(OutletModel, ctx, id, 'Outlet');
  if (outlet.isDefault) throw new BusinessRuleError('The default outlet cannot be archived');
  const active = await OutletModel.countDocuments(orgFilter<OutletDoc>(ctx, { status: { $ne: 'archived' } }));
  if (active <= 1) throw new BusinessRuleError('At least one active outlet is required');

  outlet.status = 'archived';
  outlet.updatedBy = ctx.userId;
  await outlet.save();

  // Members whose default outlet was this one fall back to none.
  await MembershipModel.updateMany(
    { organizationId: ctx.organizationId, defaultOutletId: outlet._id },
    { $set: { defaultOutletId: null } },
  );
  invalidateAccessCache();

  await audit(ctx, {
    action: 'outlet.archived',
    entityType: 'Outlet',
    entityId: outlet._id,
    summary: `Archived outlet "${outlet.name}"`,
  });
  return toOutletDto(outlet.toObject() as OutletDoc);
}
