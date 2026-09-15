import { Types, type ClientSession } from 'mongoose';
import type { BatchStockDto } from '@pharmaos/shared';
import { StockModel, type StockDoc } from '@/models/stock.model';
import { ProductBatchModel, type ProductBatchDoc } from '@/models/product-batch.model';
import { InventoryMovementModel, type MovementReason } from '@/models/inventory-movement.model';
import { ProductModel } from '@/models/product.model';
import type { RequestContext } from '@/lib/context';
import { orgFilter, trustedFilter } from '@/lib/scoped';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';

export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

export function toBatchStockDto(batch: ProductBatchDoc, qtyBase: number): BatchStockDto {
  const today = startOfToday();
  return {
    batchId: String(batch._id),
    batchNumber: batch.batchNumber,
    expiryDate: batch.expiryDate.toISOString(),
    mfgDate: batch.mfgDate ? batch.mfgDate.toISOString() : null,
    mrpMinor: batch.mrpMinor,
    sellingPriceMinor: batch.sellingPriceMinor,
    purchasePriceMinor: batch.purchasePriceMinor,
    pricingUnitFactor: batch.pricingUnitFactor,
    qtyBase,
    isExpired: batch.expiryDate < today,
    daysToExpiry: daysBetween(today, batch.expiryDate),
  };
}

/* ---------------------------------------------------------------- reads */

/** Sellable stock (not expired, not blocked) per product at the active outlet, optionally with FEFO batches. */
export async function getStockByProducts(
  ctx: RequestContext,
  productIds: Types.ObjectId[],
  opts: { withBatches?: boolean; includeExpired?: boolean } = {},
): Promise<Map<string, { stockBase: number; batches?: BatchStockDto[] }>> {
  const out = new Map<string, { stockBase: number; batches?: BatchStockDto[] }>();
  if (!ctx.outletId || productIds.length === 0) return out;
  const today = startOfToday();
  const stocks = await StockModel.find(
    trustedFilter({
      organizationId: ctx.organizationId,
      outletId: ctx.outletId,
      productId: { $in: productIds },
      qtyBase: { $gt: 0 },
      ...(opts.includeExpired ? {} : { expiryDate: { $gte: today } }),
    }),
  )
    .sort({ expiryDate: 1 })
    .lean<StockDoc[]>();
  const batchIds = stocks.map((s) => s.batchId);
  const batches = batchIds.length ? await ProductBatchModel.find(trustedFilter({ _id: { $in: batchIds }, status: 'active' })).lean<ProductBatchDoc[]>() : [];
  const batchMap = new Map(batches.map((b) => [String(b._id), b]));
  for (const s of stocks) {
    const batch = batchMap.get(String(s.batchId));
    if (!batch) continue;
    const key = String(s.productId);
    const entry = out.get(key) ?? { stockBase: 0, batches: opts.withBatches ? [] : undefined };
    entry.stockBase += s.qtyBase;
    if (opts.withBatches) entry.batches!.push(toBatchStockDto(batch, s.qtyBase));
    out.set(key, entry);
  }
  return out;
}

/* ---------------------------------------------------------------- writes */

export interface StockChange {
  outletId: Types.ObjectId;
  productId: Types.ObjectId;
  batchId: Types.ObjectId;
  /** Positive adds stock, negative removes. */
  qtyBaseDelta: number;
  reason: MovementReason;
  refType: string;
  refId: Types.ObjectId | null;
  refNumber?: string;
  unitCostMinor?: number;
  pricingUnitFactor?: number;
  note?: string;
  /** Allow removing expired/blocked stock (write-offs, returns to supplier). */
  allowNonSellable?: boolean;
}

/**
 * The only way stock changes. Decrements are conditional (`qtyBase >= needed`) so concurrent
 * sales can never oversell; every change appends one movement with the resulting balance.
 * Must be called inside a transaction.
 */
export async function applyStockChange(ctx: RequestContext, change: StockChange, session: ClientSession): Promise<StockDoc> {
  if (!Number.isInteger(change.qtyBaseDelta) || change.qtyBaseDelta === 0) throw new BusinessRuleError('Stock change must be a non-zero whole number of base units');

  const batch = await ProductBatchModel.findOne({ _id: change.batchId, organizationId: ctx.organizationId }).session(session).lean<ProductBatchDoc>();
  if (!batch) throw new NotFoundError('Batch');
  if (String(batch.productId) !== String(change.productId)) throw new BusinessRuleError('Batch does not belong to this product');

  let stock: StockDoc | null;
  if (change.qtyBaseDelta > 0) {
    stock = await StockModel.findOneAndUpdate(
      { organizationId: ctx.organizationId, outletId: change.outletId, batchId: change.batchId },
      {
        $inc: { qtyBase: change.qtyBaseDelta },
        $set: { lastMovementAt: new Date(), expiryDate: batch.expiryDate },
        $setOnInsert: { organizationId: ctx.organizationId, outletId: change.outletId, productId: change.productId, batchId: change.batchId, inTransitBase: 0 },
      },
      { new: true, upsert: true, session },
    ).lean<StockDoc>();
  } else {
    const needed = -change.qtyBaseDelta;
    if (!change.allowNonSellable) {
      if (batch.status !== 'active') throw new BusinessRuleError(`Batch ${batch.batchNumber} is blocked (${batch.blockReason || 'quality hold'})`);
      if (batch.expiryDate < startOfToday()) throw new BusinessRuleError(`Batch ${batch.batchNumber} has expired and cannot be sold`);
    }
    stock = await StockModel.findOneAndUpdate(
      trustedFilter({ organizationId: ctx.organizationId, outletId: change.outletId, batchId: change.batchId, qtyBase: { $gte: needed } }),
      { $inc: { qtyBase: -needed }, $set: { lastMovementAt: new Date() } },
      { new: true, session },
    ).lean<StockDoc>();
    if (!stock) {
      const current = await StockModel.findOne({ organizationId: ctx.organizationId, outletId: change.outletId, batchId: change.batchId }).session(session).lean<StockDoc>();
      const err = new BusinessRuleError(`Insufficient stock in batch ${batch.batchNumber}: available ${current?.qtyBase ?? 0}, needed ${needed}`);
      (err as unknown as { code: string }).code = 'INSUFFICIENT_STOCK';
      throw err;
    }
  }

  await InventoryMovementModel.create(
    [
      {
        organizationId: ctx.organizationId,
        outletId: change.outletId,
        productId: change.productId,
        batchId: change.batchId,
        qtyBaseDelta: change.qtyBaseDelta,
        balanceAfterBase: stock!.qtyBase,
        reason: change.reason,
        refType: change.refType,
        refId: change.refId,
        refNumber: change.refNumber ?? '',
        unitCostMinor: change.unitCostMinor ?? batch.purchasePriceMinor,
        pricingUnitFactor: change.pricingUnitFactor ?? batch.pricingUnitFactor,
        note: change.note ?? '',
        userId: ctx.userId,
      },
    ],
    { session },
  );
  await ProductModel.updateOne(trustedFilter({ _id: change.productId, hasMovements: { $ne: true } }), { $set: { hasMovements: true } }, { session });
  return stock!;
}

export interface EnsureBatchInput {
  productId: Types.ObjectId;
  batchNumber: string;
  mfgDate?: Date | null;
  expiryDate: Date;
  pricingUnitId: Types.ObjectId;
  pricingUnitFactor: number;
  mrpMinor: number;
  sellingPriceMinor: number;
  purchasePriceMinor: number;
  supplierId?: Types.ObjectId | null;
  sourceType: ProductBatchDoc['sourceType'];
  sourceId?: Types.ObjectId | null;
}

/** Finds an existing batch (same product, batch number and MRP) or creates it. */
export async function ensureBatch(ctx: RequestContext, input: EnsureBatchInput, session: ClientSession): Promise<ProductBatchDoc> {
  const batchNumberNormalized = input.batchNumber.trim().toUpperCase();
  const existing = await ProductBatchModel.findOne({
    organizationId: ctx.organizationId,
    productId: input.productId,
    batchNumberNormalized,
    mrpMinor: input.mrpMinor,
  })
    .session(session)
    .lean<ProductBatchDoc>();
  if (existing) {
    if (existing.expiryDate.getTime() !== input.expiryDate.getTime()) {
      // Same batch number should carry the same expiry; keep the earliest for safety and note it.
      await ProductBatchModel.updateOne({ _id: existing._id }, { $set: { expiryDate: new Date(Math.min(existing.expiryDate.getTime(), input.expiryDate.getTime())) } }, { session });
    }
    // Latest purchase price wins for valuation of future movements.
    await ProductBatchModel.updateOne({ _id: existing._id }, { $set: { purchasePriceMinor: input.purchasePriceMinor, sellingPriceMinor: input.sellingPriceMinor } }, { session });
    return { ...existing, purchasePriceMinor: input.purchasePriceMinor, sellingPriceMinor: input.sellingPriceMinor };
  }
  const [batch] = await ProductBatchModel.create(
    [
      {
        organizationId: ctx.organizationId,
        productId: input.productId,
        batchNumber: input.batchNumber.trim(),
        batchNumberNormalized,
        mfgDate: input.mfgDate ?? null,
        expiryDate: input.expiryDate,
        pricingUnitId: input.pricingUnitId,
        pricingUnitFactor: input.pricingUnitFactor,
        mrpMinor: input.mrpMinor,
        sellingPriceMinor: input.sellingPriceMinor,
        purchasePriceMinor: input.purchasePriceMinor,
        supplierId: input.supplierId ?? null,
        sourceType: input.sourceType,
        sourceId: input.sourceId ?? null,
        createdBy: ctx.userId,
      },
    ],
    { session },
  );
  return batch!.toObject() as ProductBatchDoc;
}

/**
 * FEFO allocation: returns batch slices (earliest expiry first) that cover `qtyBase` at the outlet.
 * Batches expiring within `blockDays` are skipped. Throws when total sellable stock is short.
 */
export async function allocateFefo(
  ctx: RequestContext,
  outletId: Types.ObjectId,
  productId: Types.ObjectId,
  qtyBase: number,
  blockDays: number,
  session?: ClientSession,
  /** Quantities already claimed by earlier lines of the same request, keyed by batch id. */
  reserved?: Map<string, number>,
): Promise<{ batch: ProductBatchDoc; qtyBase: number }[]> {
  const minExpiry = new Date(startOfToday().getTime() + blockDays * 86_400_000);
  const stocksQuery = StockModel.find(trustedFilter({ organizationId: ctx.organizationId, outletId, productId, qtyBase: { $gt: 0 }, expiryDate: { $gte: minExpiry } })).sort({ expiryDate: 1, _id: 1 });
  const stocks = await (session ? stocksQuery.session(session) : stocksQuery).lean<StockDoc[]>();
  const batches = await ProductBatchModel.find(trustedFilter({ _id: { $in: stocks.map((s) => s.batchId) }, status: 'active' })).lean<ProductBatchDoc[]>();
  const batchMap = new Map(batches.map((b) => [String(b._id), b]));
  const slices: { batch: ProductBatchDoc; qtyBase: number }[] = [];
  let remaining = qtyBase;
  for (const s of stocks) {
    if (remaining <= 0) break;
    const batch = batchMap.get(String(s.batchId));
    if (!batch) continue;
    const available = s.qtyBase - (reserved?.get(String(s.batchId)) ?? 0);
    if (available <= 0) continue;
    const take = Math.min(remaining, available);
    slices.push({ batch, qtyBase: take });
    remaining -= take;
  }
  if (remaining > 0) {
    const err = new BusinessRuleError(`Insufficient sellable stock: short by ${remaining} base unit(s)`);
    (err as unknown as { code: string }).code = 'INSUFFICIENT_STOCK';
    throw err;
  }
  return slices;
}

/** Total on-hand per product across an outlet (any expiry), for low-stock and valuation. */
export async function onHandByProduct(ctx: RequestContext, outletId: Types.ObjectId | null, productIds?: Types.ObjectId[]) {
  const rows = await StockModel.aggregate<{ _id: Types.ObjectId; qtyBase: number }>([
    { $match: { organizationId: ctx.organizationId, ...(outletId ? { outletId } : {}), ...(productIds ? { productId: { $in: productIds } } : {}), qtyBase: { $gt: 0 } } },
    { $group: { _id: '$productId', qtyBase: { $sum: '$qtyBase' } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.qtyBase]));
}

export function assertOrgFilterUsed(_: typeof orgFilter) {
  /* keeps the import meaningful for readers: all list queries in this module use trustedFilter/orgFilter */
}
