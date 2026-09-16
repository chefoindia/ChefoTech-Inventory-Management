import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import type { ExportEntity, ExportQuery } from '@pharmaos/shared';
import { ProductModel, type ProductDoc } from '@/models/product.model';
import { CustomerModel, type CustomerDoc } from '@/models/customer.model';
import { SupplierModel, type SupplierDoc } from '@/models/supplier.model';
import { SaleModel, type SaleDoc } from '@/models/sale.model';
import { PurchaseModel, type PurchaseDoc } from '@/models/purchase.model';
import { LedgerEntryModel, type LedgerEntryDoc } from '@/models/ledger-entry.model';
import { UnitModel, type UnitDoc } from '@/models/unit.model';
import { CategoryModel, type CategoryDoc } from '@/models/category.model';
import { OrganizationModel } from '@/models/organization.model';
import { OutletModel } from '@/models/outlet.model';
import { CustomFieldDefinitionModel } from '@/models/custom-field.model';
import { ProductBatchModel } from '@/models/product-batch.model';
import { GrnModel } from '@/models/grn.model';
import { SalesReturnModel } from '@/models/sales-return.model';
import { PurchaseReturnModel } from '@/models/purchase-return.model';
import { PartyPaymentModel } from '@/models/party-payment.model';
import { InventoryMovementModel } from '@/models/inventory-movement.model';
import type { RequestContext } from '@/lib/context';
import { hasPermission } from '@/lib/context';
import { orgFilter, outletFilter } from '@/lib/scoped';
import { ForbiddenError, ValidationError } from '@/lib/errors';
import { audit } from '@/services/audit.service';
import { stockOverview, listBatches, listMovements } from '@/modules/inventory/inventory.service';

const MAX_EXPORT_ROWS = 50_000;
const major = (minor: number | undefined | null) => ((minor ?? 0) / 100).toFixed(2);
const day = (d?: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : '');

/** Neutralise spreadsheet formula injection: cells starting with = + - @ get a leading apostrophe. */
function safeCell(v: unknown): unknown {
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(v)) return `'${v}`;
  return v;
}

export interface ExportResult {
  fileName: string;
  contentType: string;
  buffer: Buffer;
  rows: number;
}

async function buildRows(ctx: RequestContext, entity: ExportEntity, q: ExportQuery): Promise<{ headers: string[]; rows: unknown[][] }> {
  const showCost = hasPermission(ctx, 'products.viewCost');
  const dateRange = q.from || q.to ? { ...(q.from ? { $gte: q.from } : {}), ...(q.to ? { $lte: q.to } : {}) } : undefined;

  switch (entity) {
    case 'products': {
      if (!hasPermission(ctx, 'products.export')) throw new ForbiddenError();
      const [products, units, cats] = await Promise.all([
        ProductModel.find(orgFilter<ProductDoc>(ctx, { status: { $ne: 'archived' } })).sort({ nameNormalized: 1 }).limit(MAX_EXPORT_ROWS).lean<ProductDoc[]>(),
        UnitModel.find(orgFilter<UnitDoc>(ctx, {})).lean<UnitDoc[]>(),
        CategoryModel.find(orgFilter<CategoryDoc>(ctx, {})).lean<CategoryDoc[]>(),
      ]);
      const u = new Map(units.map((x) => [String(x._id), x.name]));
      const c = new Map(cats.map((x) => [String(x._id), x.path]));
      const headers = ['Name', 'Brand', 'Generic', 'Composition', 'Manufacturer', 'Category', 'Dosage form', 'Strength', 'Pack', 'HSN', 'GST %', 'Schedule', 'Base unit', 'Pack unit', 'Pack size', 'MRP', 'Selling price', ...(showCost ? ['Purchase price'] : []), 'Barcode', 'Reorder level', 'Rack', 'Status'];
      const rows = products.map((p) => {
        const pu = p.units.find((x) => String(x.unitId) === String(p.pricingUnitId));
        return [p.name, p.brandName, p.genericName, p.composition, p.manufacturer, p.categoryId ? c.get(String(p.categoryId)) ?? '' : '', p.dosageForm, p.strength, p.packLabel, p.hsnCode, ((p.tax?.rateBps ?? 0) / 100).toString(), p.schedule, u.get(String(p.baseUnitId)) ?? '', u.get(String(p.pricingUnitId)) ?? '', pu?.factorToBase ?? 1, major(p.pricing?.mrpMinor), major(p.pricing?.sellingPriceMinor), ...(showCost ? [major(p.pricing?.purchasePriceMinor)] : []), p.barcodes.find((b) => b.isPrimary)?.code ?? p.barcodes[0]?.code ?? '', p.stockRules?.reorderLevelBase ?? 0, p.rackLocation, p.status];
      });
      return { headers, rows };
    }
    case 'customers': {
      if (!hasPermission(ctx, 'customers.export')) throw new ForbiddenError();
      const list = await CustomerModel.find(orgFilter<CustomerDoc>(ctx, { status: { $ne: 'archived' } })).sort({ nameNormalized: 1 }).limit(MAX_EXPORT_ROWS).lean<CustomerDoc[]>();
      return {
        headers: ['Name', 'Phone', 'Email', 'Address', 'City', 'PIN', 'GSTIN', 'Credit limit', 'Outstanding', 'Total purchases', 'Last purchase', 'Status'],
        rows: list.map((x) => [x.name, x.phone, x.email, x.address?.line1 ?? '', x.address?.city ?? '', x.address?.pincode ?? '', x.gstin, major(x.creditLimitMinor), major(x.balanceMinor), major(x.totalPurchasesMinor), day(x.lastPurchaseAt), x.status]),
      };
    }
    case 'suppliers': {
      if (!hasPermission(ctx, 'suppliers.export')) throw new ForbiddenError();
      const list = await SupplierModel.find(orgFilter<SupplierDoc>(ctx, { status: { $ne: 'archived' } })).sort({ nameNormalized: 1 }).limit(MAX_EXPORT_ROWS).lean<SupplierDoc[]>();
      return {
        headers: ['Name', 'Contact', 'Phone', 'Email', 'GSTIN', 'State', 'Payment terms', 'Payable', 'Status'],
        rows: list.map((x) => [x.name, x.contactPerson, x.phone, x.email, x.gstin, x.stateCode, x.paymentTermsDays, major(x.balanceMinor), x.status]),
      };
    }
    case 'stock': {
      if (!hasPermission(ctx, 'reports.export')) throw new ForbiddenError();
      const { items } = await stockOverview(ctx, { page: 1, pageSize: 100, q: q.q, onlyInStock: false, lowStock: false });
      const canValue = hasPermission(ctx, 'inventory.viewValuation');
      return {
        headers: ['Product', 'Pack', 'Category', 'Base unit', 'On hand', 'Sellable', 'Expired', 'Near expiry', 'In transit', 'Reorder level', 'Low', 'Batches', 'Next expiry', ...(canValue ? ['Value (cost)', 'Value (MRP)'] : [])],
        rows: items.map((r) => [r.name, r.packLabel, r.categoryName, r.baseUnit, r.onHandBase, r.sellableBase, r.expiredBase, r.nearExpiryBase, r.inTransitBase, r.reorderLevelBase, r.isLow ? 'Yes' : '', r.batchCount, day(r.nextExpiry ? new Date(r.nextExpiry) : null), ...(canValue ? [major(r.valuationCostMinor), major(r.valuationMrpMinor)] : [])]),
      };
    }
    case 'batches': {
      if (!hasPermission(ctx, 'reports.export')) throw new ForbiddenError();
      const { items } = await listBatches(ctx, { page: 1, pageSize: 100, expiryStatus: 'all', includeZero: false, q: q.q });
      return {
        headers: ['Product', 'Batch', 'Expiry', 'Days to expiry', 'Qty (base)', 'MRP', 'Selling price', ...(showCost ? ['Purchase price'] : []), 'Supplier', 'Status'],
        rows: items.map((b) => [b.productName, b.batchNumber, day(new Date(b.expiryDate)), b.daysToExpiry, b.qtyBase, major(b.mrpMinor), major(b.sellingPriceMinor), ...(showCost ? [major(b.purchasePriceMinor)] : []), b.supplierName ?? '', b.isExpired ? 'expired' : b.status]),
      };
    }
    case 'movements': {
      if (!hasPermission(ctx, 'reports.export')) throw new ForbiddenError();
      const { items } = await listMovements(ctx, { page: 1, pageSize: 100, from: q.from, to: q.to });
      return {
        headers: ['Date', 'Product', 'Batch', 'Change', 'Balance after', 'Reason', 'Reference', 'User', 'Note'],
        rows: items.map((m) => [m.createdAt, m.productName, m.batchNumber, m.qtyBaseDelta, m.balanceAfterBase, m.reason, m.refNumber, m.user?.name ?? '', m.note]),
      };
    }
    case 'sales': {
      if (!hasPermission(ctx, 'reports.export')) throw new ForbiddenError();
      const list = await SaleModel.find(outletFilter<SaleDoc>(ctx, { status: { $ne: 'held' }, ...(dateRange ? { completedAt: dateRange } : {}) })).sort({ completedAt: -1 }).limit(MAX_EXPORT_ROWS).lean<SaleDoc[]>();
      return {
        headers: ['Invoice', 'Date', 'Status', 'Customer', 'Phone', 'GSTIN', 'Items', 'Subtotal', 'Discount', 'Taxable', 'CGST', 'SGST', 'IGST', 'Round off', 'Total', 'Paid', 'Balance', ...(showCost ? ['Cost', 'Profit'] : [])],
        rows: list.map((s) => {
          const cost = s.lines.reduce((a, l) => a + (l.costMinor ?? 0), 0);
          return [s.number, s.completedAt?.toISOString() ?? '', s.status, s.customerSnapshot?.name ?? '', s.customerSnapshot?.phone ?? '', s.customerSnapshot?.gstin ?? '', s.lines.length, major(s.totals.subtotalMinor), major(s.totals.itemDiscountMinor + s.totals.billDiscountMinor), major(s.totals.taxableMinor), major(s.totals.cgstMinor), major(s.totals.sgstMinor), major(s.totals.igstMinor), major(s.totals.roundOffMinor), major(s.totals.grandTotalMinor), major(s.paidMinor), major(s.balanceMinor), ...(showCost ? [major(cost), major(s.totals.taxableMinor - cost)] : [])];
        }),
      };
    }
    case 'purchases': {
      if (!hasPermission(ctx, 'reports.export') || !showCost) throw new ForbiddenError();
      const list = await PurchaseModel.find(outletFilter<PurchaseDoc>(ctx, { ...(dateRange ? { invoiceDate: dateRange } : {}) })).sort({ invoiceDate: -1 }).limit(MAX_EXPORT_ROWS).lean<PurchaseDoc[]>();
      return {
        headers: ['Number', 'Supplier invoice', 'Date', 'Due', 'Supplier', 'GSTIN', 'Status', 'Taxable', 'CGST', 'SGST', 'IGST', 'Other charges', 'Total', 'Paid', 'Balance'],
        rows: list.map((p) => [p.number, p.supplierInvoiceNumber, day(p.invoiceDate), day(p.dueDate), p.supplierSnapshot?.name ?? '', p.supplierSnapshot?.gstin ?? '', p.status, major(p.totals.taxableMinor), major(p.totals.cgstMinor), major(p.totals.sgstMinor), major(p.totals.igstMinor), major(p.totals.otherChargesMinor), major(p.totals.grandTotalMinor), major(p.paidMinor), major(p.balanceMinor)]),
      };
    }
    case 'ledger': {
      if (!q.partyId || !q.partyType) throw new ValidationError('partyType and partyId are required for ledger export');
      if (!hasPermission(ctx, q.partyType === 'customer' ? 'customers.viewLedger' : 'suppliers.viewLedger')) throw new ForbiddenError();
      const list = await LedgerEntryModel.find(orgFilter<LedgerEntryDoc>(ctx, { partyType: q.partyType, partyId: q.partyId, ...(dateRange ? { date: dateRange } : {}) })).sort({ date: 1, _id: 1 }).limit(MAX_EXPORT_ROWS).lean<LedgerEntryDoc[]>();
      return {
        headers: ['Date', 'Type', 'Reference', 'Debit', 'Credit', 'Balance', 'Note'],
        rows: list.map((e) => [e.date.toISOString(), e.type, e.refNumber, major(e.debitMinor), major(e.creditMinor), major(e.balanceAfterMinor), e.note]),
      };
    }
    default:
      throw new ValidationError('Unknown export');
  }
}

export async function exportEntity(ctx: RequestContext, entity: ExportEntity, q: ExportQuery): Promise<ExportResult> {
  const { headers, rows } = await buildRows(ctx, entity, q);
  const safeRows = rows.map((r) => r.map(safeCell));
  const stamp = new Date().toISOString().slice(0, 10);
  await audit(ctx, { action: 'data.exported', entityType: 'Export', summary: `Exported ${rows.length} ${entity} row(s) as ${q.format}` });
  if (q.format === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(entity);
    ws.addRow(headers).font = { bold: true };
    for (const r of safeRows) ws.addRow(r);
    ws.columns.forEach((col) => {
      col.width = Math.min(40, Math.max(10, ...(col.values ?? []).map((v) => String(v ?? '').length + 2)));
    });
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    return { fileName: `pharmaos-${entity}-${stamp}.xlsx`, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer, rows: rows.length };
  }
  const csv = Papa.unparse({ fields: headers, data: safeRows as unknown[][] });
  return { fileName: `pharmaos-${entity}-${stamp}.csv`, contentType: 'text/csv; charset=utf-8', buffer: Buffer.from('﻿' + csv, 'utf8'), rows: rows.length };
}

/* ---------------------------------------------------------------- organization bundle */

const BUNDLE_LIMIT = 100_000;

/**
 * Whole-organization JSON export for business continuity: every operational collection, all outlets,
 * capped per collection. Cost/purchase prices are stripped unless the caller may view them. Managed
 * MongoDB backups remain the disaster-recovery mechanism; this is the portable copy an owner can keep.
 */
export async function exportOrganization(ctx: RequestContext): Promise<{ fileName: string; contentType: string; buffer: Buffer; rows: number }> {
  const showCost = hasPermission(ctx, 'products.viewCost');
  const org = orgFilter(ctx);
  const [organization, outlets, units, categories, customFields, products, customers, suppliers, batches, sales, purchases, grns, salesReturns, purchaseReturns, payments, ledger, movements] = await Promise.all([
    OrganizationModel.findById(ctx.organizationId).lean(),
    OutletModel.find(org).lean(),
    UnitModel.find(org).lean(),
    CategoryModel.find(org).lean(),
    CustomFieldDefinitionModel.find(org).lean(),
    ProductModel.find(org).limit(BUNDLE_LIMIT).lean(),
    CustomerModel.find(org).limit(BUNDLE_LIMIT).lean(),
    SupplierModel.find(org).limit(BUNDLE_LIMIT).lean(),
    ProductBatchModel.find(org).limit(BUNDLE_LIMIT).lean(),
    SaleModel.find(org).sort({ createdAt: -1 }).limit(BUNDLE_LIMIT).lean(),
    PurchaseModel.find(org).sort({ createdAt: -1 }).limit(BUNDLE_LIMIT).lean(),
    GrnModel.find(org).sort({ createdAt: -1 }).limit(BUNDLE_LIMIT).lean(),
    SalesReturnModel.find(org).sort({ createdAt: -1 }).limit(BUNDLE_LIMIT).lean(),
    PurchaseReturnModel.find(org).sort({ createdAt: -1 }).limit(BUNDLE_LIMIT).lean(),
    PartyPaymentModel.find(org).sort({ createdAt: -1 }).limit(BUNDLE_LIMIT).lean(),
    LedgerEntryModel.find(org).sort({ date: -1 }).limit(BUNDLE_LIMIT).lean(),
    InventoryMovementModel.find(org).sort({ createdAt: -1 }).limit(BUNDLE_LIMIT).lean(),
  ]);
  const stripCost = <T extends Record<string, unknown>>(rows: T[], keys: string[]): T[] => (showCost ? rows : rows.map((r) => { const c = { ...r }; for (const k of keys) delete c[k]; return c; }));
  const bundle = {
    format: 'pharmaos.organization-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    organization,
    outlets,
    units,
    categories,
    customFields,
    products: stripCost(products as Record<string, unknown>[], []).map((p) => (showCost ? p : { ...p, pricing: { ...(p.pricing as Record<string, unknown>), purchasePriceMinor: undefined } })),
    customers,
    suppliers,
    batches: stripCost(batches as Record<string, unknown>[], ['purchasePriceMinor']),
    sales,
    purchases: showCost ? purchases : [],
    grns: showCost ? grns : [],
    salesReturns,
    purchaseReturns: showCost ? purchaseReturns : [],
    payments,
    ledger,
    movements: stripCost(movements as Record<string, unknown>[], ['unitCostMinor']),
  };
  const rows = Object.values(bundle).reduce<number>((s, v) => s + (Array.isArray(v) ? v.length : 0), 0);
  await audit(ctx, { action: 'data.exported', entityType: 'Export', summary: `Exported the whole organization (${rows} records)` });
  return { fileName: `pharmaos-organization-${new Date().toISOString().slice(0, 10)}.json`, contentType: 'application/json; charset=utf-8', buffer: Buffer.from(JSON.stringify(bundle)), rows };
}
