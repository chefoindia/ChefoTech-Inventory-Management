import type { DocumentTotals } from '../tax';
import type { AttachmentRef } from './api';
import type { PaymentMethod } from '../constants/enums';

export interface PaymentDto {
  method: PaymentMethod;
  amountMinor: number;
  reference: string;
  receivedAt: string;
}

export interface UserRef {
  id: string;
  name: string;
}

/* ---------------------------------------------------------------- purchases */

export interface PurchaseLineDto {
  lineId: string;
  productId: string;
  productName: string;
  packLabel: string;
  hsnCode: string;
  unitId: string;
  unitName: string;
  factorToBase: number;
  qty: number;
  freeQty: number;
  qtyBase: number;
  freeQtyBase: number;
  receivedBase: number;
  damagedBase: number;
  batchNumber: string;
  mfgDate: string | null;
  expiryDate: string;
  purchasePriceMinor: number;
  mrpMinor: number;
  sellingPriceMinor: number;
  discountBps: number;
  discountMinor: number;
  schemeNote: string;
  taxRateBps: number;
  cessBps: number;
  grossMinor: number;
  taxableMinor: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
  cessMinor: number;
  totalMinor: number;
}

export interface PurchaseDto {
  id: string;
  number: string;
  outletId: string;
  supplierId: string;
  supplierName: string;
  supplierGstin: string;
  supplierInvoiceNumber: string;
  invoiceDate: string;
  dueDate: string | null;
  status: 'draft' | 'confirmed' | 'partially_received' | 'received' | 'cancelled';
  lines: PurchaseLineDto[];
  totals: DocumentTotals;
  otherChargesNote: string;
  isInterState: boolean;
  paidMinor: number;
  balanceMinor: number;
  paymentStatus: 'unpaid' | 'partial' | 'paid';
  payments: PaymentDto[];
  grnIds: string[];
  attachments: AttachmentRef[];
  notes: string;
  customFields: Record<string, unknown>;
  createdBy: UserRef | null;
  cancelledBy: UserRef | null;
  cancelReason: string;
  createdAt: string;
}

export interface GrnLineDto {
  purchaseLineId: string;
  productId: string;
  productName: string;
  unitName: string;
  factorToBase: number;
  orderedQty: number;
  receivedQty: number;
  freeQty: number;
  damagedQty: number;
  shortQty: number;
  receivedBase: number;
  batchId: string | null;
  batchNumber: string;
  expiryDate: string;
  mrpMinor: number;
  purchasePriceMinor: number;
  note: string;
}

export interface GrnDto {
  id: string;
  number: string;
  outletId: string;
  purchaseId: string;
  purchaseNumber: string;
  supplierId: string;
  supplierName: string;
  receivedDate: string;
  status: 'draft' | 'confirmed';
  lines: GrnLineDto[];
  attachments: AttachmentRef[];
  notes: string;
  receivedBy: UserRef | null;
  confirmedBy: UserRef | null;
  confirmedAt: string | null;
  createdAt: string;
}

export interface PurchaseReturnLineDto {
  productId: string;
  productName: string;
  batchId: string;
  batchNumber: string;
  unitName: string;
  qty: number;
  qtyBase: number;
  unitPriceMinor: number;
  taxRateBps: number;
  taxableMinor: number;
  taxMinor: number;
  totalMinor: number;
  reason: string;
  note: string;
}

export interface PurchaseReturnDto {
  id: string;
  number: string;
  outletId: string;
  supplierId: string;
  supplierName: string;
  purchaseId: string | null;
  purchaseNumber: string;
  status: 'completed' | 'cancelled';
  lines: PurchaseReturnLineDto[];
  totals: DocumentTotals;
  settlement: 'credit_note' | 'refund';
  refund: PaymentDto | null;
  notes: string;
  attachments: AttachmentRef[];
  createdBy: UserRef | null;
  createdAt: string;
}

/* ---------------------------------------------------------------- sales */

export interface SaleLineDto {
  lineId: string;
  productId: string;
  productName: string;
  packLabel: string;
  hsnCode: string;
  schedule: string;
  batchId: string;
  batchNumber: string;
  expiryDate: string;
  unitId: string;
  unitName: string;
  factorToBase: number;
  qty: number;
  qtyBase: number;
  /** Per selling unit, tax-inclusive when prices include tax. */
  unitPriceMinor: number;
  mrpPerUnitMinor: number;
  discountBps: number;
  discountMinor: number;
  taxRateBps: number;
  cessBps: number;
  grossMinor: number;
  taxableMinor: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
  cessMinor: number;
  totalMinor: number;
  /** COGS; only when the caller may view cost. */
  costMinor?: number;
  returnedBase: number;
  note: string;
}

export interface SaleDto {
  id: string;
  number: string;
  outletId: string;
  outletName: string;
  status: 'completed' | 'cancelled' | 'held';
  customerId: string | null;
  customer: { name: string; phone: string; email: string; gstin: string; stateCode: string };
  prescriptionIds: string[];
  doctorName: string;
  lines: SaleLineDto[];
  totals: DocumentTotals;
  isInterState: boolean;
  payments: PaymentDto[];
  paidMinor: number;
  creditMinor: number;
  balanceMinor: number;
  refundedMinor: number;
  paymentStatus: 'paid' | 'partial' | 'credit';
  dueDate: string | null;
  soldBy: UserRef | null;
  cancelledBy: UserRef | null;
  cancelReason: string;
  cancelledAt: string | null;
  notes: string;
  label: string;
  customFields: Record<string, unknown>;
  emailStatus: 'none' | 'queued' | 'sent' | 'failed';
  emailedTo: string;
  profitMinor?: number;
  createdAt: string;
}

export interface SaleQuoteDto {
  lines: (Omit<SaleLineDto, 'returnedBase' | 'lineId'> & { lineIndex: number; availableBase: number })[];
  totals: DocumentTotals;
  isInterState: boolean;
  warnings: string[];
  customerBalanceMinor: number;
  creditLimitMinor: number;
  requiresPrescription: boolean;
}

export interface SalesReturnLineDto {
  saleLineId: string;
  productId: string;
  productName: string;
  batchId: string;
  batchNumber: string;
  unitName: string;
  qty: number;
  qtyBase: number;
  unitPriceMinor: number;
  taxRateBps: number;
  taxableMinor: number;
  taxMinor: number;
  totalMinor: number;
  condition: 'resaleable' | 'damaged' | 'expired';
  reason: string;
  note: string;
}

export interface SalesReturnDto {
  id: string;
  number: string;
  outletId: string;
  saleId: string;
  saleNumber: string;
  customerId: string | null;
  customerName: string;
  status: 'completed' | 'cancelled';
  lines: SalesReturnLineDto[];
  totals: DocumentTotals;
  settlement: 'refund' | 'credit_note';
  refund: PaymentDto | null;
  notes: string;
  createdBy: UserRef | null;
  createdAt: string;
}

export interface HeldSaleSummary {
  id: string;
  label: string;
  customerName: string;
  lineCount: number;
  estimatedTotalMinor: number;
  heldBy: UserRef | null;
  createdAt: string;
}
