import type { AiAction, ReportKey } from '@pharmaos/shared';
import { REPORT_CATALOGUE } from '@pharmaos/shared';
import type { RequestContext } from '@/lib/context';
import { hasPermission } from '@/lib/context';
import type { AiToolDeclaration } from '@/services/ai/provider';
import { searchProducts } from '@/modules/catalog/products.service';
import { stockOverview, listBatches, expirySummary } from '@/modules/inventory/inventory.service';
import { searchCustomers, getCustomer } from '@/modules/parties/customers.service';
import { listSuppliers, getSupplier } from '@/modules/parties/suppliers.service';
import { outstandingDocuments } from '@/modules/parties/payments.service';
import { listLedger } from '@/services/ledger.service';
import { listSales, getSale, customerSales, quoteSale } from '@/modules/sales/sales.service';
import { listPurchases } from '@/modules/purchases/purchases.service';
import { dashboardSummary } from '@/modules/dashboard/dashboard.service';
import { runReport } from '@/modules/reports/reports.service';

/**
 * The only way the model touches pharmacy data. Every tool checks the caller's real permission,
 * calls an existing service (never the database) and returns a compact, already-scoped result.
 * Tools that would move money or stock return a *draft* plus an action the UI must confirm.
 */
export interface AiToolResult {
  data: unknown;
  actions?: AiAction[];
}

export interface AiTool {
  declaration: AiToolDeclaration;
  permission: string | string[];
  /** Only offered when the organization has this feature enabled. */
  feature?: 'assistant' | 'smartInventory' | 'reports' | 'automation';
  run(ctx: RequestContext, args: Record<string, unknown>): Promise<AiToolResult>;
}

const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);
const money = (minor?: number | null) => (minor === undefined || minor === null ? null : Math.round(minor) / 100);
const date = (v: unknown) => { const s = str(v); const d = s ? new Date(s) : undefined; return d && !Number.isNaN(d.getTime()) ? d : undefined; };
const OBJ = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required });

function requireOutlet(ctx: RequestContext) {
  if (!ctx.outletId) throw new Error('No outlet is selected. Ask the user to pick an outlet from the top bar first.');
}

export const TOOLS: AiTool[] = [
  {
    declaration: { name: 'searchMedicine', description: 'Find medicines/products by name, generic, salt, brand or barcode. Returns stock at the current outlet with batches.', parameters: OBJ({ query: { type: 'string', description: 'Name, generic, salt or barcode fragment' } }, ['query']) },
    permission: 'products.view',
    async run(ctx, a) {
      const hits = await searchProducts(ctx, str(a.query, 100), 8, Boolean(ctx.outletId));
      return {
        data: hits.map((p) => ({
          id: p.id, name: p.name, packLabel: p.packLabel, generic: p.genericName, manufacturer: p.manufacturer, schedule: p.schedule, requiresPrescription: p.requiresPrescription,
          mrp: money(p.pricing.mrpMinor), sellingPrice: money(p.pricing.sellingPriceMinor || p.pricing.mrpMinor), gstPercent: p.tax.rateBps / 100,
          units: p.units.map((u) => ({ id: u.unitId, name: u.unitName, factorToBase: u.factorToBase, defaultSale: u.isDefaultSale })),
          stockBase: p.stockBase ?? null,
          batches: (p.batches ?? []).slice(0, 6).map((b) => ({ id: b.batchId, batch: b.batchNumber, expiry: b.expiryDate.slice(0, 10), qtyBase: b.qtyBase, mrp: money(b.mrpMinor), sellingPrice: money(b.sellingPriceMinor), expired: b.isExpired, daysToExpiry: b.daysToExpiry })),
        })),
      };
    },
  },
  {
    declaration: { name: 'getLowStock', description: 'Products at or below their reorder level at the current outlet.', parameters: OBJ({ limit: { type: 'integer' } }) },
    permission: 'inventory.view',
    feature: 'smartInventory',
    async run(ctx, a) {
      requireOutlet(ctx);
      const { items } = await stockOverview(ctx, { page: 1, pageSize: Math.min(num(a.limit) ?? 25, 50), lowStock: true, onlyInStock: false });
      return { data: items.map((r) => ({ productId: r.productId, name: r.name, packLabel: r.packLabel, sellable: r.sellableBase, reorderLevel: r.reorderLevelBase, shortfall: Math.max(r.reorderLevelBase - r.sellableBase, 0), baseUnit: r.baseUnit, nextExpiry: r.nextExpiry })), actions: [{ type: 'navigate', label: 'Open low stock', href: '/inventory?tab=low-stock' }] };
    },
  },
  {
    declaration: { name: 'getExpiringStock', description: 'Batches expiring within N days (and already expired) at the current outlet.', parameters: OBJ({ withinDays: { type: 'integer', description: 'Default 30' }, limit: { type: 'integer' } }) },
    permission: 'inventory.view',
    feature: 'smartInventory',
    async run(ctx, a) {
      requireOutlet(ctx);
      const days = Math.min(Math.max(num(a.withinDays) ?? 30, 1), 730);
      const [summary, expiring, expired] = await Promise.all([expirySummary(ctx), listBatches(ctx, { page: 1, pageSize: Math.min(num(a.limit) ?? 20, 50), expiryStatus: 'expiring', withinDays: days, includeZero: false }), listBatches(ctx, { page: 1, pageSize: 20, expiryStatus: 'expired', includeZero: false })]);
      const row = (b: (typeof expiring.items)[number]) => ({ productId: b.productId, name: b.productName, batch: b.batchNumber, expiry: b.expiryDate.slice(0, 10), daysToExpiry: b.daysToExpiry, qtyBase: b.qtyBase, mrp: money(b.mrpMinor) });
      return { data: { summary, expiringWithinDays: days, expiring: expiring.items.map(row), expired: expired.items.map(row) }, actions: [{ type: 'navigate', label: 'Open expiry', href: '/inventory?tab=expiry' }] };
    },
  },
  {
    declaration: { name: 'getStockOverview', description: 'Stock on hand for products matching a query at the current outlet (use searchMedicine for a single product).', parameters: OBJ({ query: { type: 'string' }, limit: { type: 'integer' } }) },
    permission: 'inventory.view',
    async run(ctx, a) {
      requireOutlet(ctx);
      const { items, meta } = await stockOverview(ctx, { page: 1, pageSize: Math.min(num(a.limit) ?? 15, 50), q: str(a.query) || undefined, onlyInStock: false, lowStock: false });
      return { data: { total: meta.total, rows: items.map((r) => ({ productId: r.productId, name: r.name, onHand: r.onHandBase, sellable: r.sellableBase, expired: r.expiredBase, nearExpiry: r.nearExpiryBase, baseUnit: r.baseUnit, batches: r.batchCount, valueAtCost: money(r.valuationCostMinor) })) } };
    },
  },
  {
    declaration: { name: 'searchCustomer', description: 'Find customers by name or phone.', parameters: OBJ({ query: { type: 'string' } }, ['query']) },
    permission: 'customers.view',
    async run(ctx, a) {
      const hits = await searchCustomers(ctx, str(a.query, 100), 8);
      return { data: hits.map((c) => ({ id: c.id, name: c.name, phone: c.phone, balance: money(c.balanceMinor), creditLimit: money(c.creditLimitMinor), email: c.email })) };
    },
  },
  {
    declaration: { name: 'getCustomerSummary', description: 'Balance (Baki), outstanding invoices with due dates, and recent invoices for one customer.', parameters: OBJ({ customerId: { type: 'string' } }, ['customerId']) },
    permission: 'customers.view',
    async run(ctx, a) {
      const id = str(a.customerId, 30);
      const c = await getCustomer(ctx, id);
      const canLedger = hasPermission(ctx, 'customers.viewLedger');
      const [outstanding, sales] = await Promise.all([canLedger ? outstandingDocuments(ctx, 'customer', id) : Promise.resolve([]), hasPermission(ctx, 'sales.view') ? customerSales(ctx, id, { page: 1, pageSize: 5 }) : Promise.resolve({ items: [] })]);
      return {
        data: { id: c.id, name: c.name, phone: c.phone, email: c.email, balance: money(c.balanceMinor), creditLimit: money(c.creditLimitMinor), creditDays: c.creditDays, outstanding: outstanding.map((d) => ({ invoice: d.number, date: d.date.slice(0, 10), total: money(d.totalMinor), balance: money(d.balanceMinor), dueDate: d.dueDate?.slice(0, 10) ?? null, overdue: d.overdue })), recentInvoices: sales.items.map((s) => ({ id: s.id, number: s.number, date: s.createdAt.slice(0, 10), total: money(s.totals.grandTotalMinor), balance: money(s.balanceMinor), status: s.paymentStatus })) },
        actions: [{ type: 'navigate', label: `Open ${c.name}`, href: `/customers/${c.id}` }],
      };
    },
  },
  {
    declaration: { name: 'getCustomerLedger', description: 'Recent ledger entries (debits, credits, running balance) for a customer.', parameters: OBJ({ customerId: { type: 'string' }, limit: { type: 'integer' } }, ['customerId']) },
    permission: 'customers.viewLedger',
    async run(ctx, a) {
      const { items } = await listLedger(ctx, 'customer', str(a.customerId, 30), { page: 1, pageSize: Math.min(num(a.limit) ?? 15, 50) });
      return { data: items.map((e) => ({ date: e.date.slice(0, 10), type: e.type, ref: e.refNumber, debit: money(e.debitMinor), credit: money(e.creditMinor), balanceAfter: money(e.balanceAfterMinor), note: e.note })) };
    },
  },
  {
    declaration: { name: 'searchSupplier', description: 'Find suppliers by name or GSTIN; includes payable balance.', parameters: OBJ({ query: { type: 'string' } }) },
    permission: 'suppliers.view',
    async run(ctx, a) {
      const { items } = await listSuppliers(ctx, { page: 1, pageSize: 8, q: str(a.query, 100) || undefined });
      return { data: items.map((s) => ({ id: s.id, name: s.name, gstin: s.gstin, phone: s.phone, payable: money(s.balanceMinor), termsDays: s.paymentTermsDays })) };
    },
  },
  {
    declaration: { name: 'getSupplierSummary', description: 'Payable balance, unpaid purchase invoices and recent purchases for one supplier.', parameters: OBJ({ supplierId: { type: 'string' } }, ['supplierId']) },
    permission: 'suppliers.view',
    async run(ctx, a) {
      const id = str(a.supplierId, 30);
      const s = await getSupplier(ctx, id);
      const [outstanding, purchases] = await Promise.all([hasPermission(ctx, 'suppliers.viewLedger') ? outstandingDocuments(ctx, 'supplier', id) : Promise.resolve([]), hasPermission(ctx, 'purchases.view') ? listPurchases(ctx, { page: 1, pageSize: 5, supplierId: id }) : Promise.resolve({ items: [] })]);
      return { data: { id: s.id, name: s.name, phone: s.phone, payable: money(s.balanceMinor), termsDays: s.paymentTermsDays, unpaid: outstanding.map((d) => ({ purchase: d.number, date: d.date.slice(0, 10), total: money(d.totalMinor), balance: money(d.balanceMinor), dueDate: d.dueDate?.slice(0, 10) ?? null, overdue: d.overdue })), recentPurchases: purchases.items.map((p) => ({ id: p.id, number: p.number, invoice: p.supplierInvoiceNumber, date: p.invoiceDate.slice(0, 10), total: money(p.totals.grandTotalMinor), status: p.status, paymentStatus: p.paymentStatus })) }, actions: [{ type: 'navigate', label: `Open ${s.name}`, href: `/suppliers/${s.id}` }] };
    },
  },
  {
    declaration: { name: 'searchSales', description: 'Find sales invoices by number, customer name/phone or date range at the current outlet.', parameters: OBJ({ query: { type: 'string' }, from: { type: 'string', description: 'YYYY-MM-DD' }, to: { type: 'string', description: 'YYYY-MM-DD' }, paymentStatus: { type: 'string', enum: ['paid', 'partial', 'credit'] }, limit: { type: 'integer' } }) },
    permission: 'sales.view',
    async run(ctx, a) {
      requireOutlet(ctx);
      const { items, meta } = await listSales(ctx, { page: 1, pageSize: Math.min(num(a.limit) ?? 10, 50), q: str(a.query) || undefined, from: date(a.from), to: date(a.to), paymentStatus: (str(a.paymentStatus) || undefined) as 'paid' | 'partial' | 'credit' | undefined });
      return { data: { total: meta.total, invoices: items.map((s) => ({ id: s.id, number: s.number, date: s.createdAt.slice(0, 10), customer: s.customer.name || 'Walk-in', items: s.lines.length, total: money(s.totals.grandTotalMinor), balance: money(s.balanceMinor), status: s.status, paymentStatus: s.paymentStatus })) } };
    },
  },
  {
    declaration: { name: 'getSale', description: 'Full detail of one invoice by id (lines, batches, payments).', parameters: OBJ({ saleId: { type: 'string' } }, ['saleId']) },
    permission: 'sales.view',
    async run(ctx, a) {
      const s = await getSale(ctx, str(a.saleId, 30));
      return { data: { id: s.id, number: s.number, date: s.createdAt, customer: s.customer, doctor: s.doctorName, status: s.status, paymentStatus: s.paymentStatus, total: money(s.totals.grandTotalMinor), paid: money(s.paidMinor), balance: money(s.balanceMinor), payments: s.payments.map((p) => ({ method: p.method, amount: money(p.amountMinor) })), lines: s.lines.map((l) => ({ product: l.productName, batch: l.batchNumber, qty: `${l.qty} ${l.unitName}`, rate: money(l.unitPriceMinor), total: money(l.totalMinor), returned: l.returnedBase })) }, actions: [{ type: 'navigate', label: `Open ${s.number}`, href: `/sales/${s.id}` }, { type: 'openDocument', label: 'Print invoice', documentType: 'saleInvoice', refId: s.id }] };
    },
  },
  {
    declaration: { name: 'searchPurchases', description: 'Find purchase invoices at the current outlet by number, supplier invoice or date range.', parameters: OBJ({ query: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' }, status: { type: 'string' }, limit: { type: 'integer' } }) },
    permission: 'purchases.view',
    async run(ctx, a) {
      requireOutlet(ctx);
      const { items, meta } = await listPurchases(ctx, { page: 1, pageSize: Math.min(num(a.limit) ?? 10, 50), q: str(a.query) || undefined, from: date(a.from), to: date(a.to), status: (str(a.status) || undefined) as 'draft' | 'confirmed' | 'partially_received' | 'received' | 'cancelled' | undefined });
      return { data: { total: meta.total, purchases: items.map((p) => ({ id: p.id, number: p.number, supplier: p.supplierName, supplierInvoice: p.supplierInvoiceNumber, date: p.invoiceDate.slice(0, 10), items: p.lines.length, total: money(p.totals.grandTotalMinor), balance: money(p.balanceMinor), status: p.status, paymentStatus: p.paymentStatus })) } };
    },
  },
  {
    declaration: { name: 'getBusinessSummary', description: 'Dashboard figures for a period at the current outlet: sales, invoices, collections, purchases, receivables, payables, low stock, expiry, top products, alerts. Use for "today\'s summary", "this month", comparisons.', parameters: OBJ({ from: { type: 'string', description: 'YYYY-MM-DD; default today' }, to: { type: 'string', description: 'YYYY-MM-DD; default today' } }) },
    permission: 'dashboard.view',
    async run(ctx, a) {
      requireOutlet(ctx);
      const today = new Date();
      const from = date(a.from) ?? new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const to = date(a.to) ?? new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
      const d = await dashboardSummary(ctx, { from, to });
      return {
        data: {
          period: d.period,
          sales: { revenue: money(d.sales.revenueMinor), invoices: d.sales.invoices, averageBill: money(d.sales.averageBillMinor), tax: money(d.sales.taxMinor), discounts: money(d.sales.discountMinor), returns: money(d.sales.returnsMinor), previousPeriodRevenue: money(d.sales.previousRevenueMinor) },
          purchases: { value: money(d.purchases.valueMinor), invoices: d.purchases.invoices },
          profit: d.profit ? { grossProfit: money(d.profit.grossProfitMinor), marginPercent: d.profit.marginBps / 100 } : undefined,
          receivables: { outstanding: money(d.receivables.outstandingMinor), overdue: money(d.receivables.overdueMinor), customers: d.receivables.customers },
          payables: { outstanding: money(d.payables.outstandingMinor), overdue: money(d.payables.overdueMinor), suppliers: d.payables.suppliers },
          inventory: d.inventory,
          today: { revenue: money(d.today.revenueMinor), invoices: d.today.invoices, collections: money(d.today.collectionsMinor) },
          paymentMix: d.paymentMix.map((p) => ({ method: p.method, amount: money(p.amountMinor) })),
          topProducts: d.topProducts.slice(0, 5).map((p) => ({ name: p.name, qty: p.qtyBase, revenue: money(p.revenueMinor) })),
          alerts: d.alerts,
        },
      };
    },
  },
  {
    declaration: { name: 'listReports', description: 'The reports this pharmacy can run, with keys to pass to runReport.', parameters: OBJ({}) },
    permission: 'reports.view',
    feature: 'reports',
    async run(ctx) {
      const canProfit = hasPermission(ctx, 'reports.viewProfit');
      return { data: REPORT_CATALOGUE.filter((r) => !r.sensitive || canProfit).map((r) => ({ key: r.key, label: r.label, group: r.group, needsDates: r.needsDates, description: r.description })) };
    },
  },
  {
    declaration: { name: 'runReport', description: 'Run a report (see listReports) for a date range and return up to 40 rows plus totals. Offer the user the "open report" action for the full version.', parameters: OBJ({ reportKey: { type: 'string' }, from: { type: 'string', description: 'YYYY-MM-DD' }, to: { type: 'string', description: 'YYYY-MM-DD' } }, ['reportKey']) },
    permission: 'reports.view',
    feature: 'reports',
    async run(ctx, a) {
      const key = str(a.reportKey, 60) as ReportKey;
      const meta = REPORT_CATALOGUE.find((r) => r.key === key);
      if (!meta) throw new Error(`Unknown report "${key}". Call listReports first.`);
      if (meta.sensitive && !hasPermission(ctx, 'reports.viewProfit')) throw new Error('The user is not allowed to see this report.');
      const r = await runReport(ctx, key, { from: date(a.from), to: date(a.to), limit: 40, format: 'json' });
      const moneyCols = new Set(r.columns.filter((c) => c.format === 'money').map((c) => c.key));
      const rows = r.rows.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, moneyCols.has(k) && typeof v === 'number' ? money(v) : v])));
      const totals = r.totals ? Object.fromEntries(Object.entries(r.totals).map(([k, v]) => [k, moneyCols.has(k) && typeof v === 'number' ? money(v) : v])) : undefined;
      return { data: { title: r.title, columns: r.columns.map((c) => c.label), rows, totals, rowCount: r.meta.rowCount, note: 'Money values are in rupees.' }, actions: [{ type: 'openReport', label: `Open ${r.title}`, reportKey: key, from: str(a.from) || undefined, to: str(a.to) || undefined }] };
    },
  },
  {
    declaration: { name: 'prepareSaleDraft', description: 'Price a bill without saving it: FEFO batches, GST, totals. Returns an action that opens the POS with these lines for the user to confirm. Use product ids from searchMedicine and the unit name the user asked for (e.g. "strip" or "tablet").', parameters: OBJ({ customerId: { type: 'string' }, lines: { type: 'array', items: OBJ({ productId: { type: 'string' }, unitName: { type: 'string' }, qty: { type: 'number' } }, ['productId', 'qty']) } }, ['lines']) },
    permission: 'sales.create',
    feature: 'automation',
    async run(ctx, a) {
      requireOutlet(ctx);
      const linesIn = Array.isArray(a.lines) ? (a.lines as Record<string, unknown>[]) : [];
      if (!linesIn.length) throw new Error('No lines given.');
      const lines: { productId: string; unitId: string; qty: number; discountBps: number; discountMinor: number; note: string }[] = [];
      const products: { id: string; name: string; units: { unitId: string; unitName: string; factorToBase: number; isDefaultSale: boolean; allowLooseSale: boolean; abbreviation: string; isDefaultPurchase: boolean }[]; packLabel: string; requiresPrescription: boolean; schedule: string; baseUnitId: string; pricingUnitId: string; pricing: { mrpMinor: number; sellingPriceMinor: number }; stockBase?: number }[] = [];
      for (const l of linesIn) {
        const pid = str(l.productId, 30);
        const hit = (await searchProducts(ctx, pid, 1, true)).find((p) => p.id === pid) ?? (await searchProducts(ctx, str(l.productId, 100), 5, true))[0];
        if (!hit) throw new Error(`Product ${pid} not found; call searchMedicine first.`);
        const wanted = str(l.unitName, 30).toLowerCase();
        const unit = hit.units.find((u) => u.unitName.toLowerCase() === wanted || u.abbreviation.toLowerCase() === wanted) ?? hit.units.find((u) => u.isDefaultSale) ?? hit.units[0]!;
        const qty = num(l.qty) ?? 1;
        lines.push({ productId: hit.id, unitId: unit.unitId, qty, discountBps: 0, discountMinor: 0, note: '' });
        products.push({ id: hit.id, name: hit.name, units: hit.units, packLabel: hit.packLabel, requiresPrescription: hit.requiresPrescription, schedule: hit.schedule, baseUnitId: hit.baseUnitId, pricingUnitId: hit.pricingUnitId, pricing: hit.pricing, stockBase: hit.stockBase });
      }
      const customerId = str(a.customerId, 30) || undefined;
      const quote = await quoteSale(ctx, { customerId, lines, billDiscountBps: 0, billDiscountMinor: 0 });
      const draft = { customerId: customerId ?? null, lines: lines.map((l, i) => ({ productId: l.productId, unitId: l.unitId, qty: l.qty, product: products[i] })) };
      return {
        data: { grandTotal: money(quote.totals.grandTotalMinor), tax: money(quote.totals.taxMinor), requiresPrescription: quote.requiresPrescription, warnings: quote.warnings, lines: quote.lines.map((q) => ({ product: q.productName, batch: q.batchNumber, expiry: q.expiryDate.slice(0, 10), qty: `${q.qty} ${q.unitName}`, rate: money(q.unitPriceMinor), total: money(q.totalMinor), availableBase: q.availableBase })) },
        actions: [{ type: 'openSaleDraft', label: `Open this bill in POS (₹${(quote.totals.grandTotalMinor / 100).toFixed(2)})`, draft }],
      };
    },
  },
  {
    declaration: { name: 'preparePurchaseDraft', description: 'Prepare a purchase entry the user will review in the purchase form (nothing is saved). Use product ids from searchMedicine and supplier id from searchSupplier.', parameters: OBJ({ supplierId: { type: 'string' }, invoiceNumber: { type: 'string' }, invoiceDate: { type: 'string' }, lines: { type: 'array', items: OBJ({ productId: { type: 'string' }, unitName: { type: 'string' }, qty: { type: 'number' }, freeQty: { type: 'number' }, batchNumber: { type: 'string' }, expiryDate: { type: 'string' }, purchasePrice: { type: 'number', description: 'rupees per pricing unit' }, mrp: { type: 'number' } }, ['productId', 'qty']) } }, ['lines']) },
    permission: 'purchases.create',
    feature: 'automation',
    async run(ctx, a) {
      const linesIn = Array.isArray(a.lines) ? (a.lines as Record<string, unknown>[]) : [];
      const out = [];
      for (const l of linesIn) {
        const pid = str(l.productId, 30);
        const hit = (await searchProducts(ctx, pid, 1, false)).find((p) => p.id === pid) ?? (await searchProducts(ctx, str(l.productId, 100), 5, false))[0];
        if (!hit) throw new Error(`Product ${pid} not found; call searchMedicine first.`);
        const wanted = str(l.unitName, 30).toLowerCase();
        const unit = hit.units.find((u) => u.unitName.toLowerCase() === wanted) ?? hit.units.find((u) => u.isDefaultPurchase) ?? hit.units.find((u) => u.unitId === hit.pricingUnitId) ?? hit.units[0]!;
        out.push({ productId: hit.id, productName: hit.name, packLabel: hit.packLabel, units: hit.units, pricingUnitId: hit.pricingUnitId, baseUnitId: hit.baseUnitId, taxRateBps: hit.tax.rateBps, cessBps: hit.tax.cessBps, unitId: unit.unitId, qty: num(l.qty) ?? 1, freeQty: num(l.freeQty) ?? 0, batchNumber: str(l.batchNumber, 40), expiryDate: str(l.expiryDate, 10), purchasePriceMinor: num(l.purchasePrice) !== undefined ? Math.round(num(l.purchasePrice)! * 100) : null, mrpMinor: num(l.mrp) !== undefined ? Math.round(num(l.mrp)! * 100) : hit.pricing.mrpMinor, sellingPriceMinor: hit.pricing.sellingPriceMinor });
      }
      const draft = { supplierId: str(a.supplierId, 30) || null, supplierInvoiceNumber: str(a.invoiceNumber, 60), invoiceDate: str(a.invoiceDate, 10), lines: out };
      return { data: { lines: out.map((l) => ({ product: l.productName, qty: l.qty, freeQty: l.freeQty, batch: l.batchNumber || '(missing)', expiry: l.expiryDate || '(missing)', rate: money(l.purchasePriceMinor), mrp: money(l.mrpMinor) })), missing: out.filter((l) => !l.batchNumber || !l.expiryDate || l.purchasePriceMinor === null).map((l) => l.productName) }, actions: [{ type: 'openPurchaseDraft', label: 'Review in purchase form', draft }] };
    },
  },
  {
    declaration: { name: 'proposePayment', description: 'Propose recording a payment from a customer or to a supplier. Nothing is recorded until the user confirms the button shown.', parameters: OBJ({ partyType: { type: 'string', enum: ['customer', 'supplier'] }, partyId: { type: 'string' }, amount: { type: 'number', description: 'rupees' }, method: { type: 'string', enum: ['cash', 'upi', 'card', 'bank_transfer', 'cheque', 'other'] } }, ['partyType', 'partyId', 'amount']) },
    permission: ['sales.collectPayment', 'purchases.pay'],
    feature: 'automation',
    async run(ctx, a) {
      const partyType = str(a.partyType, 10) === 'supplier' ? 'supplier' : 'customer';
      if (!hasPermission(ctx, partyType === 'customer' ? 'sales.collectPayment' : 'purchases.pay')) throw new Error('The user cannot record this kind of payment.');
      const id = str(a.partyId, 30);
      const party = partyType === 'customer' ? await getCustomer(ctx, id) : await getSupplier(ctx, id);
      const amount = num(a.amount);
      if (!amount || amount <= 0) throw new Error('Amount must be a positive number of rupees.');
      const amountMinor = Math.round(amount * 100);
      const method = ['cash', 'upi', 'card', 'bank_transfer', 'cheque', 'other'].includes(str(a.method, 20)) ? str(a.method, 20) : 'cash';
      return { data: { party: party.name, currentBalance: money(party.balanceMinor), amount, method, balanceAfter: money(party.balanceMinor - amountMinor) }, actions: [{ type: 'confirmPayment', label: `Record ₹${amount.toFixed(2)} ${partyType === 'customer' ? 'from' : 'to'} ${party.name}`, partyType, partyId: id, partyName: party.name, amountMinor, method }] };
    },
  },
  {
    declaration: { name: 'preparePrescriptionDraft', description: 'Prepare a prescription record (doctor + medicines) the user reviews and saves in the prescription form; nothing is saved. Use after reading a prescription image or when the user dictates one.', parameters: OBJ({ customerId: { type: 'string' }, doctorName: { type: 'string' }, doctorRegNo: { type: 'string' }, hospital: { type: 'string' }, prescriptionDate: { type: 'string', description: 'YYYY-MM-DD' }, diagnosis: { type: 'string' }, items: { type: 'array', items: OBJ({ medicine: { type: 'string' }, dosage: { type: 'string' }, duration: { type: 'string' } }, ['medicine']) } }, ['items']) },
    permission: 'prescriptions.manage',
    feature: 'automation',
    async run(ctx, a) {
      const rawItems = Array.isArray(a.items) ? (a.items as Record<string, unknown>[]).slice(0, 30) : [];
      const items: { medicine: string; dosage: string; duration: string; productId: string | null; productName: string | null }[] = [];
      for (const it of rawItems) {
        const medicine = str(it.medicine, 120);
        if (!medicine) continue;
        const hits = await searchProducts(ctx, medicine, 3, false);
        const exact = hits.find((h) => h.name.toLowerCase() === medicine.toLowerCase());
        const chosen = exact ?? (hits.length === 1 ? hits[0] : undefined);
        items.push({ medicine, dosage: str(it.dosage, 60), duration: str(it.duration, 60), productId: chosen?.id ?? null, productName: chosen?.name ?? null });
      }
      if (!items.length) throw new Error('At least one medicine is needed.');
      const draft = { customerId: str(a.customerId, 30) || null, doctorName: str(a.doctorName, 120), doctorRegNo: str(a.doctorRegNo, 60), hospital: str(a.hospital, 120), prescriptionDate: str(a.prescriptionDate, 10), diagnosis: str(a.diagnosis, 200), items };
      return { data: { doctor: draft.doctorName || '(missing)', items: items.map((i) => ({ medicine: i.medicine, linkedProduct: i.productName ?? '(not in catalogue)', dosage: i.dosage, duration: i.duration })) }, actions: [{ type: 'openPrescriptionDraft', label: 'Review in prescription form', draft }] };
    },
  },
  {
    declaration: { name: 'proposeEmailInvoice', description: 'Propose emailing an invoice PDF to the customer; the user confirms before it is sent.', parameters: OBJ({ saleId: { type: 'string' }, to: { type: 'string', description: 'email; defaults to the customer email' } }, ['saleId']) },
    permission: 'sales.email',
    feature: 'automation',
    async run(ctx, a) {
      const s = await getSale(ctx, str(a.saleId, 30));
      const to = str(a.to, 200) || s.customer.email;
      if (!to) return { data: { error: 'This customer has no email address. Ask the user for one.' } };
      return { data: { invoice: s.number, to }, actions: [{ type: 'confirmEmail', label: `Email ${s.number} to ${to}`, documentType: 'saleInvoice', refId: s.id, to, refNumber: s.number }] };
    },
  },
  {
    declaration: { name: 'openPage', description: 'Give the user a button to open a screen of the app. Known pages: dashboard, pos, sales, purchases, new-purchase, products, new-product, inventory, low-stock, expiry, batches, adjustments, transfers, customers, suppliers, prescriptions, reports, notifications, settings, templates, import.', parameters: OBJ({ page: { type: 'string' }, label: { type: 'string' } }, ['page']) },
    permission: 'dashboard.view',
    async run(_ctx, a) {
      const map: Record<string, string> = { dashboard: '/dashboard', pos: '/sales/pos', sales: '/sales', purchases: '/purchases', 'new-purchase': '/purchases/new', products: '/products', 'new-product': '/products/new', inventory: '/inventory', 'low-stock': '/inventory?tab=low-stock', expiry: '/inventory?tab=expiry', batches: '/inventory?tab=batches', adjustments: '/inventory?tab=adjustments', transfers: '/inventory?tab=transfers', customers: '/customers', suppliers: '/suppliers', prescriptions: '/prescriptions', reports: '/reports', notifications: '/notifications', settings: '/settings', templates: '/settings/templates', import: '/settings/data' };
      const href = map[str(a.page, 30).toLowerCase()];
      if (!href) throw new Error('Unknown page.');
      return { data: { href }, actions: [{ type: 'navigate', label: str(a.label, 40) || `Open ${str(a.page, 30)}`, href }] };
    },
  },
];

export function toolsFor(ctx: RequestContext, features: string[]): AiTool[] {
  return TOOLS.filter((t) => (Array.isArray(t.permission) ? t.permission.some((p) => hasPermission(ctx, p)) : hasPermission(ctx, t.permission)) && (!t.feature || features.includes(t.feature)));
}
