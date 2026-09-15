import { Types } from 'mongoose';
import { REPORT_CATALOGUE, type ReportKey, type ReportQuery, type ReportResult, type ReportColumn } from '@pharmaos/shared';
import { SaleModel } from '@/models/sale.model';
import { SalesReturnModel } from '@/models/sales-return.model';
import { PurchaseModel } from '@/models/purchase.model';
import { PurchaseReturnModel } from '@/models/purchase-return.model';
import { PartyPaymentModel } from '@/models/party-payment.model';
import { StockModel } from '@/models/stock.model';
import { ProductBatchModel } from '@/models/product-batch.model';
import { InventoryMovementModel } from '@/models/inventory-movement.model';
import { ProductModel } from '@/models/product.model';
import { CategoryModel } from '@/models/category.model';
import { CustomerModel } from '@/models/customer.model';
import { SupplierModel } from '@/models/supplier.model';
import { OutletModel } from '@/models/outlet.model';
import { UserModel } from '@/models/user.model';
import { AuditLogModel } from '@/models/audit-log.model';
import { OrganizationModel } from '@/models/organization.model';
import type { RequestContext } from '@/lib/context';
import { hasPermission, canAccessOutlet } from '@/lib/context';
import { trustedFilter } from '@/lib/scoped';
import { ForbiddenError, ValidationError } from '@/lib/errors';
import { startOfToday } from '@/modules/inventory/stock.service';

type Row = Record<string, string | number | null | undefined>;

interface Scope {
  org: Types.ObjectId;
  outletId: Types.ObjectId | null;
  from: Date;
  to: Date;
  showCost: boolean;
}

const money: ReportColumn['format'] = 'money';
const num: ReportColumn['format'] = 'number';

function scopeFor(ctx: RequestContext, q: ReportQuery): Scope {
  let outletId: Types.ObjectId | null = null;
  if (q.outletId) {
    if (!canAccessOutlet(ctx, q.outletId)) throw new ForbiddenError('You do not have access to that outlet');
    outletId = new Types.ObjectId(q.outletId);
  } else if (ctx.outletAccess !== null) {
    // Restricted members only see their active outlet.
    if (!ctx.outletId) throw new ValidationError('Select an outlet first');
    outletId = ctx.outletId;
  }
  const to = q.to ?? new Date();
  const from = q.from ?? new Date(startOfToday().getTime() - 29 * 86_400_000);
  return { org: ctx.organizationId, outletId, from, to, showCost: hasPermission(ctx, 'products.viewCost') };
}

const outletMatch = (s: Scope) => (s.outletId ? { outletId: s.outletId } : {});
const dateMatch = (field: string, s: Scope) => ({ [field]: { $gte: s.from, $lte: s.to } });
const dayKey = (field: string) => ({ $dateToString: { format: '%Y-%m-%d', date: field, timezone: 'Asia/Kolkata' } });

async function names<T extends { _id: Types.ObjectId; name: string }>(Model: { find: (f: unknown) => { select: (s: string) => { lean: <U>() => Promise<U> } } }, ids: (Types.ObjectId | string | null | undefined)[]) {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  if (!unique.length) return new Map<string, string>();
  const docs = await Model.find(trustedFilter({ _id: { $in: unique } })).select('name').lean<T[]>();
  return new Map(docs.map((d) => [String(d._id), d.name]));
}

/* ---------------------------------------------------------------- sales */

async function salesSummary(s: Scope): Promise<{ columns: ReportColumn[]; rows: Row[] }> {
  const [agg] = await SaleModel.aggregate<{ invoices: number; revenue: number; taxable: number; tax: number; discount: number; cost: number; cash: number; credit: number; cancelled: number }>([
    { $match: { organizationId: s.org, ...outletMatch(s), status: { $in: ['completed', 'cancelled'] }, ...dateMatch('completedAt', s) } },
    {
      $group: {
        _id: null,
        invoices: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
        revenue: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, '$totals.grandTotalMinor', 0] } },
        taxable: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, '$totals.taxableMinor', 0] } },
        tax: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, '$totals.taxMinor', 0] } },
        discount: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, { $add: ['$totals.itemDiscountMinor', '$totals.billDiscountMinor'] }, 0] } },
        cost: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, { $sum: '$lines.costMinor' }, 0] } },
        cash: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, '$paidMinor', 0] } },
        credit: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, '$creditMinor', 0] } },
      },
    },
  ]);
  const [ret] = await SalesReturnModel.aggregate<{ value: number; count: number }>([{ $match: { organizationId: s.org, ...outletMatch(s), status: 'completed', ...dateMatch('createdAt', s) } }, { $group: { _id: null, value: { $sum: '$totals.grandTotalMinor' }, count: { $sum: 1 } } }]);
  const a = agg ?? { invoices: 0, revenue: 0, taxable: 0, tax: 0, discount: 0, cost: 0, cash: 0, credit: 0, cancelled: 0 };
  const rows: Row[] = [
    { metric: 'Invoices', value: a.invoices },
    { metric: 'Cancelled invoices', value: a.cancelled },
    { metric: 'Gross revenue', value: a.revenue },
    { metric: 'Sales returns', value: -(ret?.value ?? 0) },
    { metric: 'Net revenue', value: a.revenue - (ret?.value ?? 0) },
    { metric: 'Taxable value', value: a.taxable },
    { metric: 'GST collected', value: a.tax },
    { metric: 'Discounts given', value: a.discount },
    { metric: 'Average bill', value: a.invoices ? Math.round(a.revenue / a.invoices) : 0 },
    { metric: 'Collected at counter', value: a.cash },
    { metric: 'Sold on credit', value: a.credit },
    ...(s.showCost ? [{ metric: 'Cost of goods', value: a.cost }, { metric: 'Gross profit', value: a.taxable - a.cost }] : []),
  ];
  return { columns: [{ key: 'metric', label: 'Metric' }, { key: 'value', label: 'Value', format: money }], rows };
}

async function salesDaily(s: Scope) {
  const rows = await SaleModel.aggregate<Row>([
    { $match: { organizationId: s.org, ...outletMatch(s), status: 'completed', ...dateMatch('completedAt', s) } },
    { $group: { _id: dayKey('$completedAt'), invoices: { $sum: 1 }, revenue: { $sum: '$totals.grandTotalMinor' }, tax: { $sum: '$totals.taxMinor' }, discount: { $sum: { $add: ['$totals.itemDiscountMinor', '$totals.billDiscountMinor'] } }, cost: { $sum: { $sum: '$lines.costMinor' } }, credit: { $sum: '$creditMinor' } } },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, date: '$_id', invoices: 1, revenue: 1, tax: 1, discount: 1, credit: 1, ...(s.showCost ? { profit: { $subtract: [{ $subtract: ['$revenue', '$tax'] }, '$cost'] } } : {}) } },
  ]);
  return { columns: [{ key: 'date', label: 'Date' }, { key: 'invoices', label: 'Invoices', format: num }, { key: 'revenue', label: 'Revenue', format: money }, { key: 'tax', label: 'GST', format: money }, { key: 'discount', label: 'Discount', format: money }, { key: 'credit', label: 'Credit', format: money }, ...(s.showCost ? [{ key: 'profit', label: 'Gross profit', format: money }] : [])], rows };
}

async function salesByProduct(s: Scope, limit: number, order: 1 | -1 = -1, sortBy: 'revenue' | 'qty' = 'revenue') {
  const rows = await SaleModel.aggregate<Row & { _id: Types.ObjectId }>([
    { $match: { organizationId: s.org, ...outletMatch(s), status: 'completed', ...dateMatch('completedAt', s) } },
    { $unwind: '$lines' },
    { $group: { _id: '$lines.productId', name: { $first: '$lines.productName' }, qtyBase: { $sum: '$lines.qtyBase' }, revenue: { $sum: '$lines.totalMinor' }, taxable: { $sum: '$lines.taxableMinor' }, cost: { $sum: '$lines.costMinor' }, invoices: { $sum: 1 } } },
    { $sort: { [sortBy === 'qty' ? 'qtyBase' : 'revenue']: order, _id: 1 } },
    { $limit: limit },
  ]);
  return {
    columns: [{ key: 'name', label: 'Product' }, { key: 'qtyBase', label: 'Qty (base)', format: num }, { key: 'invoices', label: 'Lines', format: num }, { key: 'revenue', label: 'Revenue', format: money }, ...(s.showCost ? [{ key: 'cost', label: 'Cost', format: money }, { key: 'profit', label: 'Profit', format: money }, { key: 'marginPct', label: 'Margin %', format: 'percent' as const }] : [])],
    rows: rows.map((r) => ({ productId: String(r._id), name: r.name, qtyBase: r.qtyBase, invoices: r.invoices, revenue: r.revenue, ...(s.showCost ? { cost: r.cost, profit: (r.taxable as number) - (r.cost as number), marginPct: (r.taxable as number) ? Math.round((((r.taxable as number) - (r.cost as number)) / (r.taxable as number)) * 1000) / 10 : 0 } : {}) })),
  };
}

async function salesByCategory(s: Scope) {
  const rows = await SaleModel.aggregate<Row>([
    { $match: { organizationId: s.org, ...outletMatch(s), status: 'completed', ...dateMatch('completedAt', s) } },
    { $unwind: '$lines' },
    { $lookup: { from: 'products', localField: 'lines.productId', foreignField: '_id', as: 'p' } },
    { $group: { _id: { $ifNull: [{ $arrayElemAt: ['$p.categoryId', 0] }, null] }, qtyBase: { $sum: '$lines.qtyBase' }, revenue: { $sum: '$lines.totalMinor' } } },
    { $sort: { revenue: -1 } },
  ]);
  const cats = await names(CategoryModel as never, rows.map((r) => r._id as Types.ObjectId | null));
  return { columns: [{ key: 'category', label: 'Category' }, { key: 'qtyBase', label: 'Qty (base)', format: num }, { key: 'revenue', label: 'Revenue', format: money }], rows: rows.map((r) => ({ category: r._id ? (cats.get(String(r._id)) ?? 'Unknown') : 'Uncategorised', qtyBase: r.qtyBase, revenue: r.revenue })) };
}

async function salesByStaff(s: Scope) {
  const rows = await SaleModel.aggregate<Row & { _id: Types.ObjectId }>([
    { $match: { organizationId: s.org, ...outletMatch(s), status: 'completed', ...dateMatch('completedAt', s) } },
    { $group: { _id: '$soldBy', invoices: { $sum: 1 }, revenue: { $sum: '$totals.grandTotalMinor' }, discount: { $sum: { $add: ['$totals.itemDiscountMinor', '$totals.billDiscountMinor'] } } } },
    { $sort: { revenue: -1 } },
  ]);
  const users = await names(UserModel as never, rows.map((r) => r._id));
  return { columns: [{ key: 'user', label: 'Staff' }, { key: 'invoices', label: 'Invoices', format: num }, { key: 'revenue', label: 'Revenue', format: money }, { key: 'discount', label: 'Discounts', format: money }, { key: 'avg', label: 'Avg bill', format: money }], rows: rows.map((r) => ({ user: users.get(String(r._id)) ?? 'Unknown', invoices: r.invoices, revenue: r.revenue, discount: r.discount, avg: r.invoices ? Math.round((r.revenue as number) / (r.invoices as number)) : 0 })) };
}

async function salesByOutlet(s: Scope) {
  const rows = await SaleModel.aggregate<Row & { _id: Types.ObjectId }>([
    { $match: { organizationId: s.org, ...outletMatch(s), status: 'completed', ...dateMatch('completedAt', s) } },
    { $group: { _id: '$outletId', invoices: { $sum: 1 }, revenue: { $sum: '$totals.grandTotalMinor' }, tax: { $sum: '$totals.taxMinor' }, cost: { $sum: { $sum: '$lines.costMinor' } }, taxable: { $sum: '$totals.taxableMinor' } } },
    { $sort: { revenue: -1 } },
  ]);
  const outlets = await names(OutletModel as never, rows.map((r) => r._id));
  return { columns: [{ key: 'outlet', label: 'Outlet' }, { key: 'invoices', label: 'Invoices', format: num }, { key: 'revenue', label: 'Revenue', format: money }, { key: 'tax', label: 'GST', format: money }, ...(s.showCost ? [{ key: 'profit', label: 'Gross profit', format: money }] : [])], rows: rows.map((r) => ({ outlet: outlets.get(String(r._id)) ?? 'Unknown', invoices: r.invoices, revenue: r.revenue, tax: r.tax, ...(s.showCost ? { profit: (r.taxable as number) - (r.cost as number) } : {}) })) };
}

async function salesByPayment(s: Scope) {
  const rows = await SaleModel.aggregate<Row>([
    { $match: { organizationId: s.org, ...outletMatch(s), status: 'completed', ...dateMatch('completedAt', s) } },
    { $unwind: '$payments' },
    { $group: { _id: '$payments.method', amount: { $sum: '$payments.amountMinor' }, count: { $sum: 1 } } },
    { $sort: { amount: -1 } },
  ]);
  const [credit] = await SaleModel.aggregate<{ amount: number; count: number }>([{ $match: { organizationId: s.org, ...outletMatch(s), status: 'completed', creditMinor: { $gt: 0 }, ...dateMatch('completedAt', s) } }, { $group: { _id: null, amount: { $sum: '$creditMinor' }, count: { $sum: 1 } } }]);
  const out = rows.map((r) => ({ method: String(r._id).toUpperCase(), count: r.count, amount: r.amount }));
  if (credit) out.push({ method: 'CREDIT (Baki)', count: credit.count, amount: credit.amount });
  return { columns: [{ key: 'method', label: 'Method' }, { key: 'count', label: 'Payments', format: num }, { key: 'amount', label: 'Amount', format: money }], rows: out };
}

async function salesByCustomer(s: Scope, limit: number) {
  const rows = await SaleModel.aggregate<Row & { _id: Types.ObjectId | null }>([
    { $match: { organizationId: s.org, ...outletMatch(s), status: 'completed', ...dateMatch('completedAt', s) } },
    { $group: { _id: '$customerId', name: { $first: '$customerSnapshot.name' }, phone: { $first: '$customerSnapshot.phone' }, invoices: { $sum: 1 }, revenue: { $sum: '$totals.grandTotalMinor' }, credit: { $sum: '$creditMinor' }, last: { $max: '$completedAt' } } },
    { $sort: { revenue: -1 } },
    { $limit: limit },
  ]);
  return { columns: [{ key: 'name', label: 'Customer' }, { key: 'phone', label: 'Phone' }, { key: 'invoices', label: 'Invoices', format: num }, { key: 'revenue', label: 'Revenue', format: money }, { key: 'credit', label: 'On credit', format: money }, { key: 'last', label: 'Last purchase', format: 'date' as const }], rows: rows.map((r) => ({ customerId: r._id ? String(r._id) : null, name: r._id ? r.name : 'Walk-in customers', phone: r.phone, invoices: r.invoices, revenue: r.revenue, credit: r.credit, last: r.last ? new Date(r.last as string).toISOString() : null })) };
}

async function salesReturns(s: Scope, limit: number) {
  const docs = await SalesReturnModel.find(trustedFilter({ organizationId: s.org, ...outletMatch(s), status: 'completed', createdAt: { $gte: s.from, $lte: s.to } })).sort({ createdAt: -1 }).limit(limit).lean();
  const rows: Row[] = [];
  for (const d of docs) for (const l of d.lines) rows.push({ date: d.createdAt!.toISOString(), number: d.number, invoice: d.saleNumber ?? '', customer: d.customerName ?? '', product: l.productName, batch: l.batchNumber, qty: l.qty, unit: l.unitName ?? '', condition: l.condition ?? '', reason: l.reason ?? '', value: l.totalMinor ?? 0, settlement: d.settlement ?? '' });
  return { columns: [{ key: 'date', label: 'Date', format: 'date' as const }, { key: 'number', label: 'Return' }, { key: 'invoice', label: 'Invoice' }, { key: 'customer', label: 'Customer' }, { key: 'product', label: 'Product' }, { key: 'batch', label: 'Batch' }, { key: 'qty', label: 'Qty', format: num }, { key: 'unit', label: 'Unit' }, { key: 'condition', label: 'Condition' }, { key: 'reason', label: 'Reason' }, { key: 'value', label: 'Value', format: money }, { key: 'settlement', label: 'Settlement' }], rows };
}

/* ---------------------------------------------------------------- purchases */

async function purchasesSummary(s: Scope) {
  const [a] = await PurchaseModel.aggregate<{ invoices: number; value: number; taxable: number; tax: number; paid: number; balance: number }>([
    { $match: { organizationId: s.org, ...outletMatch(s), status: { $ne: 'cancelled' }, ...dateMatch('invoiceDate', s) } },
    { $group: { _id: null, invoices: { $sum: 1 }, value: { $sum: '$totals.grandTotalMinor' }, taxable: { $sum: '$totals.taxableMinor' }, tax: { $sum: '$totals.taxMinor' }, paid: { $sum: '$paidMinor' }, balance: { $sum: '$balanceMinor' } } },
  ]);
  const [ret] = await PurchaseReturnModel.aggregate<{ value: number }>([{ $match: { organizationId: s.org, ...outletMatch(s), status: 'completed', ...dateMatch('createdAt', s) } }, { $group: { _id: null, value: { $sum: '$totals.grandTotalMinor' } } }]);
  const v = a ?? { invoices: 0, value: 0, taxable: 0, tax: 0, paid: 0, balance: 0 };
  return { columns: [{ key: 'metric', label: 'Metric' }, { key: 'value', label: 'Value', format: money }], rows: [{ metric: 'Purchase invoices', value: v.invoices }, { metric: 'Purchase value', value: v.value }, { metric: 'Taxable value', value: v.taxable }, { metric: 'Input GST', value: v.tax }, { metric: 'Returned to suppliers', value: -(ret?.value ?? 0) }, { metric: 'Paid', value: v.paid }, { metric: 'Outstanding', value: v.balance }] };
}

async function purchasesBySupplier(s: Scope) {
  const rows = await PurchaseModel.aggregate<Row & { _id: Types.ObjectId }>([
    { $match: { organizationId: s.org, ...outletMatch(s), status: { $ne: 'cancelled' }, ...dateMatch('invoiceDate', s) } },
    { $group: { _id: '$supplierId', supplier: { $first: '$supplierSnapshot.name' }, invoices: { $sum: 1 }, value: { $sum: '$totals.grandTotalMinor' }, paid: { $sum: '$paidMinor' }, balance: { $sum: '$balanceMinor' } } },
    { $sort: { value: -1 } },
  ]);
  return { columns: [{ key: 'supplier', label: 'Supplier' }, { key: 'invoices', label: 'Invoices', format: num }, { key: 'value', label: 'Value', format: money }, { key: 'paid', label: 'Paid', format: money }, { key: 'balance', label: 'Outstanding', format: money }], rows: rows.map((r) => ({ supplierId: String(r._id), supplier: r.supplier, invoices: r.invoices, value: r.value, paid: r.paid, balance: r.balance })) };
}

async function purchasesByProduct(s: Scope, limit: number) {
  const rows = await PurchaseModel.aggregate<Row & { _id: Types.ObjectId }>([
    { $match: { organizationId: s.org, ...outletMatch(s), status: { $ne: 'cancelled' }, ...dateMatch('invoiceDate', s) } },
    { $unwind: '$lines' },
    { $group: { _id: '$lines.productId', name: { $first: '$lines.productName' }, qtyBase: { $sum: '$lines.qtyBase' }, freeBase: { $sum: '$lines.freeQtyBase' }, cost: { $sum: '$lines.totalMinor' }, lastPrice: { $last: '$lines.purchasePriceMinor' } } },
    { $sort: { cost: -1 } },
    { $limit: limit },
  ]);
  return { columns: [{ key: 'name', label: 'Product' }, { key: 'qtyBase', label: 'Qty (base)', format: num }, { key: 'freeBase', label: 'Free (base)', format: num }, { key: 'cost', label: 'Cost', format: money }, { key: 'lastPrice', label: 'Last price', format: money }], rows: rows.map((r) => ({ productId: String(r._id), name: r.name, qtyBase: r.qtyBase, freeBase: r.freeBase, cost: r.cost, lastPrice: r.lastPrice })) };
}

async function purchaseReturns(s: Scope, limit: number) {
  const docs = await PurchaseReturnModel.find(trustedFilter({ organizationId: s.org, ...outletMatch(s), status: 'completed', createdAt: { $gte: s.from, $lte: s.to } })).sort({ createdAt: -1 }).limit(limit).lean();
  const rows: Row[] = [];
  for (const d of docs) for (const l of d.lines) rows.push({ date: d.createdAt!.toISOString(), number: d.number, supplier: d.supplierName ?? '', product: l.productName, batch: l.batchNumber, qty: l.qty, unit: l.unitName ?? '', reason: l.reason ?? '', value: l.totalMinor ?? 0 });
  return { columns: [{ key: 'date', label: 'Date', format: 'date' as const }, { key: 'number', label: 'Return' }, { key: 'supplier', label: 'Supplier' }, { key: 'product', label: 'Product' }, { key: 'batch', label: 'Batch' }, { key: 'qty', label: 'Qty', format: num }, { key: 'unit', label: 'Unit' }, { key: 'reason', label: 'Reason' }, { key: 'value', label: 'Value', format: money }], rows };
}

/* ---------------------------------------------------------------- inventory */

async function stockRows(s: Scope, opts: { lowOnly?: boolean; valuation?: boolean } = {}) {
  const today = startOfToday();
  const org = await OrganizationModel.findById(s.org).select('settings.inventory').lean();
  const warn = Math.max(...(org?.settings?.inventory?.expiryWarningDays ?? [30, 60, 90]));
  const near = new Date(today.getTime() + warn * 86_400_000);
  const agg = await StockModel.aggregate<{ _id: Types.ObjectId; onHand: number; expired: number; near: number; batchIds: Types.ObjectId[] }>([
    { $match: { organizationId: s.org, ...outletMatch(s), qtyBase: { $gt: 0 } } },
    { $group: { _id: '$productId', onHand: { $sum: '$qtyBase' }, expired: { $sum: { $cond: [{ $lt: ['$expiryDate', today] }, '$qtyBase', 0] } }, near: { $sum: { $cond: [{ $and: [{ $gte: ['$expiryDate', today] }, { $lte: ['$expiryDate', near] }] }, '$qtyBase', 0] } }, batchIds: { $push: '$batchId' } } },
  ]);
  const sMap = new Map(agg.map((a) => [String(a._id), a]));
  const products = await ProductModel.find(trustedFilter({ organizationId: s.org, status: { $ne: 'archived' } })).select('name packLabel manufacturer categoryId stockRules pricingUnitId units').sort({ nameNormalized: 1 }).lean();
  const cats = await names(CategoryModel as never, products.map((p) => p.categoryId));
  let valuation = new Map<string, { cost: number; mrp: number }>();
  if (opts.valuation) {
    const stocks = await StockModel.find(trustedFilter({ organizationId: s.org, ...outletMatch(s), qtyBase: { $gt: 0 } })).lean();
    const batches = await ProductBatchModel.find(trustedFilter({ _id: { $in: stocks.map((x) => x.batchId) } })).lean();
    const bMap = new Map(batches.map((b) => [String(b._id), b]));
    valuation = new Map();
    for (const st of stocks) {
      const b = bMap.get(String(st.batchId));
      if (!b) continue;
      const v = valuation.get(String(st.productId)) ?? { cost: 0, mrp: 0 };
      v.cost += Math.round((st.qtyBase * b.purchasePriceMinor) / b.pricingUnitFactor);
      v.mrp += Math.round((st.qtyBase * b.mrpMinor) / b.pricingUnitFactor);
      valuation.set(String(st.productId), v);
    }
  }
  const rows: Row[] = [];
  for (const p of products) {
    const st = sMap.get(String(p._id));
    const onHand = st?.onHand ?? 0;
    const sellable = onHand - (st?.expired ?? 0);
    const level = p.stockRules?.reorderLevelBase ?? 0;
    const low = level > 0 && sellable <= level;
    if (opts.lowOnly && !low) continue;
    const v = valuation.get(String(p._id));
    rows.push({ productId: String(p._id), name: p.name, pack: p.packLabel ?? '', manufacturer: p.manufacturer ?? '', category: p.categoryId ? (cats.get(String(p.categoryId)) ?? '') : '', onHand, sellable, expired: st?.expired ?? 0, nearExpiry: st?.near ?? 0, reorderLevel: level, low: low ? 'Yes' : '', batches: st?.batchIds.length ?? 0, ...(opts.valuation ? { costValue: v?.cost ?? 0, mrpValue: v?.mrp ?? 0 } : {}) });
  }
  return rows;
}

const stockColumns: ReportColumn[] = [{ key: 'name', label: 'Product' }, { key: 'pack', label: 'Pack' }, { key: 'category', label: 'Category' }, { key: 'onHand', label: 'On hand', format: num }, { key: 'sellable', label: 'Sellable', format: num }, { key: 'expired', label: 'Expired', format: num }, { key: 'nearExpiry', label: 'Near expiry', format: num }, { key: 'reorderLevel', label: 'Reorder level', format: num }, { key: 'low', label: 'Low' }, { key: 'batches', label: 'Batches', format: num }];

async function deadStock(s: Scope) {
  const sold = await SaleModel.aggregate<{ _id: Types.ObjectId }>([{ $match: { organizationId: s.org, ...outletMatch(s), status: 'completed', ...dateMatch('completedAt', s) } }, { $unwind: '$lines' }, { $group: { _id: '$lines.productId' } }]);
  const soldSet = new Set(sold.map((x) => String(x._id)));
  const rows = (await stockRows(s, { valuation: s.showCost })).filter((r) => (r.onHand as number) > 0 && !soldSet.has(String(r.productId)));
  return { columns: [...stockColumns, ...(s.showCost ? [{ key: 'costValue', label: 'Value at cost', format: money }] : [])], rows };
}

async function batchesReport(s: Scope, limit: number, expiryOnly = false) {
  const today = startOfToday();
  const org = await OrganizationModel.findById(s.org).select('settings.inventory').lean();
  const warn = Math.max(...(org?.settings?.inventory?.expiryWarningDays ?? [30, 60, 90]));
  const near = new Date(today.getTime() + warn * 86_400_000);
  const stocks = await StockModel.find(trustedFilter({ organizationId: s.org, ...outletMatch(s), qtyBase: { $gt: 0 }, ...(expiryOnly ? { expiryDate: { $lte: near } } : {}) })).sort({ expiryDate: 1 }).limit(limit).lean();
  const batches = await ProductBatchModel.find(trustedFilter({ _id: { $in: stocks.map((x) => x.batchId) } })).lean();
  const bMap = new Map(batches.map((b) => [String(b._id), b]));
  const products = await names(ProductModel as never, stocks.map((x) => x.productId));
  const outlets = await names(OutletModel as never, stocks.map((x) => x.outletId));
  const rows: Row[] = stocks.map((st) => {
    const b = bMap.get(String(st.batchId));
    const days = Math.floor((st.expiryDate.getTime() - today.getTime()) / 86_400_000);
    return { product: products.get(String(st.productId)) ?? '', outlet: outlets.get(String(st.outletId)) ?? '', batch: b?.batchNumber ?? '', expiry: st.expiryDate.toISOString(), daysToExpiry: days, status: days < 0 ? 'Expired' : days <= warn ? 'Near expiry' : 'OK', qty: st.qtyBase, mrp: b?.mrpMinor ?? 0, ...(s.showCost ? { cost: b?.purchasePriceMinor ?? 0, value: b ? Math.round((st.qtyBase * b.purchasePriceMinor) / b.pricingUnitFactor) : 0 } : {}) };
  });
  return { columns: [{ key: 'product', label: 'Product' }, { key: 'outlet', label: 'Outlet' }, { key: 'batch', label: 'Batch' }, { key: 'expiry', label: 'Expiry', format: 'date' as const }, { key: 'daysToExpiry', label: 'Days', format: num }, { key: 'status', label: 'Status' }, { key: 'qty', label: 'Qty (base)', format: num }, { key: 'mrp', label: 'MRP', format: money }, ...(s.showCost ? [{ key: 'cost', label: 'Cost', format: money }, { key: 'value', label: 'Value at cost', format: money }] : [])], rows };
}

async function movementsReport(s: Scope, limit: number) {
  const docs = await InventoryMovementModel.find(trustedFilter({ organizationId: s.org, ...outletMatch(s), createdAt: { $gte: s.from, $lte: s.to } })).sort({ createdAt: -1 }).limit(limit).lean();
  const [products, batches, users] = await Promise.all([names(ProductModel as never, docs.map((d) => d.productId)), ProductBatchModel.find(trustedFilter({ _id: { $in: docs.map((d) => d.batchId) } })).select('batchNumber').lean(), names(UserModel as never, docs.map((d) => d.userId))]);
  const bMap = new Map(batches.map((b) => [String(b._id), b.batchNumber]));
  return { columns: [{ key: 'date', label: 'Date', format: 'date' as const }, { key: 'product', label: 'Product' }, { key: 'batch', label: 'Batch' }, { key: 'reason', label: 'Reason' }, { key: 'change', label: 'Change', format: num }, { key: 'balance', label: 'Balance', format: num }, { key: 'reference', label: 'Reference' }, { key: 'user', label: 'User' }], rows: docs.map((d) => ({ date: d.createdAt.toISOString(), product: products.get(String(d.productId)) ?? '', batch: bMap.get(String(d.batchId)) ?? '', reason: d.reason, change: d.qtyBaseDelta, balance: d.balanceAfterBase, reference: d.refNumber ?? '', user: users.get(String(d.userId)) ?? '' })) };
}

async function looseSales(s: Scope, limit: number) {
  const rows = await SaleModel.aggregate<Row>([
    { $match: { organizationId: s.org, ...outletMatch(s), status: 'completed', ...dateMatch('completedAt', s) } },
    { $unwind: '$lines' },
    { $match: { $expr: { $lt: ['$lines.factorToBase', '$lines.pricingUnitFactor'] } } },
    { $group: { _id: '$lines.productId', name: { $first: '$lines.productName' }, unit: { $first: '$lines.unitName' }, qty: { $sum: '$lines.qty' }, qtyBase: { $sum: '$lines.qtyBase' }, revenue: { $sum: '$lines.totalMinor' }, lines: { $sum: 1 } } },
    { $sort: { qtyBase: -1 } },
    { $limit: limit },
  ]);
  return { columns: [{ key: 'name', label: 'Product' }, { key: 'unit', label: 'Loose unit' }, { key: 'qty', label: 'Qty sold', format: num }, { key: 'lines', label: 'Lines', format: num }, { key: 'revenue', label: 'Revenue', format: money }], rows: rows.map((r) => ({ name: r.name, unit: r.unit, qty: r.qty, lines: r.lines, revenue: r.revenue })) };
}

async function scheduleRegister(s: Scope, limit: number) {
  const docs = await SaleModel.find(trustedFilter({ organizationId: s.org, ...outletMatch(s), status: 'completed', completedAt: { $gte: s.from, $lte: s.to }, 'lines.schedule': { $in: ['H', 'H1', 'X', 'narcotic'] } })).sort({ completedAt: -1 }).limit(limit).lean();
  const rows: Row[] = [];
  for (const d of docs) for (const l of d.lines) if (['H', 'H1', 'X', 'narcotic'].includes(l.schedule ?? '')) rows.push({ date: d.completedAt!.toISOString(), invoice: d.number, customer: d.customerSnapshot?.name ?? '', phone: d.customerSnapshot?.phone ?? '', doctor: d.doctorName || (d.prescriptionIds?.length ? 'Prescription attached' : ''), product: l.productName, schedule: l.schedule ?? '', batch: l.batchNumber, qty: l.qty, unit: l.unitName ?? '' });
  return { columns: [{ key: 'date', label: 'Date', format: 'date' as const }, { key: 'invoice', label: 'Invoice' }, { key: 'customer', label: 'Patient' }, { key: 'phone', label: 'Phone' }, { key: 'doctor', label: 'Prescriber' }, { key: 'product', label: 'Medicine' }, { key: 'schedule', label: 'Schedule' }, { key: 'batch', label: 'Batch' }, { key: 'qty', label: 'Qty', format: num }, { key: 'unit', label: 'Unit' }], rows };
}

/* ---------------------------------------------------------------- finance */

async function gstSummary(s: Scope) {
  const output = await SaleModel.aggregate<Row>([
    { $match: { organizationId: s.org, ...outletMatch(s), status: 'completed', ...dateMatch('completedAt', s) } },
    { $unwind: '$lines' },
    { $group: { _id: '$lines.taxRateBps', taxable: { $sum: '$lines.taxableMinor' }, cgst: { $sum: '$lines.cgstMinor' }, sgst: { $sum: '$lines.sgstMinor' }, igst: { $sum: '$lines.igstMinor' }, cess: { $sum: '$lines.cessMinor' } } },
    { $sort: { _id: 1 } },
  ]);
  const input = await PurchaseModel.aggregate<Row>([
    { $match: { organizationId: s.org, ...outletMatch(s), status: { $ne: 'cancelled' }, ...dateMatch('invoiceDate', s) } },
    { $unwind: '$lines' },
    { $group: { _id: '$lines.taxRateBps', taxable: { $sum: '$lines.taxableMinor' }, cgst: { $sum: '$lines.cgstMinor' }, sgst: { $sum: '$lines.sgstMinor' }, igst: { $sum: '$lines.igstMinor' }, cess: { $sum: '$lines.cessMinor' } } },
    { $sort: { _id: 1 } },
  ]);
  const rows: Row[] = [
    ...output.map((r) => ({ side: 'Output (sales)', rate: (r._id as number) / 100, taxable: r.taxable, cgst: r.cgst, sgst: r.sgst, igst: r.igst, cess: r.cess, total: (r.cgst as number) + (r.sgst as number) + (r.igst as number) + (r.cess as number) })),
    ...input.map((r) => ({ side: 'Input (purchases)', rate: (r._id as number) / 100, taxable: r.taxable, cgst: r.cgst, sgst: r.sgst, igst: r.igst, cess: r.cess, total: (r.cgst as number) + (r.sgst as number) + (r.igst as number) + (r.cess as number) })),
  ];
  const outTax = output.reduce((a, r) => a + (r.cgst as number) + (r.sgst as number) + (r.igst as number) + (r.cess as number), 0);
  const inTax = input.reduce((a, r) => a + (r.cgst as number) + (r.sgst as number) + (r.igst as number) + (r.cess as number), 0);
  return { columns: [{ key: 'side', label: 'Side' }, { key: 'rate', label: 'GST %', format: 'percent' as const }, { key: 'taxable', label: 'Taxable', format: money }, { key: 'cgst', label: 'CGST', format: money }, { key: 'sgst', label: 'SGST', format: money }, { key: 'igst', label: 'IGST', format: money }, { key: 'cess', label: 'Cess', format: money }, { key: 'total', label: 'Total tax', format: money }], rows, totals: { outputTax: outTax, inputTax: inTax, netPayable: outTax - inTax } };
}

async function hsnSummary(s: Scope) {
  const rows = await SaleModel.aggregate<Row>([
    { $match: { organizationId: s.org, ...outletMatch(s), status: 'completed', ...dateMatch('completedAt', s) } },
    { $unwind: '$lines' },
    { $group: { _id: { hsn: '$lines.hsnCode', rate: '$lines.taxRateBps' }, qtyBase: { $sum: '$lines.qtyBase' }, taxable: { $sum: '$lines.taxableMinor' }, cgst: { $sum: '$lines.cgstMinor' }, sgst: { $sum: '$lines.sgstMinor' }, igst: { $sum: '$lines.igstMinor' }, total: { $sum: '$lines.totalMinor' } } },
    { $sort: { '_id.hsn': 1, '_id.rate': 1 } },
  ]);
  return { columns: [{ key: 'hsn', label: 'HSN' }, { key: 'rate', label: 'GST %', format: 'percent' as const }, { key: 'qtyBase', label: 'Qty (base)', format: num }, { key: 'taxable', label: 'Taxable', format: money }, { key: 'cgst', label: 'CGST', format: money }, { key: 'sgst', label: 'SGST', format: money }, { key: 'igst', label: 'IGST', format: money }, { key: 'total', label: 'Invoice value', format: money }], rows: rows.map((r) => { const id = r._id as unknown as { hsn: string; rate: number }; return { hsn: id.hsn || '—', rate: id.rate / 100, qtyBase: r.qtyBase, taxable: r.taxable, cgst: r.cgst, sgst: r.sgst, igst: r.igst, total: r.total }; }) };
}

async function outstanding(s: Scope, party: 'customer' | 'supplier') {
  const Model = party === 'customer' ? SaleModel : PurchaseModel;
  const now = Date.now();
  const docs = await (Model as typeof SaleModel).find(trustedFilter({ organizationId: s.org, ...outletMatch(s), balanceMinor: { $gt: 0 }, status: party === 'customer' ? 'completed' : { $ne: 'cancelled' } })).select('number customerSnapshot supplierSnapshot customerId supplierId balanceMinor dueDate completedAt invoiceDate totals').lean();
  const byParty = new Map<string, { name: string; id: string; total: number; buckets: number[]; invoices: number; oldest: Date | null }>();
  for (const d of docs as unknown as { number: string; customerSnapshot?: { name: string }; supplierSnapshot?: { name: string }; customerId?: Types.ObjectId; supplierId?: Types.ObjectId; balanceMinor: number; dueDate?: Date | null; completedAt?: Date; invoiceDate?: Date }[]) {
    const id = String(party === 'customer' ? d.customerId : d.supplierId);
    const name = party === 'customer' ? d.customerSnapshot?.name ?? 'Walk-in' : d.supplierSnapshot?.name ?? '';
    const ref = d.dueDate ?? d.completedAt ?? d.invoiceDate ?? new Date();
    const days = Math.floor((now - ref.getTime()) / 86_400_000);
    const bucket = days <= 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : 4;
    const e = byParty.get(id) ?? { name, id, total: 0, buckets: [0, 0, 0, 0, 0], invoices: 0, oldest: null };
    e.total += d.balanceMinor;
    e.buckets[bucket]! += d.balanceMinor;
    e.invoices += 1;
    if (!e.oldest || ref < e.oldest) e.oldest = ref;
    byParty.set(id, e);
  }
  const rows: Row[] = [...byParty.values()].sort((a, b) => b.total - a.total).map((e) => ({ partyId: e.id, name: e.name, invoices: e.invoices, notDue: e.buckets[0]!, d0_30: e.buckets[1]!, d31_60: e.buckets[2]!, d61_90: e.buckets[3]!, d90plus: e.buckets[4]!, total: e.total, oldest: e.oldest ? e.oldest.toISOString() : null }));
  return { columns: [{ key: 'name', label: party === 'customer' ? 'Customer' : 'Supplier' }, { key: 'invoices', label: 'Open invoices', format: num }, { key: 'notDue', label: 'Not due', format: money }, { key: 'd0_30', label: '0-30 days', format: money }, { key: 'd31_60', label: '31-60', format: money }, { key: 'd61_90', label: '61-90', format: money }, { key: 'd90plus', label: '90+', format: money }, { key: 'total', label: 'Total', format: money }, { key: 'oldest', label: 'Oldest', format: 'date' as const }], rows, totals: { total: rows.reduce((a, r) => a + (r.total as number), 0) } };
}

async function collections(s: Scope) {
  const counter = await SaleModel.aggregate<Row>([
    { $match: { organizationId: s.org, ...outletMatch(s), status: 'completed', ...dateMatch('completedAt', s) } },
    { $unwind: '$payments' },
    { $match: { 'payments.paymentId': null } },
    { $group: { _id: { day: dayKey('$completedAt'), method: '$payments.method' }, amount: { $sum: '$payments.amountMinor' } } },
  ]);
  const receipts = await PartyPaymentModel.aggregate<Row>([
    { $match: { organizationId: s.org, ...outletMatch(s), partyType: 'customer', status: 'completed', ...dateMatch('date', s) } },
    { $group: { _id: { day: dayKey('$date'), method: '$method' }, amount: { $sum: '$amountMinor' } } },
  ]);
  const map = new Map<string, Row>();
  const add = (r: Row, kind: 'counter' | 'receipts') => {
    const id = r._id as unknown as { day: string; method: string };
    const key = `${id.day}|${id.method}`;
    const e = map.get(key) ?? { date: id.day, method: id.method.toUpperCase(), counter: 0, receipts: 0, total: 0 };
    e[kind] = (e[kind] as number) + (r.amount as number);
    e.total = (e.counter as number) + (e.receipts as number);
    map.set(key, e);
  };
  counter.forEach((r) => add(r, 'counter'));
  receipts.forEach((r) => add(r, 'receipts'));
  const rows = [...map.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.method).localeCompare(String(b.method)));
  return { columns: [{ key: 'date', label: 'Date' }, { key: 'method', label: 'Method' }, { key: 'counter', label: 'At counter', format: money }, { key: 'receipts', label: 'Credit receipts', format: money }, { key: 'total', label: 'Total', format: money }], rows, totals: { total: rows.reduce((a, r) => a + (r.total as number), 0) } };
}

async function discounts(s: Scope, limit: number) {
  const docs = await SaleModel.find(trustedFilter({ organizationId: s.org, ...outletMatch(s), status: 'completed', completedAt: { $gte: s.from, $lte: s.to }, $or: [{ 'totals.itemDiscountMinor': { $gt: 0 } }, { 'totals.billDiscountMinor': { $gt: 0 } }] })).sort({ completedAt: -1 }).limit(limit).select('number completedAt soldBy customerSnapshot totals lines.priceOverridden').lean();
  const users = await names(UserModel as never, docs.map((d) => d.soldBy));
  return { columns: [{ key: 'date', label: 'Date', format: 'date' as const }, { key: 'invoice', label: 'Invoice' }, { key: 'staff', label: 'Staff' }, { key: 'customer', label: 'Customer' }, { key: 'subtotal', label: 'Subtotal', format: money }, { key: 'discount', label: 'Discount', format: money }, { key: 'pct', label: '%', format: 'percent' as const }, { key: 'overrides', label: 'Price overrides', format: num }], rows: docs.map((d) => { const disc = d.totals.itemDiscountMinor + d.totals.billDiscountMinor; return { date: d.completedAt!.toISOString(), invoice: d.number, staff: users.get(String(d.soldBy)) ?? '', customer: d.customerSnapshot?.name ?? '', subtotal: d.totals.subtotalMinor, discount: disc, pct: d.totals.subtotalMinor ? Math.round((disc / d.totals.subtotalMinor) * 1000) / 10 : 0, overrides: d.lines.filter((l) => l.priceOverridden).length }; }) };
}

async function staffActivity(s: Scope) {
  const rows = await AuditLogModel.aggregate<Row & { _id: { user: Types.ObjectId; action: string } }>([
    { $match: { organizationId: s.org, ...(s.outletId ? { $or: [{ outletId: s.outletId }, { outletId: null }] } : {}), ...dateMatch('createdAt', s), userId: { $ne: null } } },
    { $group: { _id: { user: '$userId', action: '$action' }, count: { $sum: 1 }, last: { $max: '$createdAt' } } },
    { $sort: { count: -1 } },
    { $limit: 500 },
  ]);
  const users = await names(UserModel as never, rows.map((r) => r._id.user));
  return { columns: [{ key: 'user', label: 'User' }, { key: 'action', label: 'Action' }, { key: 'count', label: 'Count', format: num }, { key: 'last', label: 'Last at', format: 'date' as const }], rows: rows.map((r) => ({ user: users.get(String(r._id.user)) ?? '', action: r._id.action, count: r.count, last: new Date(r.last as string).toISOString() })) };
}

async function businessSummary(s: Scope) {
  const [sales, purchases, stock] = await Promise.all([salesSummary(s), purchasesSummary(s), stockRows(s, { valuation: true })]);
  const [recv, pay] = await Promise.all([outstanding(s, 'customer'), outstanding(s, 'supplier')]);
  const stockValue = stock.reduce((a, r) => a + ((r.costValue as number) ?? 0), 0);
  const rows: Row[] = [
    ...sales.rows.map((r) => ({ section: 'Sales', ...r })),
    ...purchases.rows.map((r) => ({ section: 'Purchases', ...r })),
    { section: 'Receivables', metric: 'Customer outstanding', value: recv.totals?.total ?? 0 },
    { section: 'Payables', metric: 'Supplier outstanding', value: pay.totals?.total ?? 0 },
    { section: 'Inventory', metric: 'Products in stock', value: stock.filter((r) => (r.onHand as number) > 0).length },
    { section: 'Inventory', metric: 'Stock value at cost', value: stockValue },
    { section: 'Inventory', metric: 'Low-stock products', value: stock.filter((r) => r.low === 'Yes').length },
    { section: 'Inventory', metric: 'Expired units', value: stock.reduce((a, r) => a + (r.expired as number), 0) },
  ];
  return { columns: [{ key: 'section', label: 'Section' }, { key: 'metric', label: 'Metric' }, { key: 'value', label: 'Value', format: money }], rows };
}

/* ---------------------------------------------------------------- dispatcher */

export async function runReport(ctx: RequestContext, key: ReportKey, q: ReportQuery): Promise<ReportResult> {
  const def = REPORT_CATALOGUE.find((r) => r.key === key);
  if (!def) throw new ValidationError('Unknown report');
  if (!hasPermission(ctx, 'reports.view')) throw new ForbiddenError();
  if (def.sensitive && !hasPermission(ctx, 'reports.viewProfit') && !hasPermission(ctx, 'products.viewCost')) throw new ForbiddenError('This report needs the “View profit & margin reports” permission');
  const s = scopeFor(ctx, q);
  const limit = q.limit;
  let out: { columns: ReportColumn[]; rows: Row[]; totals?: Record<string, string | number | null | undefined> };
  switch (key) {
    case 'sales.summary': out = await salesSummary(s); break;
    case 'sales.daily': out = await salesDaily(s); break;
    case 'sales.byProduct': out = await salesByProduct(s, limit); break;
    case 'sales.byCategory': out = await salesByCategory(s); break;
    case 'sales.byStaff': out = await salesByStaff(s); break;
    case 'sales.byOutlet': out = await salesByOutlet(s); break;
    case 'sales.byPayment': out = await salesByPayment(s); break;
    case 'sales.byCustomer': out = await salesByCustomer(s, limit); break;
    case 'sales.returns': out = await salesReturns(s, limit); break;
    case 'purchases.summary': out = await purchasesSummary(s); break;
    case 'purchases.bySupplier': out = await purchasesBySupplier(s); break;
    case 'purchases.byProduct': out = await purchasesByProduct(s, limit); break;
    case 'purchases.returns': out = await purchaseReturns(s, limit); break;
    case 'inventory.stock': out = { columns: stockColumns, rows: await stockRows(s) }; break;
    case 'inventory.valuation': { const rows = await stockRows(s, { valuation: true }); out = { columns: [...stockColumns, { key: 'costValue', label: 'Value at cost', format: money }, { key: 'mrpValue', label: 'Value at MRP', format: money }], rows, totals: { costValue: rows.reduce((a, r) => a + (r.costValue as number), 0), mrpValue: rows.reduce((a, r) => a + (r.mrpValue as number), 0) } }; break; }
    case 'inventory.lowStock': out = { columns: stockColumns, rows: await stockRows(s, { lowOnly: true }) }; break;
    case 'inventory.deadStock': out = await deadStock(s); break;
    case 'inventory.fastMoving': out = await salesByProduct(s, limit, -1, 'qty'); break;
    case 'inventory.slowMoving': out = await salesByProduct(s, limit, 1, 'qty'); break;
    case 'inventory.batches': out = await batchesReport(s, limit); break;
    case 'inventory.expiry': out = await batchesReport(s, limit, true); break;
    case 'inventory.movements': out = await movementsReport(s, limit); break;
    case 'inventory.looseSales': out = await looseSales(s, limit); break;
    case 'pharmacy.scheduleRegister': out = await scheduleRegister(s, limit); break;
    case 'finance.profit': out = await salesByProduct(s, limit); break;
    case 'finance.gst': out = await gstSummary(s); break;
    case 'finance.hsn': out = await hsnSummary(s); break;
    case 'finance.outstanding': out = await outstanding(s, 'customer'); break;
    case 'finance.payables': out = await outstanding(s, 'supplier'); break;
    case 'finance.collections': out = await collections(s); break;
    case 'finance.discounts': out = await discounts(s, limit); break;
    case 'staff.activity': out = await staffActivity(s); break;
    case 'business.summary': out = await businessSummary(s); break;
    default: throw new ValidationError('Unknown report');
  }
  return { key, title: def.label, columns: out.columns, rows: out.rows as ReportResult['rows'], totals: out.totals as ReportResult['totals'], meta: { from: def.needsDates ? s.from.toISOString() : null, to: def.needsDates ? s.to.toISOString() : null, outletId: s.outletId ? String(s.outletId) : null, generatedAt: new Date().toISOString(), rowCount: out.rows.length } };
}

export { CustomerModel as _c, SupplierModel as _s };
