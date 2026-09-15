import mongoose, { Types, type Model, type QueryFilter } from 'mongoose';
import type { RequestContext } from './context';
import { NotFoundError, ForbiddenError } from './errors';

/**
 * Tenant-scoping helpers. Every query on an organization-owned collection must go through
 * these so that `organizationId` (and `outletId` for outlet-scoped models) is always applied.
 */

export interface OrgScopedDoc {
  organizationId: Types.ObjectId;
}

export interface OutletScopedDoc extends OrgScopedDoc {
  outletId: Types.ObjectId;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyModel = Model<any, any, any, any, any, any>;
type DocOf<M extends AnyModel> = NonNullable<Awaited<ReturnType<M['findOne']>>>;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && !(v instanceof Types.ObjectId) && !(v instanceof RegExp);
}

/**
 * `mongoose.set('sanitizeFilter', true)` is on globally: any object value in a filter that was
 * not explicitly marked trusted is treated as a literal (so `{ $gt: '' }` from a request can
 * never become an operator). Server-built filters mark their operator values trusted here.
 * All request input is zod-validated to scalars before it reaches a filter, so this helper is
 * only ever called with values the server constructed. `$and` / `$or` / `$nor` arrays recurse.
 */
export function trustedFilter<T>(filter: QueryFilter<T>): QueryFilter<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(filter as Record<string, unknown>)) {
    if (Array.isArray(value) && key.startsWith('$')) {
      out[key] = value.map((v) => (isPlainObject(v) ? trustedFilter(v as QueryFilter<T>) : v));
      continue;
    }
    out[key] = isPlainObject(value) ? mongoose.trusted(value) : value;
  }
  return out as QueryFilter<T>;
}

export function orgFilter<T extends OrgScopedDoc>(
  ctx: Pick<RequestContext, 'organizationId'>,
  filter: Record<string, unknown> = {},
): QueryFilter<T> {
  return trustedFilter<T>({ ...filter, organizationId: ctx.organizationId } as unknown as QueryFilter<T>);
}

export function outletFilter<T extends OutletScopedDoc>(
  ctx: Pick<RequestContext, 'organizationId' | 'outletId'>,
  filter: Record<string, unknown> = {},
): QueryFilter<T> {
  if (!ctx.outletId) throw new ForbiddenError('An active outlet is required for this action');
  return trustedFilter<T>({ ...filter, organizationId: ctx.organizationId, outletId: ctx.outletId } as unknown as QueryFilter<T>);
}

/** Find one org-scoped document by id or throw NotFound (never reveals other tenants' existence). */
export async function findOrgDocOrThrow<M extends AnyModel>(
  model: M,
  ctx: Pick<RequestContext, 'organizationId'>,
  id: Types.ObjectId | string,
  entityName: string,
): Promise<DocOf<M>> {
  const doc = await model.findOne({ _id: id, organizationId: ctx.organizationId });
  if (!doc) throw new NotFoundError(entityName);
  return doc as DocOf<M>;
}

/** Assert that a referenced document belongs to the caller's organization. */
export async function assertSameOrg(
  model: AnyModel,
  ctx: Pick<RequestContext, 'organizationId'>,
  id: Types.ObjectId | string | undefined | null,
  entityName: string,
): Promise<void> {
  if (!id) return;
  const exists = await model.exists({ _id: id, organizationId: ctx.organizationId });
  if (!exists) throw new NotFoundError(entityName);
}
