import type { ClientSession, Types } from 'mongoose';
import type { CreateUnitInput, UnitDto } from '@pharmaos/shared';
import { UnitModel, DEFAULT_UNITS, type UnitDoc } from '@/models/unit.model';
import { ProductModel } from '@/models/product.model';
import { normalizeName } from '@/models/product.model';
import type { RequestContext } from '@/lib/context';
import { orgFilter, findOrgDocOrThrow } from '@/lib/scoped';
import { ConflictError, BusinessRuleError } from '@/lib/errors';
import { audit } from '@/services/audit.service';

export function toUnitDto(u: UnitDoc): UnitDto {
  return {
    id: String(u._id),
    name: u.name,
    abbreviation: u.abbreviation,
    allowsDecimal: u.allowsDecimal ?? false,
    isSystem: u.isSystem ?? false,
    status: (u.status ?? 'active') as UnitDto['status'],
  };
}

export async function seedDefaultUnits(organizationId: Types.ObjectId, session?: ClientSession): Promise<void> {
  await UnitModel.create(
    DEFAULT_UNITS.map((u) => ({
      organizationId,
      name: u.name,
      nameNormalized: normalizeName(u.name),
      abbreviation: u.abbreviation,
      allowsDecimal: u.allowsDecimal ?? false,
      isSystem: true,
    })),
    { session, ordered: true },
  );
}

/** Organizations created before unit seeding existed get the defaults on first use. */
async function ensureUnits(ctx: RequestContext): Promise<void> {
  const count = await UnitModel.countDocuments(orgFilter<UnitDoc>(ctx, {}));
  if (count === 0) await seedDefaultUnits(ctx.organizationId, undefined);
}

export async function listUnits(ctx: RequestContext, includeInactive = false) {
  await ensureUnits(ctx);
  const units = await UnitModel.find(orgFilter<UnitDoc>(ctx, includeInactive ? {} : { status: 'active' }))
    .sort({ isSystem: -1, name: 1 })
    .lean<UnitDoc[]>();
  return units.map(toUnitDto);
}

export async function createUnit(ctx: RequestContext, input: CreateUnitInput) {
  const nameNormalized = normalizeName(input.name);
  const clash = await UnitModel.exists(orgFilter<UnitDoc>(ctx, { nameNormalized }));
  if (clash) throw new ConflictError('A unit with this name already exists', [{ path: 'name', message: 'Already exists' }]);
  const unit = await UnitModel.create({ organizationId: ctx.organizationId, ...input, nameNormalized });
  await audit(ctx, { action: 'unit.created', entityType: 'Unit', entityId: unit._id, summary: `Created unit "${unit.name}"`, after: input });
  return toUnitDto(unit.toObject() as UnitDoc);
}

export async function updateUnit(ctx: RequestContext, id: string, input: Partial<CreateUnitInput> & { status?: string }) {
  const unit = await findOrgDocOrThrow(UnitModel, ctx, id, 'Unit');
  if (input.name && normalizeName(input.name) !== unit.nameNormalized) {
    const clash = await UnitModel.exists(orgFilter<UnitDoc>(ctx, { nameNormalized: normalizeName(input.name), _id: { $ne: unit._id } }));
    if (clash) throw new ConflictError('A unit with this name already exists', [{ path: 'name', message: 'Already exists' }]);
    unit.name = input.name;
    unit.nameNormalized = normalizeName(input.name);
  }
  if (input.abbreviation !== undefined) unit.abbreviation = input.abbreviation;
  if (input.allowsDecimal !== undefined) unit.allowsDecimal = input.allowsDecimal;
  if (input.status !== undefined) {
    if (input.status !== 'active') {
      const inUse = await ProductModel.countDocuments(orgFilter(ctx, { 'units.unitId': unit._id, status: { $ne: 'archived' } }));
      if (inUse > 0) throw new BusinessRuleError(`Unit is used by ${inUse} product(s) and cannot be deactivated`);
    }
    unit.status = input.status as UnitDoc['status'];
  }
  await unit.save();
  await audit(ctx, { action: 'unit.updated', entityType: 'Unit', entityId: unit._id, summary: `Updated unit "${unit.name}"`, after: input });
  return toUnitDto(unit.toObject() as UnitDoc);
}
