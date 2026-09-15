import type { CreateCustomerInput, UpdateCustomerInput, CustomerDto, PartyListQuery, AttachmentRef, LedgerAdjustmentInput } from '@pharmaos/shared';
import { CustomerModel, type CustomerDoc } from '@/models/customer.model';
import { normalizeName } from '@/models/product.model';
import type { RequestContext } from '@/lib/context';
import { orgFilter, findOrgDocOrThrow } from '@/lib/scoped';
import { pageOptions, pageMeta, escapeRegex } from '@/lib/pagination';
import { BusinessRuleError } from '@/lib/errors';
import { withTransaction } from '@/db/transaction';
import { audit, diffObjects } from '@/services/audit.service';
import { postLedgerEntry, type PartyType } from '@/services/ledger.service';
import { validateCustomFields } from '@/modules/custom-fields/custom-fields.service';

export function toCustomerDto(c: CustomerDoc): CustomerDto {
  return {
    id: String(c._id),
    name: c.name,
    phone: c.phone,
    altPhone: c.altPhone ?? '',
    email: c.email ?? '',
    address: (c.address ?? {}) as CustomerDto['address'],
    gstin: c.gstin ?? '',
    stateCode: c.stateCode ?? '',
    dateOfBirth: c.dateOfBirth ? c.dateOfBirth.toISOString() : null,
    gender: c.gender ?? '',
    creditLimitMinor: c.creditLimitMinor ?? 0,
    creditDays: c.creditDays ?? null,
    openingBalanceMinor: c.openingBalanceMinor ?? 0,
    balanceMinor: c.balanceMinor ?? 0,
    defaultDiscountBps: c.defaultDiscountBps ?? 0,
    tags: c.tags ?? [],
    documents: (c.documents ?? []) as AttachmentRef[],
    notes: c.notes ?? '',
    customFields: (c.customFields as Record<string, unknown>) ?? {},
    status: (c.status ?? 'active') as CustomerDto['status'],
    lastPurchaseAt: c.lastPurchaseAt ? c.lastPurchaseAt.toISOString() : null,
    totalPurchasesMinor: c.totalPurchasesMinor ?? 0,
    createdAt: c.createdAt?.toISOString?.() ?? new Date().toISOString(),
  };
}

export async function listCustomers(ctx: RequestContext, query: PartyListQuery) {
  const filter = orgFilter<CustomerDoc>(ctx, {
    ...(query.status ? { status: query.status } : { status: { $ne: 'archived' } }),
    ...(query.hasBalance ? { balanceMinor: { $gt: 0 } } : {}),
    ...(query.q ? { $or: [{ nameNormalized: { $regex: escapeRegex(normalizeName(query.q)) } }, { phone: { $regex: escapeRegex(query.q) } }, { email: { $regex: escapeRegex(query.q.toLowerCase()) } }] } : {}),
  });
  const { skip, limit, sort } = pageOptions(query, ['name', 'balanceMinor', 'createdAt', 'lastPurchaseAt'], { nameNormalized: 1 });
  const [items, total] = await Promise.all([
    CustomerModel.find(filter).sort(sort).skip(skip).limit(limit).lean<CustomerDoc[]>(),
    CustomerModel.countDocuments(filter),
  ]);
  return { items: items.map(toCustomerDto), meta: pageMeta(query, total) };
}

/** Quick lookup for POS: phone or name prefix. */
export async function searchCustomers(ctx: RequestContext, q: string, limit = 10) {
  const items = await CustomerModel.find(
    orgFilter<CustomerDoc>(ctx, { status: 'active', $or: [{ phone: { $regex: `^${escapeRegex(q)}` } }, { nameNormalized: { $regex: `^${escapeRegex(normalizeName(q))}` } }] }),
  )
    .sort({ nameNormalized: 1 })
    .limit(limit)
    .lean<CustomerDoc[]>();
  return items.map(toCustomerDto);
}

export async function getCustomer(ctx: RequestContext, id: string) {
  const c = await findOrgDocOrThrow(CustomerModel, ctx, id, 'Customer');
  return toCustomerDto(c.toObject() as CustomerDoc);
}

export async function createCustomer(ctx: RequestContext, input: CreateCustomerInput) {
  const customFields = await validateCustomFields(ctx, 'customer', input.customFields);
  const duplicate = await CustomerModel.findOne(orgFilter<CustomerDoc>(ctx, { phone: input.phone, status: { $ne: 'archived' } })).select('name').lean<CustomerDoc>();
  const customer = await withTransaction(async (session) => {
    const [doc] = await CustomerModel.create(
      [{ organizationId: ctx.organizationId, ...input, nameNormalized: normalizeName(input.name), customFields, balanceMinor: 0, createdBy: ctx.userId }],
      { session },
    );
    if (input.openingBalanceMinor) {
      await postLedgerEntry(
        ctx,
        {
          partyType: 'customer',
          partyId: doc!._id,
          type: 'opening',
          refType: 'Customer',
          refId: doc!._id,
          debitMinor: input.openingBalanceMinor > 0 ? input.openingBalanceMinor : 0,
          creditMinor: input.openingBalanceMinor < 0 ? -input.openingBalanceMinor : 0,
          note: 'Opening balance',
        },
        session,
      );
    }
    await audit(ctx, { action: 'customer.created', entityType: 'Customer', entityId: doc!._id, summary: `Created customer "${input.name}"`, after: { name: input.name, phone: input.phone, creditLimitMinor: input.creditLimitMinor }, metadata: duplicate ? { duplicatePhoneOf: String(duplicate._id) } : undefined }, session);
    return doc!;
  });
  const dto = await getCustomer(ctx, String(customer._id));
  return { ...dto, duplicatePhoneWarning: duplicate ? `Another customer "${duplicate.name}" has the same phone number` : undefined };
}

export async function updateCustomer(ctx: RequestContext, id: string, input: UpdateCustomerInput) {
  const customer = await findOrgDocOrThrow(CustomerModel, ctx, id, 'Customer');
  const before = toCustomerDto(customer.toObject() as CustomerDoc);
  if (input.openingBalanceMinor !== undefined && input.openingBalanceMinor !== customer.openingBalanceMinor) {
    throw new BusinessRuleError('Opening balance cannot be edited; post a ledger adjustment instead');
  }
  const { customFields, openingBalanceMinor: _ob, address, ...rest } = input;
  for (const [k, v] of Object.entries(rest)) if (v !== undefined) customer.set(k, v);
  if (address) customer.set('address', { ...before.address, ...address });
  if (customFields !== undefined) customer.set('customFields', await validateCustomFields(ctx, 'customer', customFields, { partial: true }));
  if (input.name) customer.nameNormalized = normalizeName(input.name);
  customer.updatedBy = ctx.userId;
  await customer.save();
  const after = toCustomerDto(customer.toObject() as CustomerDoc);
  await audit(ctx, { action: 'customer.updated', entityType: 'Customer', entityId: customer._id, summary: `Updated customer "${customer.name}"`, ...diffObjects(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>) });
  return after;
}

export async function addCustomerDocument(ctx: RequestContext, id: string, ref: AttachmentRef) {
  const customer = await findOrgDocOrThrow(CustomerModel, ctx, id, 'Customer');
  if (customer.documents.length >= 20) throw new BusinessRuleError('Maximum 20 documents per customer');
  customer.documents.push(ref);
  await customer.save();
  return toCustomerDto(customer.toObject() as CustomerDoc);
}

export async function removeCustomerDocument(ctx: RequestContext, id: string, publicId: string) {
  const customer = await findOrgDocOrThrow(CustomerModel, ctx, id, 'Customer');
  customer.set('documents', customer.documents.filter((d) => d.publicId !== publicId));
  await customer.save();
  return toCustomerDto(customer.toObject() as CustomerDoc);
}

/** Manual ledger adjustment (write-off, correction). Audited; requires adjustBalance permission. */
export async function adjustBalance(ctx: RequestContext, partyType: PartyType, input: LedgerAdjustmentInput) {
  return withTransaction(async (session) => {
    const entry = await postLedgerEntry(
      ctx,
      {
        partyType,
        partyId: new (await import('mongoose')).Types.ObjectId(input.partyId),
        type: 'adjustment',
        refType: 'Adjustment',
        debitMinor: input.amountMinor > 0 ? input.amountMinor : 0,
        creditMinor: input.amountMinor < 0 ? -input.amountMinor : 0,
        note: input.reason,
      },
      session,
    );
    await audit(ctx, { action: `${partyType}.balanceAdjusted`, entityType: partyType === 'customer' ? 'Customer' : 'Supplier', entityId: input.partyId, summary: `Adjusted balance by ${input.amountMinor / 100}: ${input.reason}`, after: { amountMinor: input.amountMinor, reason: input.reason } }, session);
    return { balanceAfterMinor: entry.balanceAfterMinor };
  });
}
