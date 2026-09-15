import { Types } from 'mongoose';
import type { DashboardSummary } from '@pharmaos/shared';
import { SaleModel } from '@/models/sale.model';
import { SalesReturnModel } from '@/models/sales-return.model';
import { PurchaseModel } from '@/models/purchase.model';
import { PartyPaymentModel } from '@/models/party-payment.model';
import { StockModel } from '@/models/stock.model';
import { ProductBatchModel } from '@/models/product-batch.model';
import { ProductModel } from '@/models/product.model';
import { CustomerModel } from '@/models/customer.model';
import { SupplierModel } from '@/models/supplier.model';
import { OutletModel } from '@/models/outlet.model';
import { AuditLogModel } from '@/models/audit-log.model';
import { UserModel } from '@/models/user.model';
import { StockAdjustmentModel } from '@/models/stock-adjustment.model';
import { StockTransferModel } from '@/models/stock-transfer.model';
import { OrganizationModel } from '@/models/organization.model';
import type { RequestContext } from '@/lib/context';
import { hasPermission, canAccessOutlet } from '@/lib/context';
import { trustedFilter } from '@/lib/scoped';
import { ForbiddenError, ValidationError } from '@/lib/errors';
import { startOfToday } from '@/modules/inventory/stock.service';

export async function dashboardSummary(ctx: RequestContext, q: { from?: Date; to?: Date; outletId?: string }): Promise<DashboardSummary> {
  const org = ctx.organizationId;
  let outletId: Types.ObjectId | null = null;
  if (q.outletId) {
    if (!canAccessOutlet(ctx, q.outletId)) throw new ForbiddenError('You do not have access to that outlet');
    outletId = new Types.ObjectId(q.outletId);
  } else if (ctx.outletAccess !== null) {
    if (!ctx.outletId) throw new ValidationError('Select an outlet first');
    outletId = ctx.outletId;
  }
  const om = outletId ? { outletId } : {};
  const today = startOfToday();
  const to = q.to ?? new Date();
  const from = q.from ?? new Date(today.getTime() - 29 * 86_400_000);
  const spanMs = to.getTime() - from.getTime();
  const prevFrom = new Date(from.getTime() - spanMs - 1);
  const prevTo = new Date(from.getTime() - 1);
  const showProfit = hasPermission(ctx, 'dashboard.viewProfit') || hasPermission(ctx, 'reports.viewProfit');
  const showValuation = hasPermission(ctx, 'inventory.viewValuation');
  const orgDoc = await OrganizationModel.findById(org).select('settings.inventory').lean();
  const warnDays = Math.min(...(orgDoc?.settings?.inventory?.expiryWarningDays ?? [30]));
  const nearDate = new Date(today.getTime() + warnDays * 86_400_000);

  const salesAgg = (f: Date, t: Date) =>
    SaleModel.aggregate<{ revenue: number; invoices: number; tax: number; discount: number; cost: number; taxable: number }>([
      { $match: { organizationId: org, ...om, status: 'completed', completedAt: { $gte: f, $lte: t } } },
      { $group: { _id: null, revenue: { $sum: '$totals.grandTotalMinor' }, invoices: { $sum: 1 }, tax: { $sum: '$totals.taxMinor' }, discount: { $sum: { $add: ['$totals.itemDiscountMinor', '$totals.billDiscountMinor'] } }, cost: { $sum: { $sum: '$lines.costMinor' } }, taxable: { $sum: '$totals.taxableMinor' } } },
    ]);
  const purchaseAgg = (f: Date, t: Date) =>
    PurchaseModel.aggregate<{ value: number; invoices: number }>([{ $match: { organizationId: org, ...om, status: { $ne: 'cancelled' }, invoiceDate: { $gte: f, $lte: t } } }, { $group: { _id: null, value: { $sum: '$totals.grandTotalMinor' }, invoices: { $sum: 1 } } }]);

  const [[cur], [prev], [pcur], [pprev], [ret], [todaySales], [todayReceipts], trendSales, trendPurchases, paymentMix, topProducts, outletRows, [recv], [pay], stockAgg, lowProducts, activity, pendingAdj, incomingTransfers] = await Promise.all([
    salesAgg(from, to),
    salesAgg(prevFrom, prevTo),
    purchaseAgg(from, to),
    purchaseAgg(prevFrom, prevTo),
    SalesReturnModel.aggregate<{ value: number }>([{ $match: { organizationId: org, ...om, status: 'completed', createdAt: { $gte: from, $lte: to } } }, { $group: { _id: null, value: { $sum: '$totals.grandTotalMinor' } } }]),
    salesAgg(today, new Date()),
    PartyPaymentModel.aggregate<{ amount: number }>([{ $match: { organizationId: org, ...om, partyType: 'customer', status: 'completed', date: { $gte: today } } }, { $group: { _id: null, amount: { $sum: '$amountMinor' } } }]),
    SaleModel.aggregate<{ _id: string; revenue: number; invoices: number }>([{ $match: { organizationId: org, ...om, status: 'completed', completedAt: { $gte: from, $lte: to } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$completedAt', timezone: 'Asia/Kolkata' } }, revenue: { $sum: '$totals.grandTotalMinor' }, invoices: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    PurchaseModel.aggregate<{ _id: string; value: number }>([{ $match: { organizationId: org, ...om, status: { $ne: 'cancelled' }, invoiceDate: { $gte: from, $lte: to } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$invoiceDate', timezone: 'Asia/Kolkata' } }, value: { $sum: '$totals.grandTotalMinor' } } }]),
    SaleModel.aggregate<{ _id: string; amount: number }>([{ $match: { organizationId: org, ...om, status: 'completed', completedAt: { $gte: from, $lte: to } } }, { $unwind: '$payments' }, { $group: { _id: '$payments.method', amount: { $sum: '$payments.amountMinor' } } }, { $sort: { amount: -1 } }]),
    SaleModel.aggregate<{ _id: Types.ObjectId; name: string; qtyBase: number; revenue: number }>([{ $match: { organizationId: org, ...om, status: 'completed', completedAt: { $gte: from, $lte: to } } }, { $unwind: '$lines' }, { $group: { _id: '$lines.productId', name: { $first: '$lines.productName' }, qtyBase: { $sum: '$lines.qtyBase' }, revenue: { $sum: '$lines.totalMinor' } } }, { $sort: { revenue: -1 } }, { $limit: 8 }]),
    outletId ? Promise.resolve([]) : SaleModel.aggregate<{ _id: Types.ObjectId; revenue: number; invoices: number }>([{ $match: { organizationId: org, status: 'completed', completedAt: { $gte: from, $lte: to } } }, { $group: { _id: '$outletId', revenue: { $sum: '$totals.grandTotalMinor' }, invoices: { $sum: 1 } } }, { $sort: { revenue: -1 } }]),
    SaleModel.aggregate<{ total: number; overdue: number; customers: Types.ObjectId[] }>([{ $match: { organizationId: org, ...om, status: 'completed', balanceMinor: { $gt: 0 } } }, { $group: { _id: null, total: { $sum: '$balanceMinor' }, overdue: { $sum: { $cond: [{ $lt: ['$dueDate', new Date()] }, '$balanceMinor', 0] } }, customers: { $addToSet: '$customerId' } } }]),
    PurchaseModel.aggregate<{ total: number; overdue: number; suppliers: Types.ObjectId[] }>([{ $match: { organizationId: org, ...om, status: { $ne: 'cancelled' }, balanceMinor: { $gt: 0 } } }, { $group: { _id: null, total: { $sum: '$balanceMinor' }, overdue: { $sum: { $cond: [{ $lt: ['$dueDate', new Date()] }, '$balanceMinor', 0] } }, suppliers: { $addToSet: '$supplierId' } } }]),
    StockModel.aggregate<{ _id: Types.ObjectId; onHand: number; expired: number; near: number; batchIds: Types.ObjectId[] }>([{ $match: { organizationId: org, ...om, qtyBase: { $gt: 0 } } }, { $group: { _id: '$productId', onHand: { $sum: '$qtyBase' }, expired: { $sum: { $cond: [{ $lt: ['$expiryDate', today] }, '$qtyBase', 0] } }, near: { $sum: { $cond: [{ $and: [{ $gte: ['$expiryDate', today] }, { $lte: ['$expiryDate', nearDate] }] }, '$qtyBase', 0] } }, batchIds: { $push: '$batchId' } } }]),
    ProductModel.find(trustedFilter({ organizationId: org, status: 'active', 'stockRules.reorderLevelBase': { $gt: 0 } })).select('stockRules').lean(),
    AuditLogModel.find(trustedFilter({ organizationId: org, ...(outletId ? { $or: [{ outletId }, { outletId: null }] } : {}) })).sort({ createdAt: -1 }).limit(8).lean(),
    hasPermission(ctx, 'inventory.approveAdjustment') ? StockAdjustmentModel.countDocuments({ organizationId: org, ...om, status: 'pending_approval' }) : Promise.resolve(0),
    outletId ? StockTransferModel.countDocuments({ organizationId: org, toOutletId: outletId, status: 'dispatched' }) : Promise.resolve(0),
  ]);

  const stockMap = new Map(stockAgg.map((s) => [String(s._id), s]));
  const lowStock = lowProducts.filter((p) => { const s = stockMap.get(String(p._id)); const sellable = (s?.onHand ?? 0) - (s?.expired ?? 0); return sellable <= (p.stockRules?.reorderLevelBase ?? 0); }).length;
  const expiredUnits = stockAgg.reduce((a, s) => a + s.expired, 0);
  const nearUnits = stockAgg.reduce((a, s) => a + s.near, 0);
  let valuationCostMinor: number | undefined;
  if (showValuation) {
    const stocks = await StockModel.find(trustedFilter({ organizationId: org, ...om, qtyBase: { $gt: 0 } })).select('batchId qtyBase').lean();
    const batches = await ProductBatchModel.find(trustedFilter({ _id: { $in: stocks.map((s) => s.batchId) } })).select('purchasePriceMinor pricingUnitFactor').lean();
    const bMap = new Map(batches.map((b) => [String(b._id), b]));
    valuationCostMinor = stocks.reduce((a, s) => { const b = bMap.get(String(s.batchId)); return a + (b ? Math.round((s.qtyBase * b.purchasePriceMinor) / b.pricingUnitFactor) : 0); }, 0);
  }

  const purchaseByDay = new Map(trendPurchases.map((p) => [p._id, p.value]));
  const trend: DashboardSummary['trend'] = [];
  for (let d = new Date(from); d <= to; d = new Date(d.getTime() + 86_400_000)) {
    const key = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const s = trendSales.find((x) => x._id === key);
    trend.push({ date: key, revenueMinor: s?.revenue ?? 0, invoices: s?.invoices ?? 0, purchasesMinor: purchaseByDay.get(key) ?? 0 });
    if (trend.length > 366) break;
  }

  const outletNames = outletRows.length ? await OutletModel.find(trustedFilter({ _id: { $in: outletRows.map((o) => o._id) } })).select('name').lean() : [];
  const oMap = new Map(outletNames.map((o) => [String(o._id), o.name]));
  const userNames = await UserModel.find(trustedFilter({ _id: { $in: activity.map((a) => a.userId).filter(Boolean) } })).select('name').lean();
  const uMap = new Map(userNames.map((u) => [String(u._id), u.name]));

  const [customersCount, suppliersCount] = await Promise.all([Promise.resolve(recv?.customers?.filter(Boolean).length ?? 0), Promise.resolve(pay?.suppliers?.length ?? 0)]);
  void CustomerModel;
  void SupplierModel;

  const alerts: DashboardSummary['alerts'] = [];
  if (lowStock) alerts.push({ type: 'lowStock', severity: 'warning', title: 'Products below reorder level', count: lowStock, href: '/inventory/low-stock' });
  if (expiredUnits) alerts.push({ type: 'expired', severity: 'danger', title: 'Expired units in stock', count: expiredUnits, href: '/inventory/expiry' });
  if (nearUnits) alerts.push({ type: 'nearExpiry', severity: 'warning', title: `Units expiring within ${warnDays} days`, count: nearUnits, href: '/inventory/expiry' });
  if (recv?.overdue) alerts.push({ type: 'overdue', severity: 'danger', title: 'Overdue customer credit', count: Math.round(recv.overdue / 100), href: '/sales/payments' });
  if (pay?.overdue) alerts.push({ type: 'payablesOverdue', severity: 'warning', title: 'Overdue supplier payments', count: Math.round(pay.overdue / 100), href: '/purchases/payments' });
  if (pendingAdj) alerts.push({ type: 'pendingAdjustments', severity: 'info', title: 'Stock adjustments awaiting approval', count: pendingAdj, href: '/inventory/adjustments' });
  if (incomingTransfers) alerts.push({ type: 'incomingTransfers', severity: 'info', title: 'Transfers to receive', count: incomingTransfers, href: '/inventory/transfers' });

  return {
    period: { from: from.toISOString(), to: to.toISOString() },
    sales: { revenueMinor: cur?.revenue ?? 0, invoices: cur?.invoices ?? 0, averageBillMinor: cur?.invoices ? Math.round(cur.revenue / cur.invoices) : 0, taxMinor: cur?.tax ?? 0, discountMinor: cur?.discount ?? 0, returnsMinor: ret?.value ?? 0, previousRevenueMinor: prev?.revenue ?? 0 },
    purchases: { valueMinor: pcur?.value ?? 0, invoices: pcur?.invoices ?? 0, previousValueMinor: pprev?.value ?? 0 },
    profit: showProfit ? { grossProfitMinor: (cur?.taxable ?? 0) - (cur?.cost ?? 0), marginBps: cur?.taxable ? Math.round((((cur.taxable - cur.cost) / cur.taxable) * 10_000)) : 0 } : undefined,
    receivables: { outstandingMinor: recv?.total ?? 0, overdueMinor: recv?.overdue ?? 0, customers: customersCount },
    payables: { outstandingMinor: pay?.total ?? 0, overdueMinor: pay?.overdue ?? 0, suppliers: suppliersCount },
    inventory: { lowStock, expired: expiredUnits, nearExpiry: nearUnits, valuationCostMinor, products: stockAgg.length },
    today: { revenueMinor: todaySales?.revenue ?? 0, invoices: todaySales?.invoices ?? 0, collectionsMinor: (todaySales?.revenue ?? 0) + (todayReceipts?.amount ?? 0) },
    trend,
    paymentMix: paymentMix.map((p) => ({ method: p._id, amountMinor: p.amount })),
    topProducts: topProducts.map((p) => ({ productId: String(p._id), name: p.name, qtyBase: p.qtyBase, revenueMinor: p.revenue })),
    outlets: outletRows.map((o) => ({ outletId: String(o._id), name: oMap.get(String(o._id)) ?? '', revenueMinor: o.revenue, invoices: o.invoices })),
    recentActivity: activity.map((a) => ({ id: String(a._id), action: a.action, summary: a.summary, user: a.userId ? (uMap.get(String(a.userId)) ?? '') : 'System', at: a.createdAt.toISOString() })),
    alerts,
  };
}
