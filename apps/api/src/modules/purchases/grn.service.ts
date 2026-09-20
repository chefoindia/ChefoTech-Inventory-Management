import { Types, type ClientSession } from 'mongoose';
import type { CreateGrnInput, GrnDto, PaginationQuery, AttachmentRef } from '@pharmaos/shared';
import { GrnModel, type GrnDoc } from '@/models/grn.model';
import { PurchaseModel } from '@/models/purchase.model';

type PurchaseEntity = InstanceType<typeof PurchaseModel>;
import { ProductModel } from '@/models/product.model';
import { ProductBatchModel } from '@/models/product-batch.model';
import type { RequestContext } from '@/lib/context';
import { hasPermission } from '@/lib/context';
import { orgFilter, outletFilter } from '@/lib/scoped';
import { pageMeta } from '@/lib/pagination';
import { BusinessRuleError, ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { withTransaction } from '@/db/transaction';
import { audit } from '@/services/audit.service';
import { nextDocumentNumber } from '@/services/sequence.service';
import { applyStockChange, ensureBatch } from '@/modules/inventory/stock.service';
import { userRefs, iso, isoNow } from '@/modules/common/refs';
import { OrganizationModel } from '@/models/organization.model';

function toGrnDto(doc: GrnDoc, who: (id: Types.ObjectId | null | undefined) => { id: string; name: string } | null, showCost: boolean): GrnDto {
  return {
    id: String(doc._id),
    number: doc.number,
    outletId: String(doc.outletId),
    purchaseId: String(doc.purchaseId),
    purchaseNumber: doc.purchaseNumber ?? '',
    supplierId: String(doc.supplierId),
    supplierName: doc.supplierName ?? '',
    receivedDate: isoNow(doc.receivedDate),
    status: doc.status as GrnDto['status'],
    lines: doc.lines.map((l) => ({
      purchaseLineId: l.purchaseLineId,
      productId: String(l.productId),
      productName: l.productName,
      unitName: l.unitName ?? '',
      factorToBase: l.factorToBase,
      orderedQty: l.orderedQty,
      receivedQty: l.receivedQty,
      freeQty: l.freeQty ?? 0,
      damagedQty: l.damagedQty ?? 0,
      shortQty: l.shortQty ?? 0,
      receivedBase: l.receivedBase,
      batchId: l.batchId ? String(l.batchId) : null,
      batchNumber: l.batchNumber,
      expiryDate: isoNow(l.expiryDate),
      mrpMinor: l.mrpMinor,
      purchasePriceMinor: showCost ? l.purchasePriceMinor : 0,
      barcodes: l.barcodes ?? [],
      note: l.note ?? '',
    })),
    attachments: doc.attachments as AttachmentRef[],
    notes: doc.notes ?? '',
    receivedBy: who(doc.receivedBy),
    confirmedBy: who(doc.confirmedBy),
    confirmedAt: iso(doc.confirmedAt),
    createdAt: isoNow(doc.createdAt),
  };
}

async function dto(ctx: RequestContext, doc: GrnDoc) {
  const who = await userRefs([doc.receivedBy, doc.confirmedBy]);
  return toGrnDto(doc, who, hasPermission(ctx, 'products.viewCost'));
}

/**
 * Sticks the barcode LABEL ids captured at receipt onto the batch, so scanning a pack later
 * resolves straight to its real purchase price, selling price, MRP and expiry.
 *
 * Labels are unique per organization (a label identifies one physical pack of one batch), so a
 * code already used by another batch is rejected with a message naming the clash rather than a
 * raw duplicate-key error. Re-receiving the same label on the same batch is a no-op, which keeps
 * a retried transaction safe.
 */
async function attachBatchBarcodes(
  ctx: RequestContext,
  batchId: Types.ObjectId,
  codes: string[],
  productName: string,
  session: ClientSession,
) {
  const unique = [...new Set(codes.map((c) => c.trim()).filter(Boolean))];
  if (unique.length === 0) return;
  const clash = await ProductBatchModel.findOne(
    orgFilter(ctx, { barcodes: { $in: unique }, _id: { $ne: batchId } }),
  )
    .select('batchNumber barcodes')
    .session(session)
    .lean<{ batchNumber: string; barcodes: string[] }>();
  if (clash) {
    const taken = unique.filter((c) => clash.barcodes.includes(c));
    throw new BusinessRuleError(`${productName}: barcode ${taken.join(', ')} is already on batch ${clash.batchNumber}. Each label belongs to one pack.`);
  }
  await ProductBatchModel.updateOne({ _id: batchId }, { $addToSet: { barcodes: { $each: unique } } }, { session });
}

/**
 * Applies a confirmed GRN: creates/updates batches, adds received + free quantities to stock,
 * records damaged quantities as a write-off movement (they were paid for, so they enter and
 * leave stock traceably), and updates the purchase's received status.
 */
async function applyGrn(ctx: RequestContext, grn: GrnDoc, purchaseRef: PurchaseEntity, session: ClientSession) {
  // Re-read inside the transaction so a retried transaction never double-counts received quantities.
  const purchase = (await PurchaseModel.findById(purchaseRef._id).session(session)) ?? purchaseRef;
  const org = await OrganizationModel.findById(ctx.organizationId).select('settings.purchases').lean();
  const autoUpdatePrice = org?.settings?.purchases?.autoUpdateSellingPriceFromPurchase ?? false;
  for (const line of grn.lines) {
    const pl = purchase.lines.find((l) => l.lineId === line.purchaseLineId);
    if (!pl) throw new ValidationError('GRN line does not match the purchase');
    const totalIn = line.receivedBase + (line.freeBase ?? 0);
    if (totalIn <= 0 && (line.damagedBase ?? 0) <= 0) continue;
    const batch = await ensureBatch(
      ctx,
      {
        productId: line.productId,
        batchNumber: line.batchNumber,
        mfgDate: line.mfgDate ?? null,
        expiryDate: line.expiryDate,
        pricingUnitId: line.pricingUnitId,
        pricingUnitFactor: line.pricingUnitFactor,
        mrpMinor: line.mrpMinor,
        sellingPriceMinor: line.sellingPriceMinor,
        purchasePriceMinor: line.purchasePriceMinor,
        supplierId: purchase.supplierId,
        sourceType: 'grn',
        sourceId: grn._id,
      },
      session,
    );
    line.batchId = batch._id;
    await attachBatchBarcodes(ctx, batch._id, line.barcodes ?? [], line.productName, session);
    if (totalIn > 0) {
      await applyStockChange(ctx, { outletId: grn.outletId, productId: line.productId, batchId: batch._id, qtyBaseDelta: totalIn, reason: 'grn', refType: 'Grn', refId: grn._id, refNumber: grn.number, unitCostMinor: line.purchasePriceMinor, pricingUnitFactor: line.pricingUnitFactor, note: line.freeBase ? `incl. ${line.freeBase} free` : '' }, session);
    }
    if ((line.damagedBase ?? 0) > 0) {
      await applyStockChange(ctx, { outletId: grn.outletId, productId: line.productId, batchId: batch._id, qtyBaseDelta: line.damagedBase!, reason: 'grn', refType: 'Grn', refId: grn._id, refNumber: grn.number, note: 'Damaged on receipt (in)' }, session);
      await applyStockChange(ctx, { outletId: grn.outletId, productId: line.productId, batchId: batch._id, qtyBaseDelta: -line.damagedBase!, reason: 'damage', refType: 'Grn', refId: grn._id, refNumber: grn.number, note: 'Damaged on receipt', allowNonSellable: true }, session);
    }
    pl.receivedBase = (pl.receivedBase ?? 0) + line.receivedBase;
    pl.damagedBase = (pl.damagedBase ?? 0) + (line.damagedBase ?? 0);
    // Product defaults follow the latest receipt for MRP; selling price only if configured.
    await ProductModel.updateOne(
      { _id: line.productId, organizationId: ctx.organizationId },
      { $set: { 'pricing.mrpMinor': line.mrpMinor, 'pricing.purchasePriceMinor': line.purchasePriceMinor, ...(autoUpdatePrice ? { 'pricing.sellingPriceMinor': line.sellingPriceMinor } : {}) } },
      { session },
    );
  }
  const fullyReceived = purchase.lines.every((l) => (l.receivedBase ?? 0) + (l.damagedBase ?? 0) >= l.qtyBase);
  purchase.status = fullyReceived ? 'received' : 'partially_received';
  if (!purchase.grnIds.some((g) => String(g) === String(grn._id))) purchase.grnIds.push(grn._id);
  await purchase.save({ session });
  if (purchase !== purchaseRef) {
    purchaseRef.set('lines', purchase.lines);
    purchaseRef.set('grnIds', purchase.grnIds);
    purchaseRef.status = purchase.status;
  }
}

/** Receive every line of a purchase in full (used by receiveNow). */
export async function receiveAll(ctx: RequestContext, purchase: PurchaseEntity, session: ClientSession) {
  const { number } = await nextDocumentNumber(ctx.organizationId, purchase.outletId, 'grn', session);
  const [grn] = await GrnModel.create(
    [
      {
        organizationId: ctx.organizationId,
        outletId: purchase.outletId,
        number,
        purchaseId: purchase._id,
        purchaseNumber: purchase.number,
        supplierId: purchase.supplierId,
        supplierName: purchase.supplierSnapshot?.name ?? '',
        receivedDate: new Date(),
        status: 'confirmed',
        lines: purchase.lines.map((l) => ({
          purchaseLineId: l.lineId,
          productId: l.productId,
          productName: l.productName,
          unitId: l.unitId,
          unitName: l.unitName,
          factorToBase: l.factorToBase,
          orderedQty: l.qty,
          receivedQty: l.qty,
          freeQty: l.freeQty ?? 0,
          damagedQty: 0,
          shortQty: 0,
          receivedBase: l.qtyBase,
          freeBase: l.freeQtyBase ?? 0,
          damagedBase: 0,
          batchNumber: l.batchNumber,
          mfgDate: l.mfgDate ?? null,
          expiryDate: l.expiryDate,
          pricingUnitId: l.pricingUnitId,
          pricingUnitFactor: l.pricingUnitFactor,
          purchasePriceMinor: l.purchasePriceMinor,
          mrpMinor: l.mrpMinor,
          sellingPriceMinor: l.sellingPriceMinor,
          barcodes: [],
        })),
        receivedBy: ctx.userId,
        confirmedBy: ctx.userId,
        confirmedAt: new Date(),
      },
    ],
    { session },
  );
  await applyGrn(ctx, grn!, purchase, session);
  await grn!.save({ session });
  await audit(ctx, { action: 'grn.confirmed', entityType: 'Grn', entityId: grn!._id, summary: `Received all lines of ${purchase.number} as ${number}` }, session);
  return grn!;
}

export async function createGrn(ctx: RequestContext, input: CreateGrnInput) {
  const purchase = await PurchaseModel.findOne(orgFilter(ctx, { _id: input.purchaseId }));
  if (!purchase) throw new NotFoundError('Purchase');
  if (String(purchase.outletId) !== String(ctx.outletId)) throw new BusinessRuleError('Switch to the outlet the purchase belongs to');
  if (!['confirmed', 'partially_received'].includes(purchase.status)) throw new BusinessRuleError('This purchase cannot receive stock in its current state');
  if (input.confirm && !hasPermission(ctx, 'purchases.approveGrn')) throw new ForbiddenError('You can create a draft GRN but not confirm it');

  const lines = input.lines.map((g) => {
    const pl = purchase.lines.find((l) => l.lineId === g.purchaseLineId);
    if (!pl) throw new ValidationError('Unknown purchase line', [{ path: 'body.lines', message: g.purchaseLineId }]);
    const outstandingBase = pl.qtyBase - (pl.receivedBase ?? 0) - (pl.damagedBase ?? 0);
    const receivedBase = Math.round(g.receivedQty * pl.factorToBase);
    const damagedBase = Math.round((g.damagedQty ?? 0) * pl.factorToBase);
    const freeBase = Math.round((g.freeQty ?? 0) * pl.factorToBase);
    if (receivedBase + damagedBase > outstandingBase && !hasPermission(ctx, 'purchases.receiveExcess')) {
      throw new BusinessRuleError(`${pl.productName}: receiving ${receivedBase + damagedBase} exceeds the outstanding ${outstandingBase} base units (needs "receive excess" permission)`);
    }
    return {
      purchaseLineId: pl.lineId,
      productId: pl.productId,
      productName: pl.productName,
      unitId: pl.unitId,
      unitName: pl.unitName,
      factorToBase: pl.factorToBase,
      orderedQty: pl.qty,
      receivedQty: g.receivedQty,
      freeQty: g.freeQty ?? 0,
      damagedQty: g.damagedQty ?? 0,
      shortQty: Math.max(0, pl.qty - (pl.receivedBase + pl.damagedBase) / pl.factorToBase - g.receivedQty - (g.damagedQty ?? 0)),
      receivedBase,
      freeBase,
      damagedBase,
      batchNumber: g.batchNumber ?? pl.batchNumber,
      mfgDate: g.mfgDate ?? pl.mfgDate ?? null,
      expiryDate: g.expiryDate ?? pl.expiryDate,
      pricingUnitId: pl.pricingUnitId,
      pricingUnitFactor: pl.pricingUnitFactor,
      purchasePriceMinor: pl.purchasePriceMinor,
      mrpMinor: g.mrpMinor ?? pl.mrpMinor,
      sellingPriceMinor: g.sellingPriceMinor ?? pl.sellingPriceMinor,
      barcodes: [...new Set((g.barcodes ?? []).map((c) => c.trim()).filter(Boolean))],
      note: g.note ?? '',
    };
  });
  // A label identifies one physical pack, so the same code twice in one receipt is a slip.
  const allCodes = lines.flatMap((l) => l.barcodes);
  const dupe = allCodes.find((c, i) => allCodes.indexOf(c) !== i);
  if (dupe) throw new ValidationError(`Barcode ${dupe} is entered on more than one line`, [{ path: 'body.lines', message: dupe }]);
  if (lines.every((l) => l.receivedBase + l.freeBase + l.damagedBase === 0)) throw new ValidationError('Nothing to receive');

  const doc = await withTransaction(async (session) => {
    const { number } = await nextDocumentNumber(ctx.organizationId, purchase.outletId, 'grn', session);
    const [grn] = await GrnModel.create(
      [
        {
          organizationId: ctx.organizationId,
          outletId: purchase.outletId,
          number,
          purchaseId: purchase._id,
          purchaseNumber: purchase.number,
          supplierId: purchase.supplierId,
          supplierName: purchase.supplierSnapshot?.name ?? '',
          receivedDate: input.receivedDate ?? new Date(),
          status: input.confirm ? 'confirmed' : 'draft',
          lines,
          attachments: input.attachments,
          notes: input.notes,
          receivedBy: ctx.userId,
          confirmedBy: input.confirm ? ctx.userId : null,
          confirmedAt: input.confirm ? new Date() : null,
        },
      ],
      { session },
    );
    if (input.confirm) {
      await applyGrn(ctx, grn!, purchase, session);
      await grn!.save({ session });
    }
    await audit(ctx, { action: input.confirm ? 'grn.confirmed' : 'grn.drafted', entityType: 'Grn', entityId: grn!._id, summary: `${input.confirm ? 'Received' : 'Drafted GRN for'} ${purchase.number} as ${number}` }, session);
    return grn!;
  });
  return dto(ctx, doc.toObject() as GrnDoc);
}

export async function confirmGrn(ctx: RequestContext, id: string) {
  const grn = await GrnModel.findOne(orgFilter<GrnDoc>(ctx, { _id: id }));
  if (!grn) throw new NotFoundError('GRN');
  if (grn.status !== 'draft') throw new BusinessRuleError('GRN is already confirmed');
  const purchase = await PurchaseModel.findOne(orgFilter(ctx, { _id: grn.purchaseId }));
  if (!purchase) throw new NotFoundError('Purchase');
  await withTransaction(async (session) => {
    grn.status = 'confirmed';
    grn.confirmedBy = ctx.userId;
    grn.confirmedAt = new Date();
    await applyGrn(ctx, grn, purchase, session);
    await grn.save({ session });
    await audit(ctx, { action: 'grn.confirmed', entityType: 'Grn', entityId: grn._id, summary: `Confirmed GRN ${grn.number}` }, session);
  });
  return dto(ctx, grn.toObject() as GrnDoc);
}

export async function listGrns(ctx: RequestContext, query: PaginationQuery & { purchaseId?: string; status?: string }) {
  const filter = outletFilter<GrnDoc>(ctx, { ...(query.purchaseId ? { purchaseId: query.purchaseId } : {}), ...(query.status ? { status: query.status } : {}) });
  const skip = (query.page - 1) * query.pageSize;
  const [docs, total] = await Promise.all([GrnModel.find(filter).sort({ receivedDate: -1 }).skip(skip).limit(query.pageSize).lean<GrnDoc[]>(), GrnModel.countDocuments(filter)]);
  const who = await userRefs(docs.flatMap((d) => [d.receivedBy, d.confirmedBy]));
  const showCost = hasPermission(ctx, 'products.viewCost');
  return { items: docs.map((d) => toGrnDto(d, who, showCost)), meta: pageMeta(query, total) };
}

export async function getGrn(ctx: RequestContext, id: string) {
  const doc = await GrnModel.findOne(orgFilter<GrnDoc>(ctx, { _id: id })).lean<GrnDoc>();
  if (!doc) throw new NotFoundError('GRN');
  return dto(ctx, doc);
}
