import type { CreateCustomFieldInput, UpdateCustomFieldInput, CustomFieldDto, CustomFieldEntity } from '@pharmaos/shared';
import { CustomFieldDefinitionModel, type CustomFieldDefinitionDoc } from '@/models/custom-field.model';
import type { RequestContext } from '@/lib/context';
import { orgFilter, findOrgDocOrThrow } from '@/lib/scoped';
import { ConflictError, ValidationError } from '@/lib/errors';
import { audit } from '@/services/audit.service';

export function toCustomFieldDto(d: CustomFieldDefinitionDoc): CustomFieldDto {
  return {
    id: String(d._id),
    entity: d.entity as CustomFieldEntity,
    key: d.key,
    label: d.label,
    type: d.type as CustomFieldDto['type'],
    required: d.required ?? false,
    defaultValue: d.defaultValue ?? undefined,
    options: (d.options ?? []).map((o) => ({ label: o.label ?? '', value: o.value ?? '' })),
    validation: {
      min: d.validation?.min ?? undefined,
      max: d.validation?.max ?? undefined,
      maxLength: d.validation?.maxLength ?? undefined,
      pattern: d.validation?.pattern ?? undefined,
    },
    visibility: { list: d.visibility?.list ?? false, form: d.visibility?.form ?? true, print: d.visibility?.print ?? false },
    sortOrder: d.sortOrder ?? 0,
    helpText: d.helpText ?? '',
    status: (d.status ?? 'active') as 'active' | 'archived',
  };
}

export async function listDefinitions(ctx: RequestContext, entity?: string, includeArchived = false) {
  const defs = await CustomFieldDefinitionModel.find(
    orgFilter<CustomFieldDefinitionDoc>(ctx, { ...(entity ? { entity } : {}), ...(includeArchived ? {} : { status: 'active' }) }),
  )
    .sort({ entity: 1, sortOrder: 1, createdAt: 1 })
    .lean<CustomFieldDefinitionDoc[]>();
  return defs.map(toCustomFieldDto);
}

export async function createDefinition(ctx: RequestContext, input: CreateCustomFieldInput) {
  const clash = await CustomFieldDefinitionModel.exists(orgFilter<CustomFieldDefinitionDoc>(ctx, { entity: input.entity, key: input.key }));
  if (clash) throw new ConflictError('A field with this key already exists for this entity', [{ path: 'key', message: 'Already in use' }]);
  if ((input.type === 'dropdown' || input.type === 'multiSelect') && input.options.length === 0) {
    throw new ValidationError('Dropdown fields need at least one option', [{ path: 'body.options', message: 'Add at least one option' }]);
  }
  const doc = await CustomFieldDefinitionModel.create({ organizationId: ctx.organizationId, ...input, createdBy: ctx.userId });
  await audit(ctx, { action: 'customField.created', entityType: 'CustomFieldDefinition', entityId: doc._id, summary: `Added custom field "${input.label}" to ${input.entity}`, after: input });
  return toCustomFieldDto(doc.toObject() as CustomFieldDefinitionDoc);
}

export async function updateDefinition(ctx: RequestContext, id: string, input: UpdateCustomFieldInput) {
  const doc = await findOrgDocOrThrow(CustomFieldDefinitionModel, ctx, id, 'Custom field');
  const before = toCustomFieldDto(doc.toObject() as CustomFieldDefinitionDoc);
  for (const [k, v] of Object.entries(input)) if (v !== undefined) doc.set(k, v);
  await doc.save();
  const after = toCustomFieldDto(doc.toObject() as CustomFieldDefinitionDoc);
  await audit(ctx, { action: 'customField.updated', entityType: 'CustomFieldDefinition', entityId: doc._id, summary: `Updated custom field "${after.label}"`, before, after });
  return after;
}

export async function archiveDefinition(ctx: RequestContext, id: string) {
  const doc = await findOrgDocOrThrow(CustomFieldDefinitionModel, ctx, id, 'Custom field');
  doc.status = 'archived';
  await doc.save();
  await audit(ctx, { action: 'customField.archived', entityType: 'CustomFieldDefinition', entityId: doc._id, summary: `Archived custom field "${doc.label}"` });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9\s-]{7,15}$/;
const URL_RE = /^https?:\/\/[^\s]+$/;

/**
 * Validates a custom-field value map against the active definitions for an entity and returns a
 * cleaned map containing only known keys with correctly typed values. Server-side only; never
 * trust client-side validation of custom fields.
 */
export async function validateCustomFields(
  ctx: RequestContext,
  entity: CustomFieldEntity,
  values: Record<string, unknown> | undefined,
  options: { partial?: boolean } = {},
): Promise<Record<string, unknown>> {
  const defs = await CustomFieldDefinitionModel.find(orgFilter<CustomFieldDefinitionDoc>(ctx, { entity, status: 'active' })).lean<CustomFieldDefinitionDoc[]>();
  const input = values ?? {};
  const out: Record<string, unknown> = {};
  const errors: { path: string; message: string }[] = [];

  for (const def of defs) {
    const raw = input[def.key];
    const present = raw !== undefined && raw !== null && raw !== '';
    if (!present) {
      if (def.required && !options.partial) errors.push({ path: `body.customFields.${def.key}`, message: `${def.label} is required` });
      else if (!options.partial && def.defaultValue !== null && def.defaultValue !== undefined) out[def.key] = def.defaultValue;
      else if (raw === null || raw === '') out[def.key] = null;
      continue;
    }
    const fail = (message: string) => errors.push({ path: `body.customFields.${def.key}`, message });
    const v = def.validation ?? {};
    switch (def.type) {
      case 'text':
      case 'longText':
      case 'email':
      case 'phone':
      case 'url': {
        if (typeof raw !== 'string') { fail('Must be text'); break; }
        const s = raw.trim();
        if (v.maxLength && s.length > v.maxLength) { fail(`Max ${v.maxLength} characters`); break; }
        if (def.type === 'email' && !EMAIL_RE.test(s)) { fail('Invalid email'); break; }
        if (def.type === 'phone' && !PHONE_RE.test(s)) { fail('Invalid phone'); break; }
        if (def.type === 'url' && !URL_RE.test(s)) { fail('Invalid URL'); break; }
        if (v.pattern) {
          try {
            if (!new RegExp(v.pattern).test(s)) { fail('Invalid format'); break; }
          } catch { /* ignore bad pattern */ }
        }
        out[def.key] = s;
        break;
      }
      case 'number':
      case 'decimal': {
        const n = typeof raw === 'number' ? raw : Number(raw);
        if (!Number.isFinite(n)) { fail('Must be a number'); break; }
        if (def.type === 'number' && !Number.isInteger(n)) { fail('Must be a whole number'); break; }
        if (v.min !== null && v.min !== undefined && n < v.min) { fail(`Minimum ${v.min}`); break; }
        if (v.max !== null && v.max !== undefined && n > v.max) { fail(`Maximum ${v.max}`); break; }
        out[def.key] = n;
        break;
      }
      case 'date':
      case 'datetime': {
        const d = new Date(raw as string);
        if (Number.isNaN(d.getTime())) { fail('Invalid date'); break; }
        out[def.key] = d;
        break;
      }
      case 'boolean':
        out[def.key] = raw === true || raw === 'true';
        break;
      case 'dropdown': {
        const allowed = (def.options ?? []).map((o) => o.value);
        if (typeof raw !== 'string' || !allowed.includes(raw)) { fail('Choose a valid option'); break; }
        out[def.key] = raw;
        break;
      }
      case 'multiSelect': {
        const allowed = new Set((def.options ?? []).map((o) => o.value));
        if (!Array.isArray(raw) || !raw.every((x) => typeof x === 'string' && allowed.has(x))) { fail('Choose valid options'); break; }
        out[def.key] = raw;
        break;
      }
      case 'file':
      case 'image': {
        const r = raw as { publicId?: unknown; provider?: unknown };
        if (typeof r !== 'object' || typeof r.publicId !== 'string' || r.provider !== 'cloudinary') { fail('Upload a file first'); break; }
        out[def.key] = raw;
        break;
      }
      default:
        out[def.key] = raw;
    }
  }
  if (errors.length) throw new ValidationError('Please check the custom fields', errors);
  return options.partial ? { ...(values ?? {}), ...out } : out;
}
