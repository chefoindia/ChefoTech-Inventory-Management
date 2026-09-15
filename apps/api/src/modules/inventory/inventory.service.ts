import { Types } from 'mongoose';
import type {
  OpeningStockInput,
  CreateAdjustmentInput,
  StockQuery,
  BatchListQuery,
  MovementQuery,
  StockOverviewRow,
  BatchRow,
  MovementRow,
  AdjustmentDto,
  ExpirySummary,
  PaginationQuery,
} from '@pharmaos/shared';
import { roundHalfUp } from '@pharmaos/shared';
import { StockModel, type StockDoc } from '@/models/stock.model';
import { ProductBatchModel, type ProductBatchDoc } from '@/models/product-batch.model';
import { InventoryMovementModel, type InventoryMovementDoc } from '@/models/inventory-movement.model';
import { StockAdjustmentModel, type StockAdjustmentDoc } from '@/models/stock-adjustment.model';
import { ProductModel, type ProductDoc } from '@/models/product.model';
import { UnitModel, type UnitDoc } from '@/models/unit.model';
import { CategoryModel, type CategoryDoc } from '@/models/category.model';
import { SupplierModel, type SupplierDoc } from '@/models/supplier.model';
import { OrganizationModel } from '@/models/organization.model';
import { UserModel, type UserDoc } from '@/models/user.model';
import type { RequestContext } from '@/lib/context';
import { hasPermission } from '@/lib/context';
import { orgFilter, outletFilter, trustedFilter, findOrgDocOrThrow } from '@/lib/scoped';
import { pageMeta, escapeRegex, pageOptions } from '@/lib/pagination';
import { BusinessRuleError, ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { withTransaction } from '@/db/transaction';
import { audit } from '@/services/audit.service';
import { nextDocumentNumber } from '@/services/sequence.service';
import { applyStockChange, ensureBatch, startOfToday, toBatchStockDto, daysBetween } from './stock.service';
import { normalizeName } from '@/models/product.model';

/* ---------------------------------------------------------------- helpers */

export function requireOutletId(ctx: RequestContext): Types.ObjectId {
  if (!ctx.outletId) throw new ValidationError('Select an outlet first (X-Outlet-Id header missing)');
  return ctx.outletId;
}

export function factorFor(product: Pick<ProductDoc, 'units'>, unitId: string): number {
  const u = product.units.find((x) => String(x.unitId) === unitId);
  if (!u) throw new ValidationError(`Unit is not configured for product`, [{ path: 'unitId', message: 'Unit not allowed for this product' }]);
  return u.factorToBase;
}

export function toBaseQty(qty: number, factor: number, allowsDecimal: boolean): number {
  const base = qty * factor;
  if (!Number.isInteger(base)) {
    if (!allowsDecimal) throw new ValidationError('Quantity must be a whole number of base units', [{ path: 'qty', message: `Results in ${base} base units` }]);
    return roundHalfUp(base);
  }
  return base;
}

async function userMap(ids: (Types.ObjectId | null | undefined)[]) {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  const users = unique.length ? await UserModel.find(trustedFilter({ _id: { $in: unique } })).select('name').lean<Pick<UserDoc, '_id' | 'name'>[]>() : [];
  const map = new Map(users.map((u) => [String(u._id), u.name]));
  return (id: Types.ObjectId | null | undefined) => (id ? { id: String(id), name: map.get(String(id)) ?? '' } : null);
}

async function expiryWarningDays(ctx: RequestContext): Promise<number> {
  const org = await OrganizationModel.findById(ctx.organizationId).select('settings.inventory').lean();
  const days = org?.settings?.inventory?.expiryWarningDays ?? [30, 60, 90];
  return Math.max(...days);
}

/* ---------------------------------------------------------------- stock overview */

export async function stockOverview(ctx: RequestContext, query: StockQuery) {
  const outletId = query.outletId ? new Types.ObjectId(query.outletId) : requireOutletId(ctx);
  const canValue = hasPermission(ctx, 'inventory.viewValuation');
  const today = startOfToday();
  const warnDays = await expiryWarningDays(ctx);
  const nearDate = new Date(today.getTime() + warnDays * 86_400_000);

  // Aggregate stock per product at the outlet.
  const agg = await StockModel.aggregate<{
    _id: Types.ObjectId;
    onHand: number;
    inTransit: number;
    expired: number;
    near: number;
    batches: number;
    nextExpiry: Date | null;
    batchIds: Types.ObjectId[];
  }>([
    { $match: { organizationId: ctx.organizationId, outletId, $or: [{ qtyBase: { $gt: 0 } }, { inTransitBase: { $gt: 0 } }] } },
    {
      $group: {
        _id: '$productId',
        onHand: { $sum: '$qtyBase' },
        inTransit: { $sum: '$inTransitBase' },
        expired: { $sum: { $cond: [{ $lt: ['$expiryDate', today] }, '$qtyBase', 0] } },
        near: { $sum: { $cond: [{ $and: [{ $gte: ['$expiryDate', today] }, { $lte: ['$expiryDate', nearDate] }] }, '$qtyBase', 0] } },
        batches: { $sum: { $cond: [{ $gt: ['$qtyBase', 0] }, 1, 0] } },
        nextExpiry: { $min: { $cond: [{ $and: [{ $gt: ['$qtyBase', 0] }, { $gte: ['$expiryDate', today] }] }, '$expiryDate', null] } },
        batchIds: { $push: '$batchId' },
      },
    },
  ]);
  const stockMap = new Map(agg.map((a) => [String(a._id), a]));

  const productFilter = orgFilter<ProductDoc>(ctx, {
    status: { $ne: 'archived' },
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.q ? { searchTokens: { $regex: `^${escapeRegex(normalizeName(query.q).split(' ')[0] ?? '')}` } } : {}),
    ...(query.onlyInStock ? { _id: { $in: agg.map((a) => a._id) } } : {}),
  });

  const { skip, limit, sort } = pageOptions(query, ['name'], { nameNormalized: 1 });
  const [products, total, units, cats] = await Promise.all([
    ProductModel.find(productFilter).sort(sort).skip(query.lowStock ? 0 : skip).limit(query.lowStock ? 5000 : limit).lean<ProductDoc[]>(),
    ProductModel.countDocuments(productFilter),
    UnitModel.find(orgFilter<UnitDoc>(ctx, {})).lean<UnitDoc[]>(),
    CategoryModel.find(orgFilter<CategoryDoc>(ctx, {})).select('name').lean<Pick<CategoryDoc, '_id' | 'name'>[]>(),
  ]);
  const unitName = new Map(units.map((u) => [String(u._id), u.abbreviation]));
  const catName = new Map(cats.map((c) => [String(c._id), c.name]));

  // Valuation needs batch costs.
  let costByBatch = new Map<string, ProductBatchDoc>();
  if (canValue) {
    const batchIds = products.flatMap((p) => stockMap.get(String(p._id))?.batchIds ?? []);
    const batches = batchIds.length ? await ProductBatchModel.find(trustedFilter({ _id: { $in: batchIds } })).lean<ProductBatchDoc[]>() : [];
    costByBatch = new Map(batches.map((b) => [String(b._id), b]));
  }
  const stockRows = canValue
    ? await StockModel.find(trustedFilter({ organizationId: ctx.organizationId, outletId, productId: { $in: products.map((p) => p._id) }, qtyBase: { $gt: 0 } })).lean<StockDoc[]>()
    : [];
  const valuation = new Map<string, { cost: number; mrp: number }>();
  for (const s of stockRows) {
    const b = costByBatch.get(String(s.batchId));
    if (!b) continue;
    const v = valuation.get(String(s.productId)) ?? { cost: 0, mrp: 0 };
    v.cost += roundHalfUp((s.qtyBase * b.purchasePriceMinor) / b.pricingUnitFactor);
    v.mrp += roundHalfUp((s.qtyBase * b.mrpMinor) / b.pricingUnitFactor);
    valuation.set(String(s.productId), v);
  }

  let rows: StockOverviewRow[] = products.map((p) => {
    const s = stockMap.get(String(p._id));
    const onHand = s?.onHand ?? 0;
    const expired = s?.expired ?? 0;
    const pricingUnit = p.units.find((u) => String(u.unitId) === String(p.pricingUnitId));
    const threshold = p.stockRules?.reorderLevelBase ?? 0;
    const v = valuation.get(String(p._id));
    return {
      productId: String(p._id),
      name: p.name,
      packLabel: p.packLabel ?? '',
      manufacturer: p.manufacturer ?? '',
      categoryName: p.categoryId ? (catName.get(String(p.categoryId)) ?? '') : '',
      baseUnit: unitName.get(String(p.baseUnitId)) ?? '',
      pricingUnit: unitName.get(String(p.pricingUnitId)) ?? '',
      pricingUnitFactor: pricingUnit?.factorToBase ?? 1,
      onHandBase: onHand,
      sellableBase: onHand - expired,
      expiredBase: expired,
      nearExpiryBase: s?.near ?? 0,
      inTransitBase: s?.inTransit ?? 0,
      reorderLevelBase: threshold,
      minStockBase: p.stockRules?.minStockBase ?? 0,
      isLow: threshold > 0 && onHand - expired <= threshold,
      batchCount: s?.batches ?? 0,
      valuationCostMinor: canValue ? (v?.cost ?? 0) : undefined,
      valuationMrpMinor: canValue ? (v?.mrp ?? 0) : undefined,
      nextExpiry: s?.nextExpiry ? s.nextExpiry.toISOString() : null,
    };
  });
  if (query.lowStock) {
    rows = rows.filter((r) => r.isLow || (r.reorderLevelBase === 0 && r.sellableBase === 0 && r.onHandBase === 0));
    const t = rows.length;
    return { items: rows.slice(skip, skip + limit), meta: pageMeta(query, t) };
  }
  return { items: rows, meta: pageMeta(query, total) };
}

/* ---------------------------------------------------------------- batches */

export async function listBatches(ctx: RequestContext, query: BatchListQuery) {
  const outletId = requireOutletId(ctx);
  const today = startOfToday();
  const within = query.withinDays ?? (await expiryWarningDays(ctx));
  const nearDate = new Date(today.getTime() + within * 86_400_000);
  const stockFilter = outletFilter<StockDoc>(ctx, {
    ...(query.includeZero ? {} : { qtyBase: { $gt: 0 } }),
    ...(query.productId ? { productId: query.productId } : {}),
    ...(query.expiryStatus === 'expired' ? { expiryDate: { $lt: today } } : {}),
    ...(query.expiryStatus === 'expiring' ? { expiryDate: { $gte: today, $lte: nearDate } } : {}),
    ...(query.expiryStatus === 'safe' ? { expiryDate: { $gt: nearDate } } : {}),
  });
  if (query.q) {
    const prods = await ProductModel.find(orgFilter<ProductDoc>(ctx, { searchTokens: { $regex: `^${escapeRegex(normalizeName(query.q).split(' ')[0] ?? '')}` } })).select('_id').limit(200).lean();
    stockFilter.productId = { $in: prods.map((p) => p._id) } as never;
    Object.assign(stockFilter, trustedFilter({ productId: { $in: prods.map((p) => p._id) } }));
  }
  const skip = (query.page - 1) * query.pageSize;
  const [stocks, total] = await Promise.all([
    StockModel.find(stockFilter).sort({ expiryDate: 1 }).skip(skip).limit(query.pageSize).lean<StockDoc[]>(),
    StockModel.countDocuments(stockFilter),
  ]);
  const [batches, products, units] = await Promise.all([
    ProductBatchModel.find(trustedFilter({ _id: { $in: stocks.map((s) => s.batchId) } })).lean<ProductBatchDoc[]>(),
    ProductModel.find(trustedFilter({ _id: { $in: stocks.map((s) => s.productId) } })).select('name packLabel pricingUnitId').lean<ProductDoc[]>(),
    UnitModel.find(orgFilter<UnitDoc>(ctx, {})).lean<UnitDoc[]>(),
  ]);
  const supplierIds = batches.map((b) => b.supplierId).filter(Boolean);
  const suppliers = supplierIds.length ? await SupplierModel.find(trustedFilter({ _id: { $in: supplierIds } })).select('name').lean<Pick<SupplierDoc, '_id' | 'name'>[]>() : [];
  const bMap = new Map(batches.map((b) => [String(b._id), b]));
  const pMap = new Map(products.map((p) => [String(p._id), p]));
  const uMap = new Map(units.map((u) => [String(u._id), u.abbreviation]));
  const sMap = new Map(suppliers.map((s) => [String(s._id), s.name]));
  const showCost = hasPermission(ctx, 'products.viewCost');
  const items: BatchRow[] = [];
  for (const s of stocks) {
      const b = bMap.get(String(s.batchId));
      const p = pMap.get(String(s.productId));
      if (!b || !p) continue;
      const dto = toBatchStockDto(b, s.qtyBase);
      items.push({
        ...dto,
        purchasePriceMinor: showCost ? dto.purchasePriceMinor : undefined,
        productId: String(p._id),
        productName: p.name,
        packLabel: p.packLabel ?? '',
        pricingUnit: uMap.get(String(b.pricingUnitId)) ?? '',
        outletId: String(outletId),
        status: (b.status ?? 'active') as 'active' | 'blocked',
        blockReason: b.blockReason ?? '',
        supplierName: b.supplierId ? sMap.get(String(b.supplierId)) : undefined,
        inTransitBase: s.inTransitBase ?? 0,
      });
  }
  return { items, meta: pageMeta(query, total) };
}

export async function updateBatch(ctx: RequestContext, batchId: string, input: { expiryDate?: Date; mfgDate?: Date | null; sellingPriceMinor?: number; mrpMinor?: number }) {
  const batch = await findOrgDocOrThrow(ProductBatchModel, ctx, batchId, 'Batch');
  const before = { expiryDate: batch.expiryDate, mfgDate: batch.mfgDate, sellingPriceMinor: batch.sellingPriceMinor, mrpMinor: batch.mrpMinor };
  if ((input.sellingPriceMinor !== undefined || input.mrpMinor !== undefined) && !hasPermission(ctx, 'products.managePricing')) throw new ForbiddenError('You cannot change batch prices');
  if (input.expiryDate !== undefined) batch.expiryDate = input.expiryDate;
  if (input.mfgDate !== undefined) batch.mfgDate = input.mfgDate;
  if (input.sellingPriceMinor !== undefined) batch.sellingPriceMinor = input.sellingPriceMinor;
  if (input.mrpMinor !== undefined) batch.mrpMinor = input.mrpMinor;
  await batch.save();
  if (input.expiryDate !== undefined) await StockModel.updateMany({ organizationId: ctx.organizationId, batchId: batch._id }, { $set: { expiryDate: input.expiryDate } });
  await audit(ctx, { action: 'batch.updated', entityType: 'ProductBatch', entityId: batch._id, summary: `Updated batch ${batch.batchNumber}`, before, after: input });
  return toBatchStockDto(batch.toObject() as ProductBatchDoc, 0);
}

export async function blockBatch(ctx: RequestContext, batchId: string, blocked: boolean, reason: string) {
  const batch = await findOrgDocOrThrow(ProductBatchModel, ctx, batchId, 'Batch');
  batch.status = blocked ? 'blocked' : 'active';
  batch.blockReason = blocked ? reason : '';
  await batch.save();
  await audit(ctx, { action: blocked ? 'batch.blocked' : 'batch.unblocked', entityType: 'ProductBatch', entityId: batch._id, summary: `${blocked ? 'Blocked' : 'Unblocked'} batch ${batch.batchNumber}${reason ? `: ${reason}` : ''}` });
  return toBatchStockDto(batch.toObject() as ProductBatchDoc, 0);
}

/* ---------------------------------------------------------------- movements */

export async function listMovements(ctx: RequestContext, query: MovementQuery) {
  const filter = outletFilter<InventoryMovementDoc>(ctx, {
    ...(query.productId ? { productId: query.productId } : {}),
    ...(query.batchId ? { batchId: query.batchId } : {}),
    ...(query.reason ? { reason: query.reason } : {}),
    ...(query.from || query.to ? { createdAt: { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) } } : {}),
  });
  const skip = (query.page - 1) * query.pageSize;
  const [rows, total] = await Promise.all([
    InventoryMovementModel.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(query.pageSize).lean<InventoryMovementDoc[]>(),
    InventoryMovementModel.countDocuments(filter),
  ]);
  const [products, batches, who] = await Promise.all([
    ProductModel.find(trustedFilter({ _id: { $in: rows.map((r) => r.productId) } })).select('name').lean<Pick<ProductDoc, '_id' | 'name'>[]>(),
    ProductBatchModel.find(trustedFilter({ _id: { $in: rows.map((r) => r.batchId) } })).select('batchNumber').lean<Pick<ProductBatchDoc, '_id' | 'batchNumber'>[]>(),
    userMap(rows.map((r) => r.userId)),
  ]);
  const pMap = new Map(products.map((p) => [String(p._id), p.name]));
  const bMap = new Map(batches.map((b) => [String(b._id), b.batchNumber]));
  const items: MovementRow[] = rows.map((r) => ({
    id: String(r._id),
    createdAt: r.createdAt.toISOString(),
    productId: String(r.productId),
    productName: pMap.get(String(r.productId)) ?? '',
    batchId: String(r.batchId),
    batchNumber: bMap.get(String(r.batchId)) ?? '',
    qtyBaseDelta: r.qtyBaseDelta,
    balanceAfterBase: r.balanceAfterBase,
    reason: r.reason,
    refType: r.refType ?? '',
    refId: r.refId ? String(r.refId) : null,
    refNumber: r.refNumber ?? '',
    note: r.note ?? '',
    user: who(r.userId),
  }));
  return { items, meta: pageMeta(query, total) };
}

/* ---------------------------------------------------------------- opening stock */

export async function postOpeningStock(ctx: RequestContext, input: OpeningStockInput) {
  const outletId = requireOutletId(ctx);
  const productIds = [...new Set(input.lines.map((l) => l.productId))];
  const [products, units] = await Promise.all([
    ProductModel.find(orgFilter<ProductDoc>(ctx, { _id: { $in: productIds }, status: { $ne: 'archived' } })).lean<ProductDoc[]>(),
    UnitModel.find(orgFilter<UnitDoc>(ctx, {})).lean<UnitDoc[]>(),
  ]);
  if (products.length !== productIds.length) throw new NotFoundError('Product');
  const pMap = new Map(products.map((p) => [String(p._id), p]));
  const uMap = new Map(units.map((u) => [String(u._id), u]));

  return withTransaction(async (session) => {
    const { number } = await nextDocumentNumber(ctx.organizationId, outletId, 'adjustment', session);
    const refId = new Types.ObjectId();
    let lines = 0;
    for (const line of input.lines) {
      const product = pMap.get(line.productId)!;
      const factor = factorFor(product, line.unitId);
      const qtyBase = toBaseQty(line.qty, factor, uMap.get(line.unitId)?.allowsDecimal ?? false);
      if (qtyBase <= 0) continue;
      const pricingFactor = factorFor(product, String(product.pricingUnitId));
      const batch = await ensureBatch(
        ctx,
        {
          productId: product._id,
          batchNumber: line.batch.batchNumber,
          mfgDate: line.batch.mfgDate ?? null,
          expiryDate: line.batch.expiryDate,
          pricingUnitId: product.pricingUnitId,
          pricingUnitFactor: pricingFactor,
          mrpMinor: line.batch.mrpMinor,
          sellingPriceMinor: line.batch.sellingPriceMinor ?? line.batch.mrpMinor,
          purchasePriceMinor: line.batch.purchasePriceMinor,
          sourceType: 'opening',
          sourceId: refId,
        },
        session,
      );
      await applyStockChange(ctx, { outletId, productId: product._id, batchId: batch._id, qtyBaseDelta: qtyBase, reason: 'opening', refType: 'OpeningStock', refId, refNumber: number, unitCostMinor: line.batch.purchasePriceMinor, pricingUnitFactor: pricingFactor, note: input.notes }, session);
      lines += 1;
    }
    await audit(ctx, { action: 'inventory.openingStock', entityType: 'OpeningStock', entityId: refId, summary: `Posted opening stock (${lines} lines) ${number}`, metadata: { number, lines } }, session);
    return { number, lines };
  });
}

/* ---------------------------------------------------------------- adjustments */

async function adjustmentDto(ctx: RequestContext, doc: StockAdjustmentDoc): Promise<AdjustmentDto> {
  const who = await userMap([doc.requestedBy, doc.approvedBy]);
  const showCost = hasPermission(ctx, 'products.viewCost');
  return {
    id: String(doc._id),
    number: doc.number,
    outletId: String(doc.outletId),
    type: doc.type,
    reason: doc.reason,
    status: doc.status as AdjustmentDto['status'],
    lines: doc.lines.map((l) => ({
      productId: String(l.productId),
      productName: l.productName,
      batchId: String(l.batchId),
      batchNumber: l.batchNumber,
      unitId: String(l.unitId),
      unitName: l.unitName ?? '',
      qtyDelta: l.qtyDelta,
      qtyBaseDelta: l.qtyBaseDelta,
      unitCostMinor: showCost ? (l.unitCostMinor ?? 0) : 0,
      valueMinor: showCost ? (l.valueMinor ?? 0) : 0,
      note: l.note ?? '',
    })),
    totalValueMinor: showCost ? (doc.totalValueMinor ?? 0) : 0,
    notes: doc.notes ?? '',
    attachments: doc.attachments as AdjustmentDto['attachments'],
    requestedBy: who(doc.requestedBy),
    approvedBy: who(doc.approvedBy),
    approvedAt: doc.approvedAt ? doc.approvedAt.toISOString() : null,
    rejectionReason: doc.rejectionReason ?? '',
    createdAt: doc.createdAt?.toISOString?.() ?? new Date().toISOString(),
  };
}

async function applyAdjustment(ctx: RequestContext, doc: StockAdjustmentDoc, session: Parameters<typeof applyStockChange>[2]) {
  const reasonMap: Record<string, 'adjustment' | 'damage' | 'expiry' | 'lost' | 'reconciliation'> = {
    increase: 'adjustment',
    decrease: 'adjustment',
    damage: 'damage',
    expiry: 'expiry',
    lost: 'lost',
    reconciliation: 'reconciliation',
  };
  for (const line of doc.lines) {
    await applyStockChange(
      ctx,
      {
        outletId: doc.outletId,
        productId: line.productId,
        batchId: line.batchId,
        qtyBaseDelta: line.qtyBaseDelta,
        reason: reasonMap[doc.type] ?? 'adjustment',
        refType: 'StockAdjustment',
        refId: doc._id,
        refNumber: doc.number,
        unitCostMinor: line.unitCostMinor,
        pricingUnitFactor: line.pricingUnitFactor,
        note: line.note || doc.reason,
        allowNonSellable: true,
      },
      session,
    );
  }
}

export async function createAdjustment(ctx: RequestContext, input: CreateAdjustmentInput) {
  const outletId = requireOutletId(ctx);
  const productIds = [...new Set(input.lines.map((l) => l.productId))];
  const batchIds = [...new Set(input.lines.map((l) => l.batchId))];
  const [products, batches, units, org] = await Promise.all([
    ProductModel.find(orgFilter<ProductDoc>(ctx, { _id: { $in: productIds } })).lean<ProductDoc[]>(),
    ProductBatchModel.find(orgFilter<ProductBatchDoc>(ctx, { _id: { $in: batchIds } })).lean<ProductBatchDoc[]>(),
    UnitModel.find(orgFilter<UnitDoc>(ctx, {})).lean<UnitDoc[]>(),
    OrganizationModel.findById(ctx.organizationId).select('settings.inventory').lean(),
  ]);
  if (products.length !== productIds.length) throw new NotFoundError('Product');
  if (batches.length !== batchIds.length) throw new NotFoundError('Batch');
  const pMap = new Map(products.map((p) => [String(p._id), p]));
  const bMap = new Map(batches.map((b) => [String(b._id), b]));
  const uMap = new Map(units.map((u) => [String(u._id), u]));

  const lines = input.lines.map((l) => {
    const product = pMap.get(l.productId)!;
    const batch = bMap.get(l.batchId)!;
    if (String(batch.productId) !== l.productId) throw new ValidationError('Batch does not belong to product', [{ path: 'body.lines', message: `Batch ${batch.batchNumber} is not a ${product.name} batch` }]);
    const factor = factorFor(product, l.unitId);
    const qtyBaseDelta = toBaseQty(l.qtyDelta, factor, uMap.get(l.unitId)?.allowsDecimal ?? false);
    if ((input.type === 'increase' && qtyBaseDelta < 0) || (input.type !== 'increase' && input.type !== 'reconciliation' && qtyBaseDelta > 0)) {
      throw new ValidationError(`Quantities must be ${input.type === 'increase' ? 'positive' : 'negative'} for a ${input.type} adjustment`, [{ path: 'body.lines', message: 'Sign mismatch' }]);
    }
    const valueMinor = roundHalfUp((Math.abs(qtyBaseDelta) * batch.purchasePriceMinor) / batch.pricingUnitFactor);
    return {
      productId: product._id,
      productName: product.name,
      batchId: batch._id,
      batchNumber: batch.batchNumber,
      unitId: new Types.ObjectId(l.unitId),
      unitName: uMap.get(l.unitId)?.abbreviation ?? '',
      qtyDelta: l.qtyDelta,
      qtyBaseDelta,
      unitCostMinor: batch.purchasePriceMinor,
      pricingUnitFactor: batch.pricingUnitFactor,
      valueMinor,
      note: l.note ?? '',
    };
  });
  const totalValueMinor = lines.reduce((s, l) => s + l.valueMinor, 0);
  const threshold = org?.settings?.inventory?.adjustmentApprovalThresholdMinor ?? 0;
  const autoApprove = hasPermission(ctx, 'inventory.approveAdjustment') || totalValueMinor <= threshold;

  const doc = await withTransaction(async (session) => {
    const { number } = await nextDocumentNumber(ctx.organizationId, outletId, 'adjustment', session);
    const [created] = await StockAdjustmentModel.create(
      [
        {
          organizationId: ctx.organizationId,
          outletId,
          number,
          type: input.type,
          reason: input.reason,
          status: autoApprove ? 'approved' : 'pending_approval',
          lines,
          totalValueMinor,
          notes: input.notes,
          attachments: input.attachments,
          requestedBy: ctx.userId,
          approvedBy: autoApprove ? ctx.userId : null,
          approvedAt: autoApprove ? new Date() : null,
        },
      ],
      { session },
    );
    if (autoApprove) await applyAdjustment(ctx, created!.toObject() as StockAdjustmentDoc, session);
    await audit(ctx, { action: autoApprove ? 'inventory.adjustmentApplied' : 'inventory.adjustmentRequested', entityType: 'StockAdjustment', entityId: created!._id, summary: `${autoApprove ? 'Applied' : 'Requested'} stock adjustment ${number} (${input.type}, ${lines.length} lines, value ${totalValueMinor / 100})`, after: { type: input.type, reason: input.reason, totalValueMinor } }, session);
    return created!;
  });
  return adjustmentDto(ctx, doc.toObject() as StockAdjustmentDoc);
}

export async function approveAdjustment(ctx: RequestContext, id: string) {
  const doc = await StockAdjustmentModel.findOne(orgFilter<StockAdjustmentDoc>(ctx, { _id: id }));
  if (!doc) throw new NotFoundError('Adjustment');
  if (doc.status !== 'pending_approval') throw new BusinessRuleError('Only pending adjustments can be approved');
  if (String(doc.requestedBy) === String(ctx.userId) && !ctx.isOwner) throw new BusinessRuleError('You cannot approve your own adjustment');
  await withTransaction(async (session) => {
    doc.status = 'approved';
    doc.approvedBy = ctx.userId;
    doc.approvedAt = new Date();
    await doc.save({ session });
    await applyAdjustment(ctx, doc.toObject() as StockAdjustmentDoc, session);
    await audit(ctx, { action: 'inventory.adjustmentApproved', entityType: 'StockAdjustment', entityId: doc._id, summary: `Approved stock adjustment ${doc.number}` }, session);
  });
  return adjustmentDto(ctx, doc.toObject() as StockAdjustmentDoc);
}

export async function rejectAdjustment(ctx: RequestContext, id: string, reason: string) {
  const doc = await StockAdjustmentModel.findOne(orgFilter<StockAdjustmentDoc>(ctx, { _id: id }));
  if (!doc) throw new NotFoundError('Adjustment');
  if (doc.status !== 'pending_approval') throw new BusinessRuleError('Only pending adjustments can be rejected');
  doc.status = 'rejected';
  doc.rejectionReason = reason;
  doc.approvedBy = ctx.userId;
  doc.approvedAt = new Date();
  await doc.save();
  await audit(ctx, { action: 'inventory.adjustmentRejected', entityType: 'StockAdjustment', entityId: doc._id, summary: `Rejected stock adjustment ${doc.number}: ${reason}` });
  return adjustmentDto(ctx, doc.toObject() as StockAdjustmentDoc);
}

export async function listAdjustments(ctx: RequestContext, query: PaginationQuery & { status?: string; type?: string; from?: Date; to?: Date }) {
  const filter = outletFilter<StockAdjustmentDoc>(ctx, {
    ...(query.status ? { status: query.status } : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(query.from || query.to ? { createdAt: { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) } } : {}),
  });
  const skip = (query.page - 1) * query.pageSize;
  const [docs, total] = await Promise.all([
    StockAdjustmentModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.pageSize).lean<StockAdjustmentDoc[]>(),
    StockAdjustmentModel.countDocuments(filter),
  ]);
  const items = await Promise.all(docs.map((d) => adjustmentDto(ctx, d)));
  return { items, meta: pageMeta(query, total) };
}

export async function getAdjustment(ctx: RequestContext, id: string) {
  const doc = await StockAdjustmentModel.findOne(orgFilter<StockAdjustmentDoc>(ctx, { _id: id })).lean<StockAdjustmentDoc>();
  if (!doc) throw new NotFoundError('Adjustment');
  return adjustmentDto(ctx, doc);
}

/* ---------------------------------------------------------------- expiry */

export async function expirySummary(ctx: RequestContext): Promise<ExpirySummary> {
  const outletId = requireOutletId(ctx);
  const org = await OrganizationModel.findById(ctx.organizationId).select('settings.inventory').lean();
  const days = [...(org?.settings?.inventory?.expiryWarningDays ?? [30, 60, 90])].sort((a, b) => a - b);
  const today = startOfToday();
  const canValue = hasPermission(ctx, 'inventory.viewValuation');
  const stocks = await StockModel.find(trustedFilter({ organizationId: ctx.organizationId, outletId, qtyBase: { $gt: 0 } })).lean<StockDoc[]>();
  const batches = canValue && stocks.length ? await ProductBatchModel.find(trustedFilter({ _id: { $in: stocks.map((s) => s.batchId) } })).lean<ProductBatchDoc[]>() : [];
  const bMap = new Map(batches.map((b) => [String(b._id), b]));
  const value = (s: StockDoc) => {
    const b = bMap.get(String(s.batchId));
    return b ? roundHalfUp((s.qtyBase * b.purchasePriceMinor) / b.pricingUnitFactor) : 0;
  };
  const expired = { batches: 0, qtyBase: 0, valueMinor: canValue ? 0 : undefined };
  const buckets = days.map((d) => ({ days: d, batches: 0, qtyBase: 0, valueMinor: canValue ? 0 : undefined }));
  for (const s of stocks) {
    const dte = daysBetween(today, s.expiryDate);
    if (s.expiryDate < today) {
      expired.batches += 1;
      expired.qtyBase += s.qtyBase;
      if (canValue) expired.valueMinor! += value(s);
      continue;
    }
    for (const b of buckets) {
      if (dte <= b.days) {
        b.batches += 1;
        b.qtyBase += s.qtyBase;
        if (canValue) b.valueMinor! += value(s);
      }
    }
  }
  return { expired, buckets };
}

/* ---------------------------------------------------------------- write-off helper (expired/damaged) */

export async function writeOffBatch(ctx: RequestContext, batchId: string, qtyBase: number, kind: 'expiry' | 'damage', note: string) {
  const outletId = requireOutletId(ctx);
  const batch = await findOrgDocOrThrow(ProductBatchModel, ctx, batchId, 'Batch');
  const product = await ProductModel.findById(batch.productId).lean<ProductDoc>();
  if (!product) throw new NotFoundError('Product');
  return createAdjustment(ctx, {
    type: kind,
    reason: kind === 'expiry' ? 'expired' : 'damaged',
    lines: [{ productId: String(product._id), batchId: String(batch._id), unitId: String(product.baseUnitId), qtyDelta: -qtyBase, note }],
    notes: note,
    attachments: [],
  }).then((r) => ({ ...r, outletId: String(outletId) }));
}
