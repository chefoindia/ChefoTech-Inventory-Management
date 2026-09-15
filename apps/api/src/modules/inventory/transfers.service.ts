import { Types } from 'mongoose';
import type { CreateTransferInput, ReceiveTransferInput, TransferDto, PaginationQuery } from '@pharmaos/shared';
import { StockTransferModel, type StockTransferDoc } from '@/models/stock-transfer.model';
import { StockModel, type StockDoc } from '@/models/stock.model';
import { ProductBatchModel, type ProductBatchDoc } from '@/models/product-batch.model';
import { ProductModel, type ProductDoc } from '@/models/product.model';
import { UnitModel, type UnitDoc } from '@/models/unit.model';
import { OutletModel, type OutletDoc } from '@/models/outlet.model';
import { UserModel, type UserDoc } from '@/models/user.model';
import type { RequestContext } from '@/lib/context';
import { canAccessOutlet, hasPermission } from '@/lib/context';
import { orgFilter, trustedFilter } from '@/lib/scoped';
import { pageMeta } from '@/lib/pagination';
import { BusinessRuleError, ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { withTransaction } from '@/db/transaction';
import { audit } from '@/services/audit.service';
import { nextDocumentNumber } from '@/services/sequence.service';
import { applyStockChange } from './stock.service';
import { factorFor, requireOutletId, toBaseQty } from './inventory.service';
import { randomToken } from '@/lib/crypto';

async function toDto(ctx: RequestContext, doc: StockTransferDoc): Promise<TransferDto> {
  const [outlets, users] = await Promise.all([
    OutletModel.find(trustedFilter({ _id: { $in: [doc.fromOutletId, doc.toOutletId] } })).select('name').lean<Pick<OutletDoc, '_id' | 'name'>[]>(),
    UserModel.find(trustedFilter({ _id: { $in: [doc.requestedBy, doc.approvedBy, doc.dispatchedBy, doc.receivedBy].filter(Boolean) } })).select('name').lean<Pick<UserDoc, '_id' | 'name'>[]>(),
  ]);
  const oMap = new Map(outlets.map((o) => [String(o._id), o.name]));
  const uMap = new Map(users.map((u) => [String(u._id), u.name]));
  const who = (id: Types.ObjectId | null | undefined) => (id ? { id: String(id), name: uMap.get(String(id)) ?? '' } : null);
  return {
    id: String(doc._id),
    number: doc.number,
    fromOutletId: String(doc.fromOutletId),
    fromOutletName: oMap.get(String(doc.fromOutletId)) ?? '',
    toOutletId: String(doc.toOutletId),
    toOutletName: oMap.get(String(doc.toOutletId)) ?? '',
    status: doc.status as TransferDto['status'],
    lines: doc.lines.map((l) => ({
      lineId: l.lineId,
      productId: String(l.productId),
      productName: l.productName,
      batchId: String(l.batchId),
      batchNumber: l.batchNumber,
      expiryDate: l.expiryDate.toISOString(),
      unitId: String(l.unitId),
      unitName: l.unitName ?? '',
      factorToBase: l.factorToBase ?? 1,
      qtyRequestedBase: l.qtyRequestedBase,
      qtyDispatchedBase: l.qtyDispatchedBase ?? 0,
      qtyReceivedBase: l.qtyReceivedBase ?? 0,
      discrepancyNote: l.discrepancyNote ?? '',
    })),
    notes: doc.notes ?? '',
    requestedBy: who(doc.requestedBy),
    approvedBy: who(doc.approvedBy),
    dispatchedBy: who(doc.dispatchedBy),
    receivedBy: who(doc.receivedBy),
    requestedAt: doc.requestedAt?.toISOString() ?? doc.createdAt?.toISOString() ?? new Date().toISOString(),
    approvedAt: doc.approvedAt ? doc.approvedAt.toISOString() : null,
    dispatchedAt: doc.dispatchedAt ? doc.dispatchedAt.toISOString() : null,
    receivedAt: doc.receivedAt ? doc.receivedAt.toISOString() : null,
    cancelledAt: doc.cancelledAt ? doc.cancelledAt.toISOString() : null,
    createdAt: doc.createdAt?.toISOString?.() ?? new Date().toISOString(),
  };
}

async function load(ctx: RequestContext, id: string) {
  const doc = await StockTransferModel.findOne(orgFilter<StockTransferDoc>(ctx, { _id: id }));
  if (!doc) throw new NotFoundError('Transfer');
  if (!canAccessOutlet(ctx, doc.fromOutletId) && !canAccessOutlet(ctx, doc.toOutletId)) throw new ForbiddenError('You do not have access to either outlet of this transfer');
  return doc;
}

/** Move stock from the source outlet's on-hand into its in-transit bucket (dispatch). */
async function dispatchLines(ctx: RequestContext, doc: StockTransferDoc, session: Parameters<typeof applyStockChange>[2]) {
  for (const line of doc.lines) {
    await applyStockChange(ctx, { outletId: doc.fromOutletId, productId: line.productId, batchId: line.batchId, qtyBaseDelta: -line.qtyRequestedBase, reason: 'transfer_out', refType: 'StockTransfer', refId: doc._id, refNumber: doc.number, unitCostMinor: line.unitCostMinor, pricingUnitFactor: line.pricingUnitFactor }, session);
    await StockModel.updateOne({ organizationId: ctx.organizationId, outletId: doc.fromOutletId, batchId: line.batchId }, { $inc: { inTransitBase: line.qtyRequestedBase } }, { session });
    line.qtyDispatchedBase = line.qtyRequestedBase;
  }
}

export async function createTransfer(ctx: RequestContext, input: CreateTransferInput) {
  const fromOutletId = requireOutletId(ctx);
  if (String(fromOutletId) === input.toOutletId) throw new ValidationError('Source and destination outlets must differ', [{ path: 'body.toOutletId', message: 'Same as source' }]);
  const dest = await OutletModel.findOne(orgFilter<OutletDoc>(ctx, { _id: input.toOutletId, status: { $ne: 'archived' } })).lean<OutletDoc>();
  if (!dest) throw new NotFoundError('Destination outlet');
  if (input.dispatchNow && !hasPermission(ctx, 'inventory.transfer.dispatch')) throw new ForbiddenError('You cannot dispatch transfers');

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

  const stocks = await StockModel.find(trustedFilter({ organizationId: ctx.organizationId, outletId: fromOutletId, batchId: { $in: batchIds } })).lean<StockDoc[]>();
  const sMap = new Map(stocks.map((s) => [String(s.batchId), s.qtyBase]));

  const lines = input.lines.map((l) => {
    const product = pMap.get(l.productId)!;
    const batch = bMap.get(l.batchId)!;
    if (String(batch.productId) !== l.productId) throw new ValidationError('Batch does not belong to product');
    const factor = factorFor(product, l.unitId);
    const qtyBase = toBaseQty(l.qty, factor, uMap.get(l.unitId)?.allowsDecimal ?? false);
    if (qtyBase <= 0) throw new ValidationError('Quantity must be positive');
    if ((sMap.get(l.batchId) ?? 0) < qtyBase) throw new BusinessRuleError(`Insufficient stock of ${product.name} batch ${batch.batchNumber}: available ${sMap.get(l.batchId) ?? 0}, requested ${qtyBase}`);
    return {
      lineId: randomToken(6),
      productId: product._id,
      productName: product.name,
      batchId: batch._id,
      batchNumber: batch.batchNumber,
      expiryDate: batch.expiryDate,
      unitId: new Types.ObjectId(l.unitId),
      unitName: uMap.get(l.unitId)?.abbreviation ?? '',
      factorToBase: factor,
      qtyRequestedBase: qtyBase,
      qtyDispatchedBase: 0,
      qtyReceivedBase: 0,
      unitCostMinor: batch.purchasePriceMinor,
      pricingUnitFactor: batch.pricingUnitFactor,
      discrepancyNote: '',
    };
  });

  const doc = await withTransaction(async (session) => {
    const { number } = await nextDocumentNumber(ctx.organizationId, null, 'transfer', session);
    const [created] = await StockTransferModel.create(
      [
        {
          organizationId: ctx.organizationId,
          number,
          fromOutletId,
          toOutletId: dest._id,
          status: input.dispatchNow ? 'dispatched' : 'requested',
          lines,
          notes: input.notes,
          requestedBy: ctx.userId,
          ...(input.dispatchNow ? { approvedBy: ctx.userId, approvedAt: new Date(), dispatchedBy: ctx.userId, dispatchedAt: new Date() } : {}),
        },
      ],
      { session },
    );
    if (input.dispatchNow) {
      await dispatchLines(ctx, created!, session);
      await created!.save({ session });
    }
    await audit(ctx, { action: input.dispatchNow ? 'transfer.dispatched' : 'transfer.requested', entityType: 'StockTransfer', entityId: created!._id, summary: `${input.dispatchNow ? 'Dispatched' : 'Requested'} transfer ${number} to ${dest.name}` }, session);
    return created!;
  });
  return toDto(ctx, doc.toObject() as StockTransferDoc);
}

export async function approveTransfer(ctx: RequestContext, id: string) {
  const doc = await load(ctx, id);
  if (doc.status !== 'requested') throw new BusinessRuleError('Only requested transfers can be approved');
  doc.status = 'approved';
  doc.approvedBy = ctx.userId;
  doc.approvedAt = new Date();
  await doc.save();
  await audit(ctx, { action: 'transfer.approved', entityType: 'StockTransfer', entityId: doc._id, summary: `Approved transfer ${doc.number}` });
  return toDto(ctx, doc.toObject() as StockTransferDoc);
}

export async function dispatchTransfer(ctx: RequestContext, id: string) {
  const doc = await load(ctx, id);
  if (!['requested', 'approved'].includes(doc.status)) throw new BusinessRuleError('Transfer cannot be dispatched in its current state');
  if (!canAccessOutlet(ctx, doc.fromOutletId)) throw new ForbiddenError('You do not have access to the source outlet');
  await withTransaction(async (session) => {
    await dispatchLines(ctx, doc, session);
    doc.status = 'dispatched';
    doc.dispatchedBy = ctx.userId;
    doc.dispatchedAt = new Date();
    if (!doc.approvedAt) {
      doc.approvedBy = ctx.userId;
      doc.approvedAt = new Date();
    }
    await doc.save({ session });
    await audit(ctx, { action: 'transfer.dispatched', entityType: 'StockTransfer', entityId: doc._id, summary: `Dispatched transfer ${doc.number}` }, session);
  });
  return toDto(ctx, doc.toObject() as StockTransferDoc);
}

export async function receiveTransfer(ctx: RequestContext, id: string, input: ReceiveTransferInput) {
  const doc = await load(ctx, id);
  if (doc.status !== 'dispatched') throw new BusinessRuleError('Only dispatched transfers can be received');
  if (!canAccessOutlet(ctx, doc.toOutletId)) throw new ForbiddenError('You do not have access to the destination outlet');
  const byLine = new Map(input.lines.map((l) => [l.lineId, l]));
  let discrepancy = false;
  await withTransaction(async (session) => {
    for (const line of doc.lines) {
      const r = byLine.get(line.lineId);
      if (!r) throw new ValidationError(`Missing receipt for ${line.productName} batch ${line.batchNumber}`);
      if (r.qtyReceivedBase > line.qtyDispatchedBase) throw new ValidationError(`Cannot receive more than dispatched for ${line.productName}`);
      line.qtyReceivedBase = r.qtyReceivedBase;
      line.discrepancyNote = r.discrepancyNote ?? '';
      const short = line.qtyDispatchedBase - r.qtyReceivedBase;
      if (short > 0) discrepancy = true;
      // Release in-transit at the source; shortfalls are recorded as lost at the source (traceable).
      await StockModel.updateOne({ organizationId: ctx.organizationId, outletId: doc.fromOutletId, batchId: line.batchId }, { $inc: { inTransitBase: -line.qtyDispatchedBase } }, { session });
      if (r.qtyReceivedBase > 0) {
        await applyStockChange(ctx, { outletId: doc.toOutletId, productId: line.productId, batchId: line.batchId, qtyBaseDelta: r.qtyReceivedBase, reason: 'transfer_in', refType: 'StockTransfer', refId: doc._id, refNumber: doc.number, unitCostMinor: line.unitCostMinor, pricingUnitFactor: line.pricingUnitFactor, note: r.discrepancyNote }, session);
      }
      if (short > 0) {
        // Bring the shortfall back into on-hand at the source then write it off, so the loss is a movement.
        await applyStockChange(ctx, { outletId: doc.fromOutletId, productId: line.productId, batchId: line.batchId, qtyBaseDelta: short, reason: 'transfer_in', refType: 'StockTransfer', refId: doc._id, refNumber: doc.number, note: 'Shortfall returned to source for write-off' }, session);
        await applyStockChange(ctx, { outletId: doc.fromOutletId, productId: line.productId, batchId: line.batchId, qtyBaseDelta: -short, reason: 'lost', refType: 'StockTransfer', refId: doc._id, refNumber: doc.number, note: `Transfer discrepancy: ${r.discrepancyNote || 'not received'}`, allowNonSellable: true }, session);
      }
    }
    doc.status = discrepancy ? 'partially_received' : 'received';
    doc.receivedBy = ctx.userId;
    doc.receivedAt = new Date();
    doc.notes = input.notes ? `${doc.notes ? doc.notes + '\n' : ''}${input.notes}` : doc.notes;
    await doc.save({ session });
    await audit(ctx, { action: 'transfer.received', entityType: 'StockTransfer', entityId: doc._id, summary: `Received transfer ${doc.number}${discrepancy ? ' with discrepancies' : ''}` }, session);
  });
  return toDto(ctx, doc.toObject() as StockTransferDoc);
}

export async function cancelTransfer(ctx: RequestContext, id: string, reason: string) {
  const doc = await load(ctx, id);
  if (!['requested', 'approved', 'dispatched'].includes(doc.status)) throw new BusinessRuleError('Transfer cannot be cancelled in its current state');
  await withTransaction(async (session) => {
    if (doc.status === 'dispatched') {
      // Return in-transit stock to the source outlet.
      for (const line of doc.lines) {
        await StockModel.updateOne({ organizationId: ctx.organizationId, outletId: doc.fromOutletId, batchId: line.batchId }, { $inc: { inTransitBase: -line.qtyDispatchedBase } }, { session });
        await applyStockChange(ctx, { outletId: doc.fromOutletId, productId: line.productId, batchId: line.batchId, qtyBaseDelta: line.qtyDispatchedBase, reason: 'transfer_in', refType: 'StockTransfer', refId: doc._id, refNumber: doc.number, note: `Transfer cancelled: ${reason}` }, session);
        line.qtyDispatchedBase = 0;
      }
    }
    doc.status = 'cancelled';
    doc.cancelledBy = ctx.userId;
    doc.cancelledAt = new Date();
    doc.cancelReason = reason;
    await doc.save({ session });
    await audit(ctx, { action: 'transfer.cancelled', entityType: 'StockTransfer', entityId: doc._id, summary: `Cancelled transfer ${doc.number}: ${reason}` }, session);
  });
  return toDto(ctx, doc.toObject() as StockTransferDoc);
}

export async function listTransfers(ctx: RequestContext, query: PaginationQuery & { status?: string; direction: 'in' | 'out' | 'all' }) {
  const outletId = requireOutletId(ctx);
  const dir =
    query.direction === 'in' ? { toOutletId: outletId } : query.direction === 'out' ? { fromOutletId: outletId } : { $or: [{ fromOutletId: outletId }, { toOutletId: outletId }] };
  const filter = orgFilter<StockTransferDoc>(ctx, { ...dir, ...(query.status ? { status: query.status } : {}) });
  const skip = (query.page - 1) * query.pageSize;
  const [docs, total] = await Promise.all([
    StockTransferModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.pageSize).lean<StockTransferDoc[]>(),
    StockTransferModel.countDocuments(filter),
  ]);
  return { items: await Promise.all(docs.map((d) => toDto(ctx, d))), meta: pageMeta(query, total) };
}

export async function getTransfer(ctx: RequestContext, id: string) {
  const doc = await load(ctx, id);
  return toDto(ctx, doc.toObject() as StockTransferDoc);
}
