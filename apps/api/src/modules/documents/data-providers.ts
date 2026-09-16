import { Types, type Model } from 'mongoose';

type PartyLike = { _id: Types.ObjectId; name: string; phone?: string; email?: string; address?: { line1?: string; line2?: string; city?: string; state?: string; pincode?: string } | null; gstin?: string; stateCode?: string; balanceMinor?: number };
import type { BindingGroup, DocumentTemplateType } from '@pharmaos/shared';
import { formatMoneyPlain } from '@pharmaos/shared';
import { OrganizationModel, type OrganizationDoc } from '@/models/organization.model';
import { OutletModel, type OutletDoc } from '@/models/outlet.model';
import { SaleModel, type SaleDoc } from '@/models/sale.model';
import { PurchaseModel, type PurchaseDoc } from '@/models/purchase.model';
import { GrnModel, type GrnDoc } from '@/models/grn.model';
import { PartyPaymentModel, type PartyPaymentDoc } from '@/models/party-payment.model';
import { SalesReturnModel, type SalesReturnDoc } from '@/models/sales-return.model';
import { PurchaseReturnModel, type PurchaseReturnDoc } from '@/models/purchase-return.model';
import { StockTransferModel, type StockTransferDoc } from '@/models/stock-transfer.model';
import { StockAdjustmentModel, type StockAdjustmentDoc } from '@/models/stock-adjustment.model';
import { CustomerModel, type CustomerDoc } from '@/models/customer.model';
import { SupplierModel, type SupplierDoc } from '@/models/supplier.model';
import { LedgerEntryModel, type LedgerEntryDoc } from '@/models/ledger-entry.model';
import { ProductModel, type ProductDoc } from '@/models/product.model';
import type { RequestContext } from '@/lib/context';
import { orgFilter } from '@/lib/scoped';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { attachmentUrl } from '@/services/cloudinary.service';
import { userRefs } from '@/modules/common/refs';

/** Flat, template-friendly view of a document. Money values are pre-formatted strings; raw minor values keep the `Minor` suffix for conditions. */
export interface DocumentData {
  organization: Record<string, string>;
  outlet: Record<string, string>;
  document: Record<string, string | number | null>;
  customer?: Record<string, string>;
  supplier?: Record<string, string>;
  product?: Record<string, string>;
  totals: Record<string, string | number>;
  items: Record<string, string | number>[];
  payments: Record<string, string | number>[];
  taxSummary: Record<string, string | number>[];
  ledger: Record<string, string | number>[];
  transferLines: Record<string, string | number>[];
  adjustmentLines: Record<string, string | number>[];
  refType: string;
  refId: Types.ObjectId | null;
  refNumber: string;
  outletId: Types.ObjectId | null;
  emailTo?: string;
}

const money = (minor: number | undefined | null) => formatMoneyPlain(minor ?? 0);
const date = (d?: Date | string | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
const dateTime = (d?: Date | string | null) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const expiry = (d?: Date | string | null) => (d ? new Date(d).toLocaleDateString('en-IN', { month: '2-digit', year: '2-digit' }) : '');

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n]!;
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`;
}
function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return `${h ? ONES[h] + ' Hundred' : ''}${h && rest ? ' ' : ''}${rest ? twoDigits(rest) : ''}`;
}

/** Indian numbering system words for rupees and paise. */
export function amountInWords(minor: number): string {
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const rupees = Math.floor(abs / 100);
  const paise = abs % 100;
  if (rupees === 0 && paise === 0) return 'Zero Rupees';
  const parts: string[] = [];
  const crore = Math.floor(rupees / 10_000_000);
  const lakh = Math.floor((rupees % 10_000_000) / 100_000);
  const thousand = Math.floor((rupees % 100_000) / 1000);
  const rest = rupees % 1000;
  if (crore) parts.push(`${twoDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (rest) parts.push(threeDigits(rest));
  let out = parts.length ? `${parts.join(' ')} Rupees` : '';
  if (paise) out += `${out ? ' and ' : ''}${twoDigits(paise)} Paise`;
  return `${negative ? 'Minus ' : ''}${out} Only`;
}

function addressLine(a?: { line1?: string; line2?: string; city?: string; state?: string; pincode?: string } | null): string {
  return [a?.line1, a?.line2, a?.city, a?.state, a?.pincode].filter(Boolean).join(', ');
}

async function orgAndOutlet(ctx: RequestContext, outletId: Types.ObjectId | null) {
  const [org, outlet] = await Promise.all([
    OrganizationModel.findById(ctx.organizationId).lean<OrganizationDoc>(),
    outletId ? OutletModel.findById(outletId).lean<OutletDoc>() : null,
  ]);
  if (!org) throw new NotFoundError('Organization');
  const logoUrl = org.logo ? attachmentUrl(org.logo as never, { width: 300 }) : '';
  return {
    organization: {
      name: org.name,
      legalName: org.legalName || org.name,
      addressLine: addressLine(org.address),
      phone: org.phone ?? '',
      email: org.email ?? '',
      website: org.website ?? '',
      gstin: org.tax?.gstin ?? '',
      pan: org.tax?.pan ?? '',
      stateCode: org.tax?.stateCode ?? '',
      logoUrl,
    },
    outlet: {
      name: outlet?.name ?? '',
      code: outlet?.code ?? '',
      addressLine: addressLine(outlet?.address) || addressLine(org.address),
      phone: outlet?.phone || org.phone || '',
      email: outlet?.email || org.email || '',
      gstin: outlet?.gstin || org.tax?.gstin || '',
      drugLicenseNo: outlet?.drugLicenseNo ?? '',
      stateCode: outlet?.stateCode ?? '',
      invoiceFooterNote: outlet?.settings?.invoiceFooterNote ?? '',
      businessHours: outlet?.settings?.businessHours ?? '',
    },
  };
}

function totalsView(t: SaleDoc['totals']) {
  return {
    subtotal: money(t.subtotalMinor),
    discount: money(t.itemDiscountMinor + t.billDiscountMinor),
    discountMinor: t.itemDiscountMinor + t.billDiscountMinor,
    taxable: money(t.taxableMinor),
    cgst: money(t.cgstMinor),
    cgstMinor: t.cgstMinor,
    sgst: money(t.sgstMinor),
    sgstMinor: t.sgstMinor,
    igst: money(t.igstMinor),
    igstMinor: t.igstMinor,
    cess: money(t.cessMinor),
    tax: money(t.taxMinor),
    otherCharges: money(t.otherChargesMinor),
    roundOff: money(t.roundOffMinor),
    roundOffMinor: t.roundOffMinor,
    grandTotal: money(t.grandTotalMinor),
    grandTotalMinor: t.grandTotalMinor,
    grandTotalWords: amountInWords(t.grandTotalMinor),
  };
}

function taxSummaryFrom(lines: { taxRateBps?: number; taxableMinor?: number; cgstMinor?: number; sgstMinor?: number; igstMinor?: number }[]) {
  const map = new Map<number, { taxable: number; cgst: number; sgst: number; igst: number }>();
  for (const l of lines) {
    const r = l.taxRateBps ?? 0;
    const e = map.get(r) ?? { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    e.taxable += l.taxableMinor ?? 0;
    e.cgst += l.cgstMinor ?? 0;
    e.sgst += l.sgstMinor ?? 0;
    e.igst += l.igstMinor ?? 0;
    map.set(r, e);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([rate, v]) => ({ rate: rate / 100, taxable: v.taxable, cgst: v.cgst, sgst: v.sgst, igst: v.igst }));
}

function partyView(p: PartyLike | null | undefined, snapshot?: { name?: string; phone?: string; email?: string; gstin?: string; stateCode?: string } | null) {
  return {
    name: snapshot?.name || p?.name || '',
    phone: snapshot?.phone || p?.phone || '',
    email: snapshot?.email || p?.email || '',
    addressLine: addressLine(p?.address),
    gstin: snapshot?.gstin || p?.gstin || '',
    stateCode: snapshot?.stateCode || p?.stateCode || '',
  };
}

const qtyLabel = (qty: number, unit: string) => `${Number.isInteger(qty) ? qty : qty.toFixed(2)} ${unit}`;

/* ---------------------------------------------------------------- providers */

export async function saleData(ctx: RequestContext, saleId: string): Promise<DocumentData> {
  const sale = await SaleModel.findOne(orgFilter<SaleDoc>(ctx, { _id: saleId, status: { $ne: 'held' } })).lean<SaleDoc>();
  if (!sale) throw new NotFoundError('Invoice');
  const [base, customer, who] = await Promise.all([orgAndOutlet(ctx, sale.outletId), sale.customerId ? CustomerModel.findById(sale.customerId).lean<CustomerDoc>() : null, userRefs([sale.soldBy])]);
  return {
    ...base,
    refType: 'Sale',
    refId: sale._id,
    refNumber: sale.number,
    outletId: sale.outletId,
    emailTo: sale.customerSnapshot?.email || customer?.email || '',
    customer: partyView(customer, sale.customerSnapshot),
    document: {
      number: sale.number,
      date: date(sale.completedAt),
      dateTime: dateTime(sale.completedAt),
      status: sale.status,
      paid: money(sale.paidMinor),
      balance: money(sale.balanceMinor),
      credit: money(sale.creditMinor),
      dueDate: date(sale.dueDate),
      paymentMethods: [...new Set(sale.payments.map((p) => p.method.toUpperCase()))].join(', ') || 'CREDIT',
      doctorName: sale.doctorName ?? '',
      soldBy: who(sale.soldBy)?.name ?? '',
      notes: sale.notes ?? '',
      isInterState: sale.isInterState ? 'Inter-state supply' : '',
      cancelled: sale.status === 'cancelled' ? 'CANCELLED' : '',
    },
    totals: totalsView(sale.totals),
    items: sale.lines.map((l, i) => ({
      index: i + 1,
      productName: l.productName,
      packLabel: l.packLabel ?? '',
      hsnCode: l.hsnCode ?? '',
      batchNumber: l.batchNumber,
      expiry: expiry(l.expiryDate),
      qty: l.qty,
      unit: l.unitName ?? '',
      qtyLabel: qtyLabel(l.qty, l.unitName ?? ''),
      mrp: l.mrpPerUnitMinor ?? 0,
      rate: l.unitPriceMinor,
      discount: l.discountMinor ?? 0,
      taxRate: (l.taxRateBps ?? 0) / 100,
      taxable: l.taxableMinor ?? 0,
      tax: (l.cgstMinor ?? 0) + (l.sgstMinor ?? 0) + (l.igstMinor ?? 0) + (l.cessMinor ?? 0),
      amount: l.totalMinor ?? 0,
      schedule: l.schedule ?? '',
    })),
    payments: sale.payments.map((p) => ({ method: p.method.toUpperCase(), amount: p.amountMinor, reference: p.reference ?? '', date: date(p.receivedAt) })),
    taxSummary: taxSummaryFrom(sale.lines),
    ledger: [],
    transferLines: [],
    adjustmentLines: [],
  };
}

export async function purchaseData(ctx: RequestContext, purchaseId: string): Promise<DocumentData> {
  const p = await PurchaseModel.findOne(orgFilter<PurchaseDoc>(ctx, { _id: purchaseId })).lean<PurchaseDoc>();
  if (!p) throw new NotFoundError('Purchase');
  const [base, supplier] = await Promise.all([orgAndOutlet(ctx, p.outletId), SupplierModel.findById(p.supplierId).lean<SupplierDoc>()]);
  return {
    ...base,
    refType: 'Purchase',
    refId: p._id,
    refNumber: p.number,
    outletId: p.outletId,
    emailTo: supplier?.email ?? '',
    supplier: partyView(supplier, p.supplierSnapshot),
    document: { number: p.number, date: date(p.createdAt), supplierInvoiceNumber: p.supplierInvoiceNumber, invoiceDate: date(p.invoiceDate), dueDate: date(p.dueDate), status: p.status, paid: money(p.paidMinor), balance: money(p.balanceMinor), notes: p.notes ?? '' },
    totals: totalsView(p.totals),
    items: p.lines.map((l, i) => ({ index: i + 1, productName: l.productName, hsnCode: l.hsnCode ?? '', batchNumber: l.batchNumber, expiry: expiry(l.expiryDate), qty: l.qty, unit: l.unitName ?? '', qtyLabel: `${qtyLabel(l.qty, l.unitName ?? '')}${l.freeQty ? ` +${l.freeQty} free` : ''}`, mrp: l.mrpMinor, rate: l.purchasePriceMinor, discount: l.discountMinor ?? 0, taxRate: (l.taxRateBps ?? 0) / 100, taxable: l.taxableMinor ?? 0, amount: l.totalMinor ?? 0 })),
    payments: p.payments.map((x) => ({ method: x.method.toUpperCase(), amount: x.amountMinor, reference: x.reference ?? '', date: date(x.receivedAt) })),
    taxSummary: taxSummaryFrom(p.lines),
    ledger: [],
    transferLines: [],
    adjustmentLines: [],
  };
}

export async function grnData(ctx: RequestContext, grnId: string): Promise<DocumentData> {
  const g = await GrnModel.findOne(orgFilter<GrnDoc>(ctx, { _id: grnId })).lean<GrnDoc>();
  if (!g) throw new NotFoundError('GRN');
  const [base, supplier] = await Promise.all([orgAndOutlet(ctx, g.outletId), SupplierModel.findById(g.supplierId).lean<SupplierDoc>()]);
  return {
    ...base,
    refType: 'Grn',
    refId: g._id,
    refNumber: g.number,
    outletId: g.outletId,
    supplier: partyView(supplier),
    document: { number: g.number, date: date(g.receivedDate), purchaseNumber: g.purchaseNumber ?? '', status: g.status, notes: g.notes ?? '' },
    totals: {},
    items: g.lines.map((l, i) => ({ index: i + 1, productName: l.productName, batchNumber: l.batchNumber, expiry: expiry(l.expiryDate), ordered: qtyLabel(l.orderedQty, l.unitName ?? ''), received: qtyLabel(l.receivedQty, l.unitName ?? ''), free: l.freeQty ?? 0, damaged: l.damagedQty ?? 0, mrp: l.mrpMinor })),
    payments: [],
    taxSummary: [],
    ledger: [],
    transferLines: [],
    adjustmentLines: [],
  };
}

export async function paymentData(ctx: RequestContext, paymentId: string): Promise<DocumentData> {
  const p = await PartyPaymentModel.findOne(orgFilter<PartyPaymentDoc>(ctx, { _id: paymentId })).lean<PartyPaymentDoc>();
  if (!p) throw new NotFoundError('Payment');
  const PartyModel = (p.partyType === 'customer' ? CustomerModel : SupplierModel) as unknown as Model<PartyLike>;
  const [base, party, ledger] = await Promise.all([
    orgAndOutlet(ctx, p.outletId),
    PartyModel.findById(p.partyId).lean<PartyLike>(),
    LedgerEntryModel.findOne(orgFilter<LedgerEntryDoc>(ctx, { refType: 'PartyPayment', refId: p._id })).lean<LedgerEntryDoc>(),
  ]);
  return {
    ...base,
    refType: 'PartyPayment',
    refId: p._id,
    refNumber: p.number,
    outletId: p.outletId,
    emailTo: party?.email ?? '',
    customer: partyView(party),
    supplier: partyView(party),
    document: { number: p.number, date: date(p.date), amount: money(p.amountMinor), amountWords: amountInWords(p.amountMinor), method: p.method.toUpperCase(), reference: p.reference ?? '', balanceAfter: money(ledger?.balanceAfterMinor ?? 0), notes: p.notes ?? '' },
    totals: { grandTotal: money(p.amountMinor), grandTotalMinor: p.amountMinor },
    items: p.allocations.map((a, i) => ({ index: i + 1, documentNumber: a.documentNumber ?? '', amount: a.amountMinor })),
    payments: [],
    taxSummary: [],
    ledger: [],
    transferLines: [],
    adjustmentLines: [],
  };
}

export async function salesReturnData(ctx: RequestContext, id: string): Promise<DocumentData> {
  const r = await SalesReturnModel.findOne(orgFilter<SalesReturnDoc>(ctx, { _id: id })).lean<SalesReturnDoc>();
  if (!r) throw new NotFoundError('Sales return');
  const [base, customer] = await Promise.all([orgAndOutlet(ctx, r.outletId), r.customerId ? CustomerModel.findById(r.customerId).lean<CustomerDoc>() : null]);
  return {
    ...base,
    refType: 'SalesReturn',
    refId: r._id,
    refNumber: r.number,
    outletId: r.outletId,
    emailTo: customer?.email ?? '',
    customer: partyView(customer, { name: r.customerName }),
    document: { number: r.number, date: date(r.createdAt), referenceNumber: r.saleNumber ?? '', settlement: r.settlement === 'refund' ? `Refund (${r.refund?.method?.toUpperCase() ?? ''})` : 'Credit note', notes: r.notes ?? '' },
    totals: totalsView(r.totals),
    items: r.lines.map((l, i) => ({ index: i + 1, productName: l.productName, hsnCode: l.hsnCode ?? '', batchNumber: l.batchNumber, expiry: '', qty: l.qty, unit: l.unitName ?? '', qtyLabel: qtyLabel(l.qty, l.unitName ?? ''), mrp: 0, rate: l.unitPriceMinor, discount: 0, taxRate: (l.taxRateBps ?? 0) / 100, taxable: l.taxableMinor ?? 0, amount: l.totalMinor ?? 0 })),
    payments: r.refund ? [{ method: r.refund.method.toUpperCase(), amount: r.refund.amountMinor, reference: r.refund.reference ?? '', date: date(r.refund.receivedAt) }] : [],
    taxSummary: taxSummaryFrom(r.lines),
    ledger: [],
    transferLines: [],
    adjustmentLines: [],
  };
}

export async function purchaseReturnData(ctx: RequestContext, id: string): Promise<DocumentData> {
  const r = await PurchaseReturnModel.findOne(orgFilter<PurchaseReturnDoc>(ctx, { _id: id })).lean<PurchaseReturnDoc>();
  if (!r) throw new NotFoundError('Purchase return');
  const [base, supplier] = await Promise.all([orgAndOutlet(ctx, r.outletId), SupplierModel.findById(r.supplierId).lean<SupplierDoc>()]);
  return {
    ...base,
    refType: 'PurchaseReturn',
    refId: r._id,
    refNumber: r.number,
    outletId: r.outletId,
    emailTo: supplier?.email ?? '',
    supplier: partyView(supplier, { name: r.supplierName }),
    document: { number: r.number, date: date(r.createdAt), referenceNumber: r.purchaseNumber ?? '', settlement: r.settlement === 'refund' ? 'Refund' : 'Credit note', notes: r.notes ?? '' },
    totals: totalsView(r.totals),
    items: r.lines.map((l, i) => ({ index: i + 1, productName: l.productName, hsnCode: l.hsnCode ?? '', batchNumber: l.batchNumber, expiry: '', qty: l.qty, unit: l.unitName ?? '', qtyLabel: qtyLabel(l.qty, l.unitName ?? ''), mrp: 0, rate: l.unitPriceMinor, discount: 0, taxRate: (l.taxRateBps ?? 0) / 100, taxable: l.taxableMinor ?? 0, amount: l.totalMinor ?? 0 })),
    payments: [],
    taxSummary: taxSummaryFrom(r.lines),
    ledger: [],
    transferLines: [],
    adjustmentLines: [],
  };
}

export async function statementData(ctx: RequestContext, partyType: 'customer' | 'supplier', partyId: string, from?: Date, to?: Date): Promise<DocumentData> {
  const PartyModel = (partyType === 'customer' ? CustomerModel : SupplierModel) as unknown as Model<PartyLike>;
  const party = await PartyModel.findOne(orgFilter(ctx, { _id: partyId })).lean<PartyLike>();
  if (!party) throw new NotFoundError(partyType === 'customer' ? 'Customer' : 'Supplier');
  const base = await orgAndOutlet(ctx, ctx.outletId ?? null);
  const entries = await LedgerEntryModel.find(orgFilter<LedgerEntryDoc>(ctx, { partyType, partyId: party._id, ...(from || to ? { date: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } } : {}) })).sort({ date: 1, _id: 1 }).limit(2000).lean<LedgerEntryDoc[]>();
  return {
    ...base,
    refType: partyType === 'customer' ? 'Customer' : 'Supplier',
    refId: party._id,
    refNumber: party.name,
    outletId: ctx.outletId ?? null,
    emailTo: party.email ?? '',
    customer: partyView(party),
    supplier: partyView(party),
    document: { number: '', date: date(new Date()), periodFrom: from ? date(from) : 'Beginning', periodTo: to ? date(to) : date(new Date()), closingBalance: money(party.balanceMinor ?? 0) },
    totals: { grandTotal: money(party.balanceMinor ?? 0), grandTotalMinor: party.balanceMinor ?? 0 },
    items: [],
    payments: [],
    taxSummary: [],
    ledger: entries.map((e) => ({ date: date(e.date), type: e.type.replace('_', ' '), refNumber: e.refNumber ?? '', note: e.note ?? '', debit: e.debitMinor ?? 0, credit: e.creditMinor ?? 0, balance: e.balanceAfterMinor })),
    transferLines: [],
    adjustmentLines: [],
  };
}

export async function transferData(ctx: RequestContext, id: string): Promise<DocumentData> {
  const tr = await StockTransferModel.findOne(orgFilter<StockTransferDoc>(ctx, { _id: id })).lean<StockTransferDoc>();
  if (!tr) throw new NotFoundError('Transfer');
  const [base, outlets] = await Promise.all([orgAndOutlet(ctx, tr.fromOutletId), OutletModel.find(orgFilter<OutletDoc>(ctx, { _id: { $in: [tr.fromOutletId, tr.toOutletId] } })).lean<OutletDoc[]>()]);
  const name = (id: Types.ObjectId) => outlets.find((o) => String(o._id) === String(id))?.name ?? '';
  return {
    ...base,
    refType: 'StockTransfer',
    refId: tr._id,
    refNumber: tr.number,
    outletId: tr.fromOutletId,
    document: { number: tr.number, date: date(tr.createdAt), fromOutlet: name(tr.fromOutletId), toOutlet: name(tr.toOutletId), status: tr.status, requestedAt: date(tr.requestedAt), dispatchedAt: date(tr.dispatchedAt), receivedAt: date(tr.receivedAt), notes: tr.notes ?? '' },
    totals: {},
    items: [],
    payments: [],
    taxSummary: [],
    ledger: [],
    transferLines: tr.lines.map((l, i) => ({ index: i + 1, productName: l.productName, batchNumber: l.batchNumber, expiry: expiry(l.expiryDate), requested: l.qtyRequestedBase, dispatched: l.qtyDispatchedBase ?? 0, received: l.qtyReceivedBase ?? 0, note: l.discrepancyNote ?? '' })),
    adjustmentLines: [],
  };
}

export async function adjustmentData(ctx: RequestContext, id: string): Promise<DocumentData> {
  const a = await StockAdjustmentModel.findOne(orgFilter<StockAdjustmentDoc>(ctx, { _id: id })).lean<StockAdjustmentDoc>();
  if (!a) throw new NotFoundError('Adjustment');
  const [base, who] = await Promise.all([orgAndOutlet(ctx, a.outletId), userRefs([a.requestedBy, a.approvedBy])]);
  return {
    ...base,
    refType: 'StockAdjustment',
    refId: a._id,
    refNumber: a.number,
    outletId: a.outletId,
    document: { number: a.number, date: date(a.createdAt), type: a.type, reason: a.reason.replace(/_/g, ' '), status: a.status.replace('_', ' '), requestedBy: who(a.requestedBy)?.name ?? '', approvedBy: who(a.approvedBy)?.name ?? '', notes: a.notes ?? '' },
    totals: { grandTotal: money(a.totalValueMinor), grandTotalMinor: a.totalValueMinor ?? 0 },
    items: [],
    payments: [],
    taxSummary: [],
    ledger: [],
    transferLines: [],
    adjustmentLines: a.lines.map((l, i) => ({ index: i + 1, productName: l.productName, batchNumber: l.batchNumber, qty: `${l.qtyDelta > 0 ? '+' : ''}${l.qtyDelta} ${l.unitName ?? ''}`, value: l.valueMinor ?? 0, note: l.note ?? '' })),
  };
}

export async function barcodeLabelData(ctx: RequestContext, productId: string): Promise<DocumentData> {
  const p = await ProductModel.findOne(orgFilter<ProductDoc>(ctx, { _id: productId })).lean<ProductDoc>();
  if (!p) throw new NotFoundError('Product');
  const base = await orgAndOutlet(ctx, ctx.outletId ?? null);
  const code = p.barcodes.find((b) => b.isPrimary)?.code ?? p.barcodes[0]?.code ?? '';
  if (!code) throw new ValidationError('Product has no barcode; generate one first');
  return {
    ...base,
    refType: 'Product',
    refId: p._id,
    refNumber: p.name,
    outletId: ctx.outletId ?? null,
    product: { name: p.name, barcode: code, mrp: money(p.pricing?.mrpMinor), packLabel: p.packLabel ?? '', manufacturer: p.manufacturer ?? '' },
    document: { number: code, date: date(new Date()) },
    totals: {},
    items: [],
    payments: [],
    taxSummary: [],
    ledger: [],
    transferLines: [],
    adjustmentLines: [],
  };
}

/** Resolve the data provider for a template type + reference id. */
export async function dataFor(ctx: RequestContext, type: DocumentTemplateType, refId: string, opts: { from?: Date; to?: Date } = {}): Promise<DocumentData> {
  switch (type) {
    case 'saleInvoice':
    case 'saleReceipt':
      return saleData(ctx, refId);
    case 'purchaseInvoice':
      return purchaseData(ctx, refId);
    case 'grn':
      return grnData(ctx, refId);
    case 'paymentReceipt':
      return paymentData(ctx, refId);
    case 'salesReturn':
      return salesReturnData(ctx, refId);
    case 'purchaseReturn':
      return purchaseReturnData(ctx, refId);
    case 'customerStatement':
      return statementData(ctx, 'customer', refId, opts.from, opts.to);
    case 'supplierStatement':
      return statementData(ctx, 'supplier', refId, opts.from, opts.to);
    case 'stockTransfer':
      return transferData(ctx, refId);
    case 'stockAdjustment':
      return adjustmentData(ctx, refId);
    case 'barcodeLabel':
      return barcodeLabelData(ctx, refId);
    default:
      throw new ValidationError('Unsupported document type');
  }
}

/** Realistic sample data for the designer preview. */
export async function sampleData(ctx: RequestContext, type: DocumentTemplateType): Promise<DocumentData> {
  const base = await orgAndOutlet(ctx, ctx.outletId ?? null);
  const items = [
    { index: 1, productName: 'Montek LC Tablet', packLabel: '1x10', hsnCode: '3004', batchNumber: 'MLC2301', expiry: '03/27', qty: 2, unit: 'strip', qtyLabel: '2 strip', mrp: 18_500, rate: 18_500, discount: 1_850, taxRate: 12, taxable: 31_384, tax: 3_766, amount: 35_150, schedule: 'H', ordered: '2 strip', received: '2 strip', free: 0, damaged: 0 },
    { index: 2, productName: 'Crocin Advance 500', packLabel: '1x15', hsnCode: '3004', batchNumber: 'CR9981', expiry: '11/26', qty: 3, unit: 'tab', qtyLabel: '3 tab', mrp: 240, rate: 240, discount: 0, taxRate: 12, taxable: 643, tax: 77, amount: 720, schedule: 'none', ordered: '3 tab', received: '3 tab', free: 0, damaged: 0 },
    { index: 3, productName: 'Betadine Ointment 20g', packLabel: '1 tube', hsnCode: '3004', batchNumber: 'BT5520', expiry: '08/27', qty: 1, unit: 'tube', qtyLabel: '1 tube', mrp: 12_500, rate: 12_500, discount: 0, taxRate: 12, taxable: 11_161, tax: 1_339, amount: 12_500, schedule: 'none', ordered: '1 tube', received: '1 tube', free: 0, damaged: 0 },
  ];
  const totals = { subtotalMinor: 50_220, itemDiscountMinor: 1_850, billDiscountMinor: 0, taxableMinor: 43_188, cgstMinor: 2_591, sgstMinor: 2_591, igstMinor: 0, cessMinor: 0, taxMinor: 5_182, otherChargesMinor: 0, roundOffMinor: 30, grandTotalMinor: 48_400 };
  return {
    ...base,
    refType: 'Sample',
    refId: null,
    refNumber: 'SAMPLE',
    outletId: ctx.outletId ?? null,
    customer: { name: 'Ravi Kumar', phone: '98765 43210', email: 'ravi@example.com', addressLine: '12 MG Road, Pune, 411001', gstin: '', stateCode: '27' },
    supplier: { name: 'Medico Distributors', phone: '98765 00000', email: 'orders@medico.example', addressLine: 'Plot 4, MIDC, Pune', gstin: '27ABCDE1234F1Z5', stateCode: '27' },
    product: { name: 'Montek LC Tablet', barcode: '8901234567890', mrp: money(18_500), packLabel: '1x10', manufacturer: 'Sun Pharma' },
    document: { number: type === 'grn' ? 'GRN-000042' : type === 'purchaseInvoice' ? 'PI-000042' : type === 'paymentReceipt' ? 'RCPT-000042' : 'INV-000042', date: date(new Date()), dateTime: dateTime(new Date()), status: 'completed', paid: money(48_400), balance: money(0), credit: money(0), dueDate: '', paymentMethods: 'CASH, UPI', doctorName: 'Dr. A. Mehta', soldBy: 'Counter 1', notes: '', supplierInvoiceNumber: 'MD/2026/1187', invoiceDate: date(new Date()), purchaseNumber: 'PI-000042', amount: money(48_400), amountWords: amountInWords(48_400), method: 'UPI', reference: 'UPI-4411', balanceAfter: money(0), referenceNumber: 'INV-000040', settlement: 'Refund (CASH)', periodFrom: '01 Apr 2026', periodTo: date(new Date()), closingBalance: money(12_500), fromOutlet: 'Main Store', toOutlet: 'Andheri Branch', requestedAt: date(new Date()), dispatchedAt: date(new Date()), receivedAt: '', type: 'damage', reason: 'breakage', requestedBy: 'Asha', approvedBy: 'Owner', isInterState: '', cancelled: '' },
    totals: totalsView(totals),
    items,
    payments: [{ method: 'CASH', amount: 30_000, reference: '', date: date(new Date()) }, { method: 'UPI', amount: 18_400, reference: 'UPI-4411', date: date(new Date()) }],
    taxSummary: [{ rate: 12, taxable: 43_188, cgst: 2_591, sgst: 2_591, igst: 0 }],
    ledger: [{ date: '01 Apr 2026', type: 'opening', refNumber: '', note: 'Opening balance', debit: 5_000_00, credit: 0, balance: 5_000_00 }, { date: '03 Apr 2026', type: 'sale', refNumber: 'INV-000040', note: 'Credit', debit: 48_400, credit: 0, balance: 548_400 }, { date: '10 Apr 2026', type: 'payment', refNumber: 'RCPT-000012', note: 'UPI', debit: 0, credit: 300_000, balance: 248_400 }],
    transferLines: items.map((i) => ({ index: i.index, productName: i.productName, batchNumber: i.batchNumber, expiry: i.expiry, requested: i.qty * 10, dispatched: i.qty * 10, received: i.qty * 10, note: '' })),
    adjustmentLines: items.map((i) => ({ index: i.index, productName: i.productName, batchNumber: i.batchNumber, qty: `-${i.qty} ${i.unit}`, value: i.amount, note: 'Breakage' })),
  };
}

/** Binding catalogue for the designer. */
export const BINDING_GROUPS: BindingGroup[] = [
  { group: 'Organization', bindings: ['name', 'legalName', 'addressLine', 'phone', 'email', 'website', 'gstin', 'pan'].map((k) => ({ key: `organization.${k}`, label: k })) },
  { group: 'Outlet', bindings: ['name', 'code', 'addressLine', 'phone', 'email', 'gstin', 'drugLicenseNo', 'invoiceFooterNote', 'businessHours'].map((k) => ({ key: `outlet.${k}`, label: k })) },
  { group: 'Document', bindings: ['number', 'date', 'dateTime', 'status', 'paid', 'balance', 'credit', 'dueDate', 'paymentMethods', 'doctorName', 'soldBy', 'notes', 'supplierInvoiceNumber', 'invoiceDate', 'purchaseNumber', 'amount', 'amountWords', 'method', 'reference', 'balanceAfter', 'referenceNumber', 'settlement', 'periodFrom', 'periodTo', 'closingBalance', 'fromOutlet', 'toOutlet', 'cancelled'].map((k) => ({ key: `document.${k}`, label: k })) },
  { group: 'Customer', bindings: ['name', 'phone', 'email', 'addressLine', 'gstin', 'stateCode'].map((k) => ({ key: `customer.${k}`, label: k })) },
  { group: 'Supplier', bindings: ['name', 'phone', 'email', 'addressLine', 'gstin', 'stateCode'].map((k) => ({ key: `supplier.${k}`, label: k })) },
  { group: 'Totals', bindings: ['subtotal', 'discount', 'taxable', 'cgst', 'sgst', 'igst', 'cess', 'tax', 'otherCharges', 'roundOff', 'grandTotal', 'grandTotalWords'].map((k) => ({ key: `totals.${k}`, label: k })) },
  { group: 'Product (labels)', bindings: ['name', 'barcode', 'mrp', 'packLabel', 'manufacturer'].map((k) => ({ key: `product.${k}`, label: k })) },
];

export const TABLE_COLUMN_CATALOGUE: Record<string, { key: string; label: string; format: 'text' | 'money' | 'qty' | 'date' | 'percent' | 'index' }[]> = {
  items: [
    { key: 'index', label: '#', format: 'index' },
    { key: 'productName', label: 'Item', format: 'text' },
    { key: 'packLabel', label: 'Pack', format: 'text' },
    { key: 'hsnCode', label: 'HSN', format: 'text' },
    { key: 'batchNumber', label: 'Batch', format: 'text' },
    { key: 'expiry', label: 'Expiry', format: 'text' },
    { key: 'qtyLabel', label: 'Qty', format: 'text' },
    { key: 'mrp', label: 'MRP', format: 'money' },
    { key: 'rate', label: 'Rate', format: 'money' },
    { key: 'discount', label: 'Discount', format: 'money' },
    { key: 'taxRate', label: 'GST %', format: 'percent' },
    { key: 'taxable', label: 'Taxable', format: 'money' },
    { key: 'tax', label: 'Tax', format: 'money' },
    { key: 'amount', label: 'Amount', format: 'money' },
    { key: 'schedule', label: 'Schedule', format: 'text' },
    { key: 'ordered', label: 'Ordered', format: 'text' },
    { key: 'received', label: 'Received', format: 'text' },
    { key: 'free', label: 'Free', format: 'text' },
    { key: 'damaged', label: 'Damaged', format: 'text' },
    { key: 'documentNumber', label: 'Invoice', format: 'text' },
  ],
  payments: [
    { key: 'method', label: 'Method', format: 'text' },
    { key: 'amount', label: 'Amount', format: 'money' },
    { key: 'reference', label: 'Reference', format: 'text' },
    { key: 'date', label: 'Date', format: 'text' },
  ],
  taxSummary: [
    { key: 'rate', label: 'GST %', format: 'percent' },
    { key: 'taxable', label: 'Taxable', format: 'money' },
    { key: 'cgst', label: 'CGST', format: 'money' },
    { key: 'sgst', label: 'SGST', format: 'money' },
    { key: 'igst', label: 'IGST', format: 'money' },
  ],
  ledger: [
    { key: 'date', label: 'Date', format: 'text' },
    { key: 'type', label: 'Type', format: 'text' },
    { key: 'refNumber', label: 'Reference', format: 'text' },
    { key: 'note', label: 'Note', format: 'text' },
    { key: 'debit', label: 'Debit', format: 'money' },
    { key: 'credit', label: 'Credit', format: 'money' },
    { key: 'balance', label: 'Balance', format: 'money' },
  ],
  transferLines: [
    { key: 'index', label: '#', format: 'index' },
    { key: 'productName', label: 'Item', format: 'text' },
    { key: 'batchNumber', label: 'Batch', format: 'text' },
    { key: 'expiry', label: 'Expiry', format: 'text' },
    { key: 'requested', label: 'Requested', format: 'text' },
    { key: 'dispatched', label: 'Dispatched', format: 'text' },
    { key: 'received', label: 'Received', format: 'text' },
    { key: 'note', label: 'Note', format: 'text' },
  ],
  adjustmentLines: [
    { key: 'index', label: '#', format: 'index' },
    { key: 'productName', label: 'Item', format: 'text' },
    { key: 'batchNumber', label: 'Batch', format: 'text' },
    { key: 'qty', label: 'Change', format: 'text' },
    { key: 'value', label: 'Value', format: 'money' },
    { key: 'note', label: 'Note', format: 'text' },
  ],
};
