import { Types } from 'mongoose';
import { formatMoney } from '@pharmaos/shared';
import { OrganizationModel } from '@/models/organization.model';
import { OutletModel, type OutletDoc } from '@/models/outlet.model';
import { ProductModel, type ProductDoc } from '@/models/product.model';
import { StockModel } from '@/models/stock.model';
import { ProductBatchModel, type ProductBatchDoc } from '@/models/product-batch.model';
import { SaleModel, type SaleDoc } from '@/models/sale.model';
import { PurchaseModel, type PurchaseDoc } from '@/models/purchase.model';
import { StockAdjustmentModel } from '@/models/stock-adjustment.model';
import { events } from '@/lib/events';
import { logger } from '@/lib/logger';
import { trustedFilter } from '@/lib/scoped';
import { isTest } from '@/config/env';
import { notify, resolveAlert, thresholdFor } from './notifications.service';
import { startOfToday } from '@/modules/inventory/stock.service';

/* ---------------------------------------------------------------- scans (per organization) */

async function scanStock(orgId: Types.ObjectId): Promise<number> {
  let created = 0;
  const outlets = await OutletModel.find(trustedFilter({ organizationId: orgId, status: { $ne: 'archived' } })).lean<OutletDoc[]>();
  const products = await ProductModel.find(trustedFilter({ organizationId: orgId, status: 'active', 'stockRules.reorderLevelBase': { $gt: 0 } })).select('name stockRules').lean<ProductDoc[]>();
  if (!products.length) return 0;
  const today = startOfToday();
  for (const outlet of outlets) {
    const agg = await StockModel.aggregate<{ _id: Types.ObjectId; sellable: number }>([
      { $match: { organizationId: orgId, outletId: outlet._id, productId: { $in: products.map((p) => p._id) }, expiryDate: { $gte: today } } },
      { $group: { _id: '$productId', sellable: { $sum: '$qtyBase' } } },
    ]);
    const sellable = new Map(agg.map((a) => [String(a._id), a.sellable]));
    for (const p of products) {
      const qty = sellable.get(String(p._id)) ?? 0;
      const level = p.stockRules?.reorderLevelBase ?? 0;
      const keyLow = `stock.low:${outlet._id}:${p._id}`;
      const keyOut = `stock.critical:${outlet._id}:${p._id}`;
      if (qty <= 0) {
        await resolveAlert(orgId, keyLow);
        if (await notify({ organizationId: orgId, outletId: outlet._id, type: 'stock.critical', title: `Out of stock: ${p.name}`, body: `${outlet.name} has no sellable stock. Reorder level is ${level}.`, entityType: 'Product', entityId: p._id, href: `/inventory/products/${p._id}`, dedupeKey: keyOut })) created += 1;
      } else if (qty <= level) {
        await resolveAlert(orgId, keyOut);
        if (await notify({ organizationId: orgId, outletId: outlet._id, type: 'stock.low', title: `Low stock: ${p.name}`, body: `${outlet.name} has ${qty} base unit(s) left (reorder at ${level}).`, entityType: 'Product', entityId: p._id, href: `/inventory/products/${p._id}`, dedupeKey: keyLow })) created += 1;
      } else {
        await resolveAlert(orgId, keyLow);
        await resolveAlert(orgId, keyOut);
      }
    }
  }
  return created;
}

async function scanExpiry(orgId: Types.ObjectId): Promise<number> {
  let created = 0;
  const today = startOfToday();
  const days = await thresholdFor(orgId, 'stock.expiringSoon');
  const soon = new Date(today.getTime() + days * 86_400_000);
  const stocks = await StockModel.find(trustedFilter({ organizationId: orgId, qtyBase: { $gt: 0 }, expiryDate: { $lte: soon } })).lean();
  if (!stocks.length) return 0;
  const [batches, outlets] = await Promise.all([
    ProductBatchModel.find(trustedFilter({ _id: { $in: stocks.map((s) => s.batchId) } })).select('batchNumber productId expiryDate').lean<ProductBatchDoc[]>(),
    OutletModel.find({ organizationId: orgId }).select('name').lean<OutletDoc[]>(),
  ]);
  const products = await ProductModel.find(trustedFilter({ _id: { $in: batches.map((b) => b.productId) } })).select('name').lean<ProductDoc[]>();
  const bMap = new Map(batches.map((b) => [String(b._id), b]));
  const pMap = new Map(products.map((p) => [String(p._id), p.name]));
  const oMap = new Map(outlets.map((o) => [String(o._id), o.name]));
  for (const s of stocks) {
    const b = bMap.get(String(s.batchId));
    if (!b) continue;
    const name = pMap.get(String(b.productId)) ?? 'Product';
    const expired = s.expiryDate < today;
    const key = `${expired ? 'stock.expired' : 'stock.expiringSoon'}:${s.outletId}:${s.batchId}`;
    if (expired) await resolveAlert(orgId, `stock.expiringSoon:${s.outletId}:${s.batchId}`);
    const daysLeft = Math.ceil((s.expiryDate.getTime() - today.getTime()) / 86_400_000);
    if (await notify({ organizationId: orgId, outletId: s.outletId, type: expired ? 'stock.expired' : 'stock.expiringSoon', title: expired ? `Expired: ${name} (${b.batchNumber})` : `Expiring in ${daysLeft} day(s): ${name} (${b.batchNumber})`, body: `${s.qtyBase} base unit(s) at ${oMap.get(String(s.outletId)) ?? 'outlet'}. ${expired ? 'Write off or return to supplier.' : 'Consider a supplier return or promotion.'}`, entityType: 'ProductBatch', entityId: b._id, href: `/inventory/expiry`, dedupeKey: key })) created += 1;
  }
  return created;
}

async function scanCredit(orgId: Types.ObjectId): Promise<number> {
  let created = 0;
  const now = new Date();
  const dueSoonDays = await thresholdFor(orgId, 'credit.dueSoon');
  const overdueDays = await thresholdFor(orgId, 'credit.overdue');
  const soon = new Date(now.getTime() + dueSoonDays * 86_400_000);
  const overdueBefore = new Date(now.getTime() - overdueDays * 86_400_000);
  const open = await SaleModel.find(trustedFilter({ organizationId: orgId, status: 'completed', balanceMinor: { $gt: 0 }, dueDate: { $lte: soon } })).select('number customerSnapshot balanceMinor dueDate outletId customerId').lean<SaleDoc[]>();
  for (const s of open) {
    if (!s.dueDate) continue;
    const overdue = s.dueDate <= overdueBefore;
    if (overdue) await resolveAlert(orgId, `credit.dueSoon:${s._id}`);
    if (await notify({ organizationId: orgId, outletId: s.outletId, type: overdue ? 'credit.overdue' : 'credit.dueSoon', title: `${overdue ? 'Overdue' : 'Due soon'}: ${s.customerSnapshot?.name ?? 'Customer'} ${formatMoney(s.balanceMinor ?? 0)}`, body: `Invoice ${s.number} ${overdue ? 'was due' : 'is due'} on ${s.dueDate.toLocaleDateString('en-IN')}.`, entityType: 'Sale', entityId: s._id, href: s.customerId ? `/customers/${s.customerId}` : `/sales/invoices/${s._id}`, dedupeKey: `${overdue ? 'credit.overdue' : 'credit.dueSoon'}:${s._id}` })) created += 1;
  }
  return created;
}

async function scanPayables(orgId: Types.ObjectId): Promise<number> {
  let created = 0;
  const days = await thresholdFor(orgId, 'payable.due');
  const soon = new Date(Date.now() + days * 86_400_000);
  const open = await PurchaseModel.find(trustedFilter({ organizationId: orgId, status: { $ne: 'cancelled' }, balanceMinor: { $gt: 0 }, dueDate: { $lte: soon } })).select('number supplierSnapshot balanceMinor dueDate outletId supplierId').lean<PurchaseDoc[]>();
  for (const p of open) {
    if (await notify({ organizationId: orgId, outletId: p.outletId, type: 'payable.due', title: `Supplier payment due: ${p.supplierSnapshot?.name ?? 'Supplier'} ${formatMoney(p.balanceMinor ?? 0)}`, body: `Purchase ${p.number} is due on ${p.dueDate?.toLocaleDateString('en-IN') ?? ''}.`, entityType: 'Purchase', entityId: p._id, href: `/purchases/${p._id}`, dedupeKey: `payable.due:${p._id}` })) created += 1;
  }
  return created;
}

async function scanPendingGrn(orgId: Types.ObjectId): Promise<number> {
  let created = 0;
  const days = await thresholdFor(orgId, 'purchase.pendingGrn');
  const before = new Date(Date.now() - days * 86_400_000);
  const pending = await PurchaseModel.find(trustedFilter({ organizationId: orgId, status: { $in: ['confirmed', 'partially_received'] }, invoiceDate: { $lte: before } })).select('number supplierSnapshot outletId').lean<PurchaseDoc[]>();
  for (const p of pending) {
    if (await notify({ organizationId: orgId, outletId: p.outletId, type: 'purchase.pendingGrn', title: `Purchase ${p.number} not fully received`, body: `${p.supplierSnapshot?.name ?? 'Supplier'} invoice is older than ${days} day(s) and stock has not been fully received.`, entityType: 'Purchase', entityId: p._id, href: `/purchases/${p._id}`, dedupeKey: `purchase.pendingGrn:${p._id}` })) created += 1;
  }
  return created;
}

async function scanLicences(orgId: Types.ObjectId): Promise<number> {
  let created = 0;
  const days = await thresholdFor(orgId, 'licence.expiring');
  const soon = new Date(Date.now() + days * 86_400_000);
  const outlets = await OutletModel.find(trustedFilter({ organizationId: orgId, status: { $ne: 'archived' }, drugLicenseExpiry: { $lte: soon, $ne: null } })).lean<OutletDoc[]>();
  for (const o of outlets) {
    if (await notify({ organizationId: orgId, outletId: o._id, type: 'licence.expiring', title: `Drug licence expiring: ${o.name}`, body: `Licence ${o.drugLicenseNo || ''} expires on ${o.drugLicenseExpiry?.toLocaleDateString('en-IN') ?? ''}.`, entityType: 'Outlet', entityId: o._id, href: `/settings/outlets`, dedupeKey: `licence.expiring:${o._id}:${o.drugLicenseExpiry?.toISOString().slice(0, 10)}` })) created += 1;
  }
  return created;
}

async function scanAdjustments(orgId: Types.ObjectId): Promise<number> {
  let created = 0;
  const pending = await StockAdjustmentModel.find({ organizationId: orgId, status: 'pending_approval' }).select('number outletId totalValueMinor').lean();
  for (const a of pending) {
    if (await notify({ organizationId: orgId, outletId: a.outletId, type: 'adjustment.pendingApproval', title: `Stock adjustment ${a.number} awaits approval`, body: `Value ${formatMoney(a.totalValueMinor ?? 0)}.`, entityType: 'StockAdjustment', entityId: a._id, href: `/inventory/adjustments/${a._id}`, dedupeKey: `adjustment.pendingApproval:${a._id}` })) created += 1;
  }
  return created;
}

export async function runAllScans(orgId: Types.ObjectId): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const [name, fn] of Object.entries({ stock: scanStock, expiry: scanExpiry, credit: scanCredit, payables: scanPayables, pendingGrn: scanPendingGrn, licences: scanLicences, adjustments: scanAdjustments })) {
    try {
      out[name] = await fn(orgId);
    } catch (err) {
      logger.warn({ err, orgId, scan: name }, 'notification scan failed');
      out[name] = -1;
    }
  }
  return out;
}

/* ---------------------------------------------------------------- scheduler */

let timer: NodeJS.Timeout | null = null;

/** In-process scheduler: nightly-style scans every `intervalMs` for every active organization. Designed to move to a worker. */
export function startNotificationScheduler(intervalMs = 6 * 60 * 60 * 1000): void {
  if (timer || isTest) return;
  const tick = async () => {
    const orgs = await OrganizationModel.find({ status: 'active' }).select('_id').lean();
    for (const o of orgs) await runAllScans(o._id);
  };
  timer = setInterval(() => void tick().catch((err) => logger.error({ err }, 'scheduler tick failed')), intervalMs);
  timer.unref();
  setTimeout(() => void tick().catch(() => undefined), 30_000).unref();
  logger.info({ intervalMs }, 'notification scheduler started');
}

export function stopNotificationScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

/* ---------------------------------------------------------------- event-driven notifications */

export function registerNotificationEventHandlers(): void {
  events.on('sale.completed', async ({ organizationId, outletId, saleId }) => {
    // Re-check stock levels for the products just sold so low-stock alerts are immediate.
    const sale = await SaleModel.findById(saleId).select('lines.productId').lean<SaleDoc>();
    if (!sale) return;
    const productIds = [...new Set(sale.lines.map((l) => String(l.productId)))].map((id) => new Types.ObjectId(id));
    const products = await ProductModel.find(trustedFilter({ _id: { $in: productIds }, 'stockRules.reorderLevelBase': { $gt: 0 } })).select('name stockRules').lean<ProductDoc[]>();
    if (!products.length) return;
    const today = startOfToday();
    const outlet = await OutletModel.findById(outletId).select('name').lean<OutletDoc>();
    for (const p of products) {
      const agg = await StockModel.aggregate<{ q: number }>([{ $match: { organizationId, outletId, productId: p._id, expiryDate: { $gte: today } } }, { $group: { _id: null, q: { $sum: '$qtyBase' } } }]);
      const qty = agg[0]?.q ?? 0;
      const level = p.stockRules?.reorderLevelBase ?? 0;
      if (qty <= 0) await notify({ organizationId, outletId, type: 'stock.critical', title: `Out of stock: ${p.name}`, body: `${outlet?.name ?? 'Outlet'} has no sellable stock left after the last sale.`, entityType: 'Product', entityId: p._id, href: `/inventory/products/${p._id}`, dedupeKey: `stock.critical:${outletId}:${p._id}` });
      else if (qty <= level) await notify({ organizationId, outletId, type: 'stock.low', title: `Low stock: ${p.name}`, body: `${outlet?.name ?? 'Outlet'} has ${qty} base unit(s) left (reorder at ${level}).`, entityType: 'Product', entityId: p._id, href: `/inventory/products/${p._id}`, dedupeKey: `stock.low:${outletId}:${p._id}` });
    }
  });
}
