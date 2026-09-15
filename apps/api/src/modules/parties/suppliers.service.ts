import type { CreateSupplierInput, UpdateSupplierInput, SupplierDto, PartyListQuery, AttachmentRef } from '@pharmaos/shared';
import { SupplierModel, type SupplierDoc } from '@/models/supplier.model';
import { normalizeName } from '@/models/product.model';
import type { RequestContext } from '@/lib/context';
import { orgFilter, findOrgDocOrThrow } from '@/lib/scoped';
import { pageOptions, pageMeta, escapeRegex } from '@/lib/pagination';
import { BusinessRuleError } from '@/lib/errors';
import { withTransaction } from '@/db/transaction';
import { audit, diffObjects } from '@/services/audit.service';
import { postLedgerEntry } from '@/services/ledger.service';
import { validateCustomFields } from '@/modules/custom-fields/custom-fields.service';

export function toSupplierDto(s: SupplierDoc): SupplierDto {
  return {
    id: String(s._id),
    name: s.name,
    code: s.code ?? '',
    contactPerson: s.contactPerson ?? '',
    phone: s.phone ?? '',
    altPhone: s.altPhone ?? '',
    email: s.email ?? '',
    address: (s.address ?? {}) as SupplierDto['address'],
    gstin: s.gstin ?? '',
    stateCode: s.stateCode ?? '',
    pan: s.pan ?? '',
    drugLicenseNo: s.drugLicenseNo ?? '',
    paymentTermsDays: s.paymentTermsDays ?? 30,
    openingBalanceMinor: s.openingBalanceMinor ?? 0,
    balanceMinor: s.balanceMinor ?? 0,
    bank: { accountName: s.bank?.accountName ?? '', accountNumber: s.bank?.accountNumber ?? '', ifsc: s.bank?.ifsc ?? '', upiId: s.bank?.upiId ?? '' },
    documents: (s.documents ?? []) as AttachmentRef[],
    notes: s.notes ?? '',
    customFields: (s.customFields as Record<string, unknown>) ?? {},
    status: (s.status ?? 'active') as SupplierDto['status'],
    createdAt: s.createdAt?.toISOString?.() ?? new Date().toISOString(),
  };
}

export async function listSuppliers(ctx: RequestContext, query: PartyListQuery) {
  const filter = orgFilter<SupplierDoc>(ctx, {
    ...(query.status ? { status: query.status } : { status: { $ne: 'archived' } }),
    ...(query.hasBalance ? { balanceMinor: { $ne: 0 } } : {}),
    ...(query.q ? { $or: [{ nameNormalized: { $regex: escapeRegex(normalizeName(query.q)) } }, { phone: { $regex: escapeRegex(query.q) } }, { gstin: query.q.toUpperCase() }] } : {}),
  });
  const { skip, limit, sort } = pageOptions(query, ['name', 'balanceMinor', 'createdAt'], { nameNormalized: 1 });
  const [items, total] = await Promise.all([
    SupplierModel.find(filter).sort(sort).skip(skip).limit(limit).lean<SupplierDoc[]>(),
    SupplierModel.countDocuments(filter),
  ]);
  return { items: items.map(toSupplierDto), meta: pageMeta(query, total) };
}

export async function getSupplier(ctx: RequestContext, id: string) {
  const s = await findOrgDocOrThrow(SupplierModel, ctx, id, 'Supplier');
  return toSupplierDto(s.toObject() as SupplierDoc);
}

export async function createSupplier(ctx: RequestContext, input: CreateSupplierInput) {
  const customFields = await validateCustomFields(ctx, 'supplier', input.customFields);
  const supplier = await withTransaction(async (session) => {
    const [doc] = await SupplierModel.create(
      [{ organizationId: ctx.organizationId, ...input, nameNormalized: normalizeName(input.name), customFields, balanceMinor: 0, createdBy: ctx.userId }],
      { session },
    );
    if (input.openingBalanceMinor) {
      await postLedgerEntry(
        ctx,
        {
          partyType: 'supplier',
          partyId: doc!._id,
          type: 'opening',
          refType: 'Supplier',
          refId: doc!._id,
          debitMinor: input.openingBalanceMinor > 0 ? input.openingBalanceMinor : 0,
          creditMinor: input.openingBalanceMinor < 0 ? -input.openingBalanceMinor : 0,
          note: 'Opening balance',
        },
        session,
      );
    }
    await audit(ctx, { action: 'supplier.created', entityType: 'Supplier', entityId: doc!._id, summary: `Created supplier "${input.name}"`, after: { name: input.name, gstin: input.gstin, openingBalanceMinor: input.openingBalanceMinor } }, session);
    return doc!;
  });
  return getSupplier(ctx, String(supplier._id));
}

export async function updateSupplier(ctx: RequestContext, id: string, input: UpdateSupplierInput) {
  const supplier = await findOrgDocOrThrow(SupplierModel, ctx, id, 'Supplier');
  const before = toSupplierDto(supplier.toObject() as SupplierDoc);
  if (input.openingBalanceMinor !== undefined && input.openingBalanceMinor !== supplier.openingBalanceMinor) {
    throw new BusinessRuleError('Opening balance cannot be edited; post a ledger adjustment instead');
  }
  const { customFields, openingBalanceMinor: _ob, address, bank, ...rest } = input;
  for (const [k, v] of Object.entries(rest)) if (v !== undefined) supplier.set(k, v);
  if (address) supplier.set('address', { ...before.address, ...address });
  if (bank) supplier.set('bank', { ...before.bank, ...bank });
  if (customFields !== undefined) supplier.set('customFields', await validateCustomFields(ctx, 'supplier', customFields, { partial: true }));
  if (input.name) supplier.nameNormalized = normalizeName(input.name);
  supplier.updatedBy = ctx.userId;
  await supplier.save();
  const after = toSupplierDto(supplier.toObject() as SupplierDoc);
  await audit(ctx, { action: 'supplier.updated', entityType: 'Supplier', entityId: supplier._id, summary: `Updated supplier "${supplier.name}"`, ...diffObjects(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>) });
  return after;
}

export async function addSupplierDocument(ctx: RequestContext, id: string, ref: AttachmentRef) {
  const supplier = await findOrgDocOrThrow(SupplierModel, ctx, id, 'Supplier');
  if (supplier.documents.length >= 20) throw new BusinessRuleError('Maximum 20 documents per supplier');
  supplier.documents.push(ref);
  await supplier.save();
  return toSupplierDto(supplier.toObject() as SupplierDoc);
}

export async function removeSupplierDocument(ctx: RequestContext, id: string, publicId: string) {
  const supplier = await findOrgDocOrThrow(SupplierModel, ctx, id, 'Supplier');
  supplier.set('documents', supplier.documents.filter((d) => d.publicId !== publicId));
  await supplier.save();
  return toSupplierDto(supplier.toObject() as SupplierDoc);
}
