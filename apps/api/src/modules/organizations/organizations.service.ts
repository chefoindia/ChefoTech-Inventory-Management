import type { UpdateOrganizationInput } from '@pharmaos/shared';
import { OrganizationModel, type OrganizationDoc } from '@/models/organization.model';
import type { RequestContext } from '@/lib/context';
import { NotFoundError } from '@/lib/errors';
import { audit, diffObjects } from '@/services/audit.service';
import { toOrganizationDto } from '@/modules/common/serializers';

export async function getOrganization(ctx: RequestContext) {
  const org = await OrganizationModel.findById(ctx.organizationId).lean<OrganizationDoc>();
  if (!org) throw new NotFoundError('Organization');
  return toOrganizationDto(org);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && !(v instanceof Map);
}

/** Deep merge of validated patch into existing settings (arrays replace, objects merge). */
function deepMerge(target: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...target };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k] as Record<string, unknown>, v) : v;
  }
  return out;
}

export async function updateOrganization(ctx: RequestContext, input: UpdateOrganizationInput) {
  const org = await OrganizationModel.findById(ctx.organizationId);
  if (!org) throw new NotFoundError('Organization');

  const plain = org.toObject() as OrganizationDoc;
  const before = toOrganizationDto(plain);

  if (input.name !== undefined) org.name = input.name;
  if (input.legalName !== undefined) org.legalName = input.legalName;
  if (input.email !== undefined) org.email = input.email;
  if (input.phone !== undefined) org.phone = input.phone;
  if (input.website !== undefined) org.website = input.website;
  if (input.financialYearStartMonth !== undefined) org.financialYearStartMonth = input.financialYearStartMonth;
  if (input.timezone !== undefined) org.timezone = input.timezone;
  if (input.address) org.set('address', { ...(plain.address ?? {}), ...input.address });
  if (input.tax) org.set('tax', { ...(plain.tax ?? {}), ...input.tax });

  if (input.settings) {
    const current = { ...((plain.settings ?? {}) as unknown as Record<string, unknown>) };
    if (current.numbering instanceof Map) current.numbering = Object.fromEntries(current.numbering.entries());
    const { numbering, ...rest } = input.settings;
    const merged = deepMerge(current, rest as Record<string, unknown>);
    if (numbering) {
      merged.numbering = { ...((current.numbering as Record<string, unknown>) ?? {}), ...numbering };
    }
    org.set('settings', merged);
  }

  await org.save();
  const after = toOrganizationDto(org.toObject() as OrganizationDoc);
  await audit(ctx, {
    action: 'organization.updated',
    entityType: 'Organization',
    entityId: org._id,
    summary: 'Updated organization profile or settings',
    ...diffObjects(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>),
  });
  return after;
}
