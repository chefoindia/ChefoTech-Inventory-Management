import { Types } from 'mongoose';
import { computeDocumentTotals, isInterState, priceForBaseQty, type CreatePurchaseReturnInput, type PurchaseReturnDto, type PaginationQuery, type AttachmentRef } from '@pharmaos/shared';
import { PurchaseReturnModel, type PurchaseReturnDoc } from '@/models/purchase-return.model';
import { PurchaseModel, type PurchaseDoc } from '@/models/purchase.model';
import { SupplierModel, type SupplierDoc } from '@/models/supplier.model';
import { ProductModel, type ProductDoc } from '@/models/product.model';
import { ProductBatchModel, type ProductBatchDoc } from '@/models/product-batch.model';
import { UnitModel, type UnitDoc } from '@/models/unit.model';
import { PartyPaymentModel } from '@/models/party-payment.model';
import type { RequestContext } from '@/lib/context';
import { hasPermission } from '@/lib/context';
import { orgFilter, outletFilter } from '@/lib/scoped';
import { pageMeta } from '@/lib/pagination';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { withTransaction } from '@/db/transaction';
import { audit } from '@/services/audit.service';
import { nextDocumentNumber } from '@/services/sequence.service';
import { postLedgerEntry } from '@/services/ledger.service';
import { applyStockChange } from '@/modules/inventory/stock.service';
import { factorFor, requireOutletId, toBaseQty } from '@/modules/inventory/inventory.service';
import { taxContextForPurchase } from './purchases.service';
import { userRefs, isoNow } from '@/modules/common/refs';

function toDto(doc: PurchaseReturnDoc, who: (id: Types.ObjectId | null | undefined) => { id: string; name: string } | null, showCost: boolean): PurchaseReturnDto {
  const hide = (n: number) => (showCost ? n : 0);
  return {
    id: String(doc._id),
    number: doc.number,
    outletId: String(doc.outletId),
    supplierId: String(doc.supplierId),
    supplierName: doc.supplierName ?? '',
    purchaseId: doc.purchaseId ? String(doc.purchaseId) : null,
    purchaseNumber: doc.purchaseNumber ?? '',
    status: doc.status as PurchaseReturnDto['status'],
    lines: doc.lines.map((l) => ({
      productId: String(l.productId),
      productName: l.productName,
      batchId: String(l.batchId),
      batchNumber: l.batchNumber,
      unitName: l.unitName ?? '',
      qty: l.qty,
      qtyBase: l.qtyBase,
      unitPriceMinor: hide(l.unitPriceMinor),
      taxRateBps: l.taxRateBps ?? 0,
      taxableMinor: hide(l.taxableMinor ?? 0),
      taxMinor: hide(l.taxMinor ?? 0),
      totalMinor: hide(l.totalMinor ?? 0),
      reason: l.reason ?? 'other',
      note: l.note ?? '',
    })),
    totals: doc.totals as PurchaseReturnDto['totals'],
    settlement: doc.settlement as PurchaseReturnDto['settlement'],
    refund: doc.refund ? { method: doc.refund.method as PurchaseReturnDto['refund'] extends null ? never : NonNullable<PurchaseReturnDto['refund']>['method'], amountMinor: doc.refund.amountMinor, reference: doc.refund.reference ?? '', receivedAt: isoNow(doc.refund.receivedAt) } : null,
    notes: doc.notes ?? '',
    attachments: doc.attachments as AttachmentRef[],
    createdBy: who(doc.createdBy),
    createdAt: isoNow(doc.createdAt),
  };
}

export async function createPurchaseReturn(ctx: RequestContext, input: CreatePurchaseReturnInput) {
  const outletId = requireOutletId(ctx);
  const supplier = await SupplierModel.findOne(orgFilter<SupplierDoc>(ctx, { _id: input.supplierId })).lean<SupplierDoc>();
  if (!supplier) throw new NotFoundError('Supplier');
  const purchase = input.purchaseId ? await PurchaseModel.findOne(orgFilter<PurchaseDoc>(ctx, { _id: input.purchaseId, supplierId: supplier._id })).lean<PurchaseDoc>() : null;
  if (input.purchaseId && !purchase) throw new NotFoundError('Purchase');
  if (input.settlement === 'refund' && !input.refund) throw new ValidationError('Refund details are required for a refund settlement', [{ path: 'body.refund', message: 'Required' }]);

  const productIds = [...new Set(input.lines.map((l) => l.productId))];
  const batchIds = [...new Set(input.lines.map((l) => l.batchId))];
  const [products, batches, units] = await Promise.all([
    ProductModel.find(orgFilter<ProductDoc>(ctx, { _id: { $in: productIds } })).lean<ProductDoc[]>(),
    ProductBatchModel.find(orgFilter<ProductBatchDoc>(ctx, { _id: { $in: batchIds } })).lean<ProductBatchDoc[]>(),
    UnitModel.find(orgFilter<UnitDoc>(ctx, {})).lean<UnitDoc[]>(),
  ]);
  if (products.length !== productIds.length) throw new NotFoundError('Product');
  if (batches.length !== batchIds.length) throw new NotFoundError('Batch');
  const pMap = new Map(products.map((p) => [String(p._id), p]));
  const bMap = new Map(batches.map((b) => [String(b._id), b]));
  const uMap = new Map(units.map((u) => [String(u._id), u]));
  const taxCtx = await taxContextForPurchase(ctx, outletId, supplier);

  const prepared = input.lines.map((l) => {
    const product = pMap.get(l.productId)!;
    const batch = bMap.get(l.batchId)!;
    if (String(batch.productId) !== l.productId) throw new ValidationError('Batch does not belong to product');
    const factor = factorFor(product, l.unitId);
    const qtyBase = toBaseQty(l.qty, factor, uMap.get(l.unitId)?.allowsDecimal ?? false);
    const grossMinor = priceForBaseQty(batch.purchasePriceMinor, batch.pricingUnitFactor, qtyBase);
    return { product, batch, factor, qtyBase, unitName: uMap.get(l.unitId)?.abbreviation ?? '', input: l, taxInput: { grossMinor, taxRateBps: product.tax?.rateBps ?? 0, cessBps: product.tax?.cessBps ?? 0 } };
  });
  const { lines: taxed, totals } = computeDocumentTotals(prepared.map((p) => p.taxInput), taxCtx, { roundOff: 'nearest' });

  const doc = await withTransaction(async (session) => {
    const { number } = await nextDocumentNumber(ctx.organizationId, outletId, 'purchaseReturn', session);
    const refId = new Types.ObjectId();
    for (const p of prepared) {
      await applyStockChange(ctx, { outletId, productId: p.product._id, batchId: p.batch._id, qtyBaseDelta: -p.qtyBase, reason: 'purchase_return', refType: 'PurchaseReturn', refId, refNumber: number, unitCostMinor: p.batch.purchasePriceMinor, pricingUnitFactor: p.batch.pricingUnitFactor, note: p.input.reason, allowNonSellable: true }, session);
    }
    const [created] = await PurchaseReturnModel.create(
      [
        {
          _id: refId,
          organizationId: ctx.organizationId,
          outletId,
          number,
          supplierId: supplier._id,
          supplierName: supplier.name,
          purchaseId: purchase?._id ?? null,
          purchaseNumber: purchase?.number ?? '',
          lines: prepared.map((p, i) => ({
            productId: p.product._id,
            productName: p.product.name,
            hsnCode: p.product.hsnCode ?? '',
            batchId: p.batch._id,
            batchNumber: p.batch.batchNumber,
            unitId: new Types.ObjectId(p.input.unitId),
            unitName: p.unitName,
            factorToBase: p.factor,
            qty: p.input.qty,
            qtyBase: p.qtyBase,
            pricingUnitFactor: p.batch.pricingUnitFactor,
            unitPriceMinor: p.batch.purchasePriceMinor,
            taxRateBps: p.taxInput.taxRateBps,
            cessBps: p.taxInput.cessBps,
            grossMinor: taxed[i]!.grossMinor,
            taxableMinor: taxed[i]!.taxableMinor,
            cgstMinor: taxed[i]!.cgstMinor,
            sgstMinor: taxed[i]!.sgstMinor,
            igstMinor: taxed[i]!.igstMinor,
            cessMinor: taxed[i]!.cessMinor,
            taxMinor: taxed[i]!.taxMinor,
            totalMinor: taxed[i]!.totalMinor,
            reason: p.input.reason,
            note: p.input.note ?? '',
          })),
          totals,
          isInterState: isInterState(taxCtx),
          settlement: input.settlement,
          refund: input.settlement === 'refund' && input.refund ? { method: input.refund.method, amountMinor: totals.grandTotalMinor, reference: input.refund.reference, receivedAt: new Date() } : null,
          notes: input.notes,
          attachments: input.attachments,
          createdBy: ctx.userId,
        },
      ],
      { session },
    );
    // Supplier owes us for the returned goods: reduce payable (credit note) …
    await postLedgerEntry(ctx, { partyType: 'supplier', partyId: supplier._id, type: 'purchase_return', refType: 'PurchaseReturn', refId, refNumber: number, creditMinor: totals.grandTotalMinor, note: `Return ${number}` }, session);
    // … and if they refunded in cash, the payable goes back up by the refund received (net zero) recorded as a negative payment.
    if (input.settlement === 'refund' && input.refund) {
      const { number: payNo } = await nextDocumentNumber(ctx.organizationId, outletId, 'supplierPayment', session);
      await PartyPaymentModel.create([{ organizationId: ctx.organizationId, outletId, number: payNo, partyType: 'supplier', partyId: supplier._id, date: new Date(), method: input.refund.method, amountMinor: -totals.grandTotalMinor, reference: input.refund.reference, notes: `Refund for return ${number}`, allocations: [], unallocatedMinor: 0, createdBy: ctx.userId }], { session });
      await postLedgerEntry(ctx, { partyType: 'supplier', partyId: supplier._id, type: 'payment', refType: 'PurchaseReturn', refId, refNumber: payNo, debitMinor: totals.grandTotalMinor, note: `Refund received for ${number}` }, session);
    }
    await audit(ctx, { action: 'purchaseReturn.created', entityType: 'PurchaseReturn', entityId: refId, summary: `Returned goods to ${supplier.name} (${number}, ${totals.grandTotalMinor / 100})` }, session);
    return created!;
  });
  const who = await userRefs([doc.createdBy]);
  return toDto(doc.toObject() as PurchaseReturnDoc, who, hasPermission(ctx, 'products.viewCost'));
}

export async function listPurchaseReturns(ctx: RequestContext, query: PaginationQuery & { supplierId?: string }) {
  const filter = outletFilter<PurchaseReturnDoc>(ctx, { ...(query.supplierId ? { supplierId: query.supplierId } : {}) });
  const skip = (query.page - 1) * query.pageSize;
  const [docs, total] = await Promise.all([PurchaseReturnModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.pageSize).lean<PurchaseReturnDoc[]>(), PurchaseReturnModel.countDocuments(filter)]);
  const who = await userRefs(docs.map((d) => d.createdBy));
  const showCost = hasPermission(ctx, 'products.viewCost');
  return { items: docs.map((d) => toDto(d, who, showCost)), meta: pageMeta(query, total) };
}

export async function getPurchaseReturn(ctx: RequestContext, id: string) {
  const doc = await PurchaseReturnModel.findOne(orgFilter<PurchaseReturnDoc>(ctx, { _id: id })).lean<PurchaseReturnDoc>();
  if (!doc) throw new NotFoundError('Purchase return');
  const who = await userRefs([doc.createdBy]);
  return toDto(doc, who, hasPermission(ctx, 'products.viewCost'));
}
