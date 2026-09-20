import { Types } from 'mongoose';
import {
  computeDocumentTotals,
  isInterState,
  type CreatePurchaseInput,
  type UpdatePurchaseInput,
  type PurchaseDto,
  type PurchaseListQuery,
  type TaxContext,
  type AttachmentRef,
} from '@pharmaos/shared';
import { PurchaseModel, type PurchaseDoc } from '@/models/purchase.model';
import { SupplierModel, type SupplierDoc } from '@/models/supplier.model';
import { ProductModel, type ProductDoc } from '@/models/product.model';
import { UnitModel, type UnitDoc } from '@/models/unit.model';
import { OrganizationModel, type OrganizationDoc } from '@/models/organization.model';
import { OutletModel, type OutletDoc } from '@/models/outlet.model';
import { PartyPaymentModel } from '@/models/party-payment.model';
import type { RequestContext } from '@/lib/context';
import { hasPermission } from '@/lib/context';
import { orgFilter, outletFilter } from '@/lib/scoped';
import { pageMeta } from '@/lib/pagination';
import { BusinessRuleError, ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { withTransaction } from '@/db/transaction';
import { audit } from '@/services/audit.service';
import { nextDocumentNumber } from '@/services/sequence.service';
import { postLedgerEntry } from '@/services/ledger.service';
import { validateCustomFields } from '@/modules/custom-fields/custom-fields.service';
import { factorFor, requireOutletId, toBaseQty } from '@/modules/inventory/inventory.service';
import { userRefs, iso, isoNow } from '@/modules/common/refs';
import { randomToken } from '@/lib/crypto';
import { receiveAll } from './grn.service';

export async function taxContextForPurchase(ctx: RequestContext, outletId: Types.ObjectId, supplier: Pick<SupplierDoc, 'stateCode'>): Promise<TaxContext> {
  const [org, outlet] = await Promise.all([
    OrganizationModel.findById(ctx.organizationId).select('settings.tax tax').lean<OrganizationDoc>(),
    OutletModel.findById(outletId).select('stateCode').lean<OutletDoc>(),
  ]);
  const placeOfSupply = outlet?.stateCode || org?.tax?.stateCode || '';
  return {
    engine: 'in-gst',
    // Purchase invoices from suppliers quote taxable values + tax separately in India.
    pricesIncludeTax: false,
    supplierStateCode: supplier.stateCode || placeOfSupply,
    placeOfSupplyStateCode: placeOfSupply,
  };
}

export function toPurchaseDto(doc: PurchaseDoc, who: (id: Types.ObjectId | null | undefined) => { id: string; name: string } | null, showCost: boolean): PurchaseDto {
  return {
    id: String(doc._id),
    number: doc.number,
    outletId: String(doc.outletId),
    supplierId: String(doc.supplierId),
    supplierName: doc.supplierSnapshot?.name ?? '',
    supplierGstin: doc.supplierSnapshot?.gstin ?? '',
    supplierInvoiceNumber: doc.supplierInvoiceNumber,
    invoiceDate: isoNow(doc.invoiceDate),
    dueDate: iso(doc.dueDate),
    status: doc.status as PurchaseDto['status'],
    lines: doc.lines.map((l) => ({
      lineId: l.lineId,
      productId: String(l.productId),
      productName: l.productName,
      packLabel: l.packLabel ?? '',
      hsnCode: l.hsnCode ?? '',
      unitId: String(l.unitId),
      unitName: l.unitName ?? '',
      factorToBase: l.factorToBase,
      qty: l.qty,
      freeQty: l.freeQty ?? 0,
      qtyBase: l.qtyBase,
      freeQtyBase: l.freeQtyBase ?? 0,
      receivedBase: l.receivedBase ?? 0,
      damagedBase: l.damagedBase ?? 0,
      batchNumber: l.batchNumber,
      mfgDate: iso(l.mfgDate),
      expiryDate: isoNow(l.expiryDate),
      purchasePriceMinor: showCost ? l.purchasePriceMinor : 0,
      mrpMinor: l.mrpMinor,
      sellingPriceMinor: l.sellingPriceMinor,
      discountBps: l.discountBps ?? 0,
      discountMinor: showCost ? (l.discountMinor ?? 0) : 0,
      schemeNote: l.schemeNote ?? '',
      taxRateBps: l.taxRateBps ?? 0,
      cessBps: l.cessBps ?? 0,
      grossMinor: showCost ? (l.grossMinor ?? 0) : 0,
      taxableMinor: showCost ? (l.taxableMinor ?? 0) : 0,
      cgstMinor: showCost ? (l.cgstMinor ?? 0) : 0,
      sgstMinor: showCost ? (l.sgstMinor ?? 0) : 0,
      igstMinor: showCost ? (l.igstMinor ?? 0) : 0,
      cessMinor: showCost ? (l.cessMinor ?? 0) : 0,
      totalMinor: showCost ? (l.totalMinor ?? 0) : 0,
    })),
    totals: showCost ? (doc.totals as PurchaseDto['totals']) : ({ ...(doc.totals as PurchaseDto['totals']), subtotalMinor: 0, taxableMinor: 0 } as PurchaseDto['totals']),
    otherChargesNote: doc.otherChargesNote ?? '',
    isInterState: doc.isInterState ?? false,
    paidMinor: doc.paidMinor ?? 0,
    balanceMinor: doc.balanceMinor ?? 0,
    paymentStatus: (doc.balanceMinor ?? 0) <= 0 ? 'paid' : (doc.paidMinor ?? 0) > 0 ? 'partial' : 'unpaid',
    payments: doc.payments.map((p) => ({ method: p.method as PurchaseDto['payments'][number]['method'], amountMinor: p.amountMinor, reference: p.reference ?? '', receivedAt: isoNow(p.receivedAt) })),
    grnIds: (doc.grnIds ?? []).map(String),
    attachments: doc.attachments as AttachmentRef[],
    notes: doc.notes ?? '',
    customFields: (doc.customFields as Record<string, unknown>) ?? {},
    createdBy: who(doc.createdBy),
    cancelledBy: who(doc.cancelledBy),
    cancelReason: doc.cancelReason ?? '',
    createdAt: isoNow(doc.createdAt),
  };
}

async function dto(ctx: RequestContext, doc: PurchaseDoc) {
  const who = await userRefs([doc.createdBy, doc.cancelledBy]);
  return toPurchaseDto(doc, who, hasPermission(ctx, 'products.viewCost'));
}

/** Builds priced purchase lines + totals from input; shared by create and update. */
export async function buildPurchaseLines(ctx: RequestContext, outletId: Types.ObjectId, supplier: SupplierDoc, input: Pick<CreatePurchaseInput, 'lines' | 'billDiscountBps' | 'billDiscountMinor' | 'otherChargesMinor' | 'roundOff'>) {
  const productIds = [...new Set(input.lines.map((l) => l.productId))];
  const [products, units] = await Promise.all([
    ProductModel.find(orgFilter<ProductDoc>(ctx, { _id: { $in: productIds }, status: { $ne: 'archived' } })).lean<ProductDoc[]>(),
    UnitModel.find(orgFilter<UnitDoc>(ctx, {})).lean<UnitDoc[]>(),
  ]);
  if (products.length !== productIds.length) throw new NotFoundError('Product');
  const pMap = new Map(products.map((p) => [String(p._id), p]));
  const uMap = new Map(units.map((u) => [String(u._id), u]));
  const taxCtx = await taxContextForPurchase(ctx, outletId, supplier);

  const prepared = input.lines.map((l) => {
    const product = pMap.get(l.productId)!;
    const factor = factorFor(product, l.unitId);
    const pricingFactor = factorFor(product, String(product.pricingUnitId));
    const unit = uMap.get(l.unitId);
    const qtyBase = toBaseQty(l.qty, factor, unit?.allowsDecimal ?? false);
    const freeQtyBase = toBaseQty(l.freeQty ?? 0, factor, unit?.allowsDecimal ?? false);
    if (qtyBase <= 0) throw new ValidationError('Quantity must be positive');
    if (l.expiryDate.getTime() < Date.now()) throw new ValidationError(`Batch ${l.batchNumber} of ${product.name} is already expired`, [{ path: 'body.lines', message: 'Expired batch' }]);
    // Gross = paid quantity (in pricing units) × purchase price; free quantity carries no cost.
    const grossMinor = Math.round((qtyBase * l.purchasePriceMinor) / pricingFactor);
    return {
      product,
      factor,
      pricingFactor,
      qtyBase,
      freeQtyBase,
      unitName: unit?.abbreviation ?? '',
      taxInput: { grossMinor, discountBps: l.discountBps, discountMinor: l.discountMinor, taxRateBps: l.taxRateBps ?? product.tax?.rateBps ?? 0, cessBps: l.cessBps ?? product.tax?.cessBps ?? 0 },
      input: l,
    };
  });

  const { lines: taxed, totals } = computeDocumentTotals(
    prepared.map((p) => p.taxInput),
    taxCtx,
    { billDiscountBps: input.billDiscountBps, billDiscountMinor: input.billDiscountMinor, otherChargesMinor: input.otherChargesMinor, roundOff: input.roundOff ? 'nearest' : 'none' },
  );

  // Optional pack labels typed on the form, keyed by the lineId generated just below.
  const barcodesByLine: Record<string, string[]> = {};
  const lines = prepared.map((p, i) => {
    const t = taxed[i]!;
    const lineId = randomToken(6);
    const codes = [...new Set((p.input.barcodes ?? []).map((c) => c.trim()).filter(Boolean))];
    if (codes.length) barcodesByLine[lineId] = codes;
    return {
      lineId,
      productId: p.product._id,
      productName: p.product.name,
      packLabel: p.product.packLabel ?? '',
      hsnCode: p.product.hsnCode ?? '',
      unitId: new Types.ObjectId(p.input.unitId),
      unitName: p.unitName,
      factorToBase: p.factor,
      qty: p.input.qty,
      freeQty: p.input.freeQty ?? 0,
      qtyBase: p.qtyBase,
      freeQtyBase: p.freeQtyBase,
      receivedBase: 0,
      damagedBase: 0,
      batchNumber: p.input.batchNumber,
      mfgDate: p.input.mfgDate ?? null,
      expiryDate: p.input.expiryDate,
      pricingUnitId: p.product.pricingUnitId,
      pricingUnitFactor: p.pricingFactor,
      purchasePriceMinor: p.input.purchasePriceMinor,
      mrpMinor: p.input.mrpMinor,
      sellingPriceMinor: p.input.sellingPriceMinor ?? p.input.mrpMinor,
      discountBps: p.input.discountBps,
      discountMinor: t.discountMinor,
      schemeNote: p.input.schemeNote ?? '',
      taxRateBps: p.taxInput.taxRateBps,
      cessBps: p.taxInput.cessBps,
      grossMinor: t.grossMinor,
      taxableMinor: t.taxableMinor,
      cgstMinor: t.cgstMinor,
      sgstMinor: t.sgstMinor,
      igstMinor: t.igstMinor,
      cessMinor: t.cessMinor,
      totalMinor: t.totalMinor,
    };
  });
  return { lines, totals, isInterState: isInterState(taxCtx), barcodesByLine };
}

export async function createPurchase(ctx: RequestContext, input: CreatePurchaseInput, idempotencyKey?: string) {
  const outletId = requireOutletId(ctx);
  const supplier = await SupplierModel.findOne(orgFilter<SupplierDoc>(ctx, { _id: input.supplierId, status: { $ne: 'archived' } })).lean<SupplierDoc>();
  if (!supplier) throw new NotFoundError('Supplier');
  const dup = await PurchaseModel.exists(orgFilter(ctx, { supplierId: supplier._id, supplierInvoiceNumber: input.supplierInvoiceNumber, status: { $ne: 'cancelled' } }));
  if (dup) throw new ConflictError(`Supplier invoice ${input.supplierInvoiceNumber} was already recorded for ${supplier.name}`, [{ path: 'supplierInvoiceNumber', message: 'Already recorded' }]);
  if (input.receiveNow && !hasPermission(ctx, 'purchases.approveGrn')) throw new BusinessRuleError('You cannot receive stock; save the purchase and let an authorised user confirm the GRN');

  const customFields = await validateCustomFields(ctx, 'purchase', input.customFields);
  const { lines, totals, isInterState: inter, barcodesByLine } = await buildPurchaseLines(ctx, outletId, supplier, input);
  if (input.expectedGrandTotalMinor !== undefined && input.expectedGrandTotalMinor !== totals.grandTotalMinor) {
    throw new BusinessRuleError(`Totals changed: server computed ${totals.grandTotalMinor / 100}, you sent ${input.expectedGrandTotalMinor / 100}. Review and submit again.`);
  }
  const paid = input.payments.reduce((s, p) => s + p.amountMinor, 0);
  if (paid > totals.grandTotalMinor) throw new ValidationError('Payments exceed the invoice total', [{ path: 'body.payments', message: 'Too much' }]);
  if (input.payments.some((p) => p.method === 'credit')) throw new ValidationError('Use the balance for credit; do not add a credit payment line');

  const dueDate = input.dueDate ?? new Date(input.invoiceDate.getTime() + (supplier.paymentTermsDays ?? 30) * 86_400_000);

  const doc = await withTransaction(async (session) => {
    const { number } = await nextDocumentNumber(ctx.organizationId, outletId, 'purchase', session);
    const [created] = await PurchaseModel.create(
      [
        {
          organizationId: ctx.organizationId,
          outletId,
          number,
          supplierId: supplier._id,
          supplierSnapshot: { name: supplier.name, gstin: supplier.gstin ?? '', stateCode: supplier.stateCode ?? '' },
          supplierInvoiceNumber: input.supplierInvoiceNumber,
          invoiceDate: input.invoiceDate,
          dueDate,
          status: 'confirmed',
          lines,
          totals,
          otherChargesNote: input.otherChargesNote,
          isInterState: inter,
          payments: [],
          paidMinor: 0,
          balanceMinor: totals.grandTotalMinor,
          attachments: input.attachments,
          notes: input.notes,
          customFields,
          createdBy: ctx.userId,
        },
      ],
      { session },
    );
    const purchase = created!;

    // Payable: supplier balance goes up by the invoice total.
    await postLedgerEntry(ctx, { partyType: 'supplier', partyId: supplier._id, type: 'purchase', refType: 'Purchase', refId: purchase._id, refNumber: number, debitMinor: totals.grandTotalMinor, date: input.invoiceDate, note: `Invoice ${input.supplierInvoiceNumber}` }, session);

    // Inline payments become supplier payment documents allocated to this invoice.
    for (const p of input.payments) {
      const { number: payNo } = await nextDocumentNumber(ctx.organizationId, outletId, 'supplierPayment', session);
      const [pay] = await PartyPaymentModel.create(
        [{ organizationId: ctx.organizationId, outletId, number: payNo, partyType: 'supplier', partyId: supplier._id, date: new Date(), method: p.method, amountMinor: p.amountMinor, reference: p.reference, allocations: [{ documentId: purchase._id, documentNumber: number, amountMinor: p.amountMinor }], unallocatedMinor: 0, createdBy: ctx.userId }],
        { session },
      );
      purchase.payments.push({ method: p.method, amountMinor: p.amountMinor, reference: p.reference, receivedAt: new Date(), paymentId: pay!._id });
      await postLedgerEntry(ctx, { partyType: 'supplier', partyId: supplier._id, type: 'payment', refType: 'PartyPayment', refId: pay!._id, refNumber: payNo, creditMinor: p.amountMinor, note: `Paid against ${number}` }, session);
    }
    purchase.paidMinor = paid;
    purchase.balanceMinor = totals.grandTotalMinor - paid;
    await purchase.save({ session });

    await audit(ctx, { action: 'purchase.created', entityType: 'Purchase', entityId: purchase._id, summary: `Recorded purchase ${number} from ${supplier.name} (${totals.grandTotalMinor / 100})`, after: { number, supplierInvoiceNumber: input.supplierInvoiceNumber, grandTotalMinor: totals.grandTotalMinor, paidMinor: paid }, metadata: idempotencyKey ? { idempotencyKey } : undefined }, session);

    if (input.receiveNow) await receiveAll(ctx, purchase, session, barcodesByLine);
    return purchase;
  });
  return dto(ctx, doc.toObject() as PurchaseDoc);
}

export async function updatePurchase(ctx: RequestContext, id: string, input: UpdatePurchaseInput) {
  const doc = await PurchaseModel.findOne(orgFilter<PurchaseDoc>(ctx, { _id: id }));
  if (!doc) throw new NotFoundError('Purchase');
  if (doc.status !== 'confirmed' || (doc.grnIds ?? []).length > 0 || (doc.paidMinor ?? 0) > 0) {
    throw new BusinessRuleError('Only unreceived, unpaid purchases can be edited; cancel and re-enter otherwise');
  }
  const supplier = await SupplierModel.findById(doc.supplierId).lean<SupplierDoc>();
  if (!supplier) throw new NotFoundError('Supplier');
  const before = doc.totals.grandTotalMinor;
  if (input.lines || input.billDiscountBps !== undefined || input.billDiscountMinor !== undefined || input.otherChargesMinor !== undefined || input.roundOff !== undefined) {
    const built = await buildPurchaseLines(ctx, doc.outletId, supplier, {
      lines: input.lines ?? (doc.lines as unknown as CreatePurchaseInput['lines']).map((l) => ({ ...l, productId: String(l.productId), unitId: String(l.unitId) })),
      billDiscountBps: input.billDiscountBps ?? 0,
      billDiscountMinor: input.billDiscountMinor ?? doc.totals.billDiscountMinor,
      otherChargesMinor: input.otherChargesMinor ?? doc.totals.otherChargesMinor,
      roundOff: input.roundOff ?? doc.totals.roundOffMinor !== 0,
    });
    doc.set('lines', built.lines);
    doc.set('totals', built.totals);
    doc.isInterState = built.isInterState;
  }
  for (const k of ['supplierInvoiceNumber', 'invoiceDate', 'dueDate', 'otherChargesNote', 'notes', 'attachments'] as const) {
    if (input[k] !== undefined) doc.set(k, input[k]);
  }
  if (input.customFields !== undefined) doc.set('customFields', await validateCustomFields(ctx, 'purchase', input.customFields, { partial: true }));
  const delta = doc.totals.grandTotalMinor - before;
  doc.balanceMinor = doc.totals.grandTotalMinor - (doc.paidMinor ?? 0);
  doc.updatedBy = ctx.userId;
  await withTransaction(async (session) => {
    await doc.save({ session });
    if (delta !== 0) {
      await postLedgerEntry(ctx, { partyType: 'supplier', partyId: doc.supplierId, type: 'adjustment', refType: 'Purchase', refId: doc._id, refNumber: doc.number, debitMinor: delta > 0 ? delta : 0, creditMinor: delta < 0 ? -delta : 0, note: 'Purchase edited' }, session);
    }
    await audit(ctx, { action: 'purchase.updated', entityType: 'Purchase', entityId: doc._id, summary: `Edited purchase ${doc.number}`, before: { grandTotalMinor: before }, after: { grandTotalMinor: doc.totals.grandTotalMinor } }, session);
  });
  return dto(ctx, doc.toObject() as PurchaseDoc);
}

export async function cancelPurchase(ctx: RequestContext, id: string, reason: string) {
  const doc = await PurchaseModel.findOne(orgFilter<PurchaseDoc>(ctx, { _id: id }));
  if (!doc) throw new NotFoundError('Purchase');
  if (doc.status === 'cancelled') throw new BusinessRuleError('Purchase is already cancelled');
  if ((doc.grnIds ?? []).length > 0) throw new BusinessRuleError('Stock has been received against this purchase; create a purchase return instead');
  if ((doc.paidMinor ?? 0) > 0) throw new BusinessRuleError('Payments exist against this purchase; cancel the payments first');
  await withTransaction(async (session) => {
    doc.status = 'cancelled';
    doc.cancelledBy = ctx.userId;
    doc.cancelledAt = new Date();
    doc.cancelReason = reason;
    doc.balanceMinor = 0;
    await doc.save({ session });
    await postLedgerEntry(ctx, { partyType: 'supplier', partyId: doc.supplierId, type: 'cancellation', refType: 'Purchase', refId: doc._id, refNumber: doc.number, creditMinor: doc.totals.grandTotalMinor, note: `Cancelled: ${reason}` }, session);
    await audit(ctx, { action: 'purchase.cancelled', entityType: 'Purchase', entityId: doc._id, summary: `Cancelled purchase ${doc.number}: ${reason}` }, session);
  });
  return dto(ctx, doc.toObject() as PurchaseDoc);
}

export async function listPurchases(ctx: RequestContext, query: PurchaseListQuery) {
  const filter = outletFilter<PurchaseDoc>(ctx, {
    ...(query.supplierId ? { supplierId: query.supplierId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.paymentStatus === 'unpaid' ? { paidMinor: 0, balanceMinor: { $gt: 0 } } : {}),
    ...(query.paymentStatus === 'partial' ? { paidMinor: { $gt: 0 }, balanceMinor: { $gt: 0 } } : {}),
    ...(query.paymentStatus === 'paid' ? { balanceMinor: { $lte: 0 }, status: { $ne: 'cancelled' } } : {}),
    ...(query.from || query.to ? { invoiceDate: { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) } } : {}),
    ...(query.q ? { $or: [{ number: { $regex: query.q, $options: 'i' } }, { supplierInvoiceNumber: { $regex: query.q, $options: 'i' } }, { 'supplierSnapshot.name': { $regex: query.q, $options: 'i' } }] } : {}),
  });
  const skip = (query.page - 1) * query.pageSize;
  const [docs, total] = await Promise.all([
    PurchaseModel.find(filter).sort({ invoiceDate: -1, createdAt: -1 }).skip(skip).limit(query.pageSize).lean<PurchaseDoc[]>(),
    PurchaseModel.countDocuments(filter),
  ]);
  const who = await userRefs(docs.map((d) => d.createdBy));
  const showCost = hasPermission(ctx, 'products.viewCost');
  return { items: docs.map((d) => toPurchaseDto(d, who, showCost)), meta: pageMeta(query, total) };
}

export async function getPurchase(ctx: RequestContext, id: string) {
  const doc = await PurchaseModel.findOne(orgFilter<PurchaseDoc>(ctx, { _id: id })).lean<PurchaseDoc>();
  if (!doc) throw new NotFoundError('Purchase');
  return dto(ctx, doc);
}
