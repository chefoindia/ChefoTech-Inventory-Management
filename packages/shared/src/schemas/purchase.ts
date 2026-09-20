import { z } from 'zod';
import { objectIdSchema, paginationQuerySchema } from './common';
import { attachmentRefSchema } from './attachment';
import { paymentLineSchema } from './party';
import { customFieldValuesSchema, barcodeLabelSchema } from './product';

export const purchaseLineSchema = z.object({
  productId: objectIdSchema,
  unitId: objectIdSchema,
  qty: z.number().positive(),
  freeQty: z.number().min(0).default(0),
  batchNumber: z.string().trim().min(1).max(40),
  mfgDate: z.coerce.date().optional(),
  expiryDate: z.coerce.date(),
  /** Per pricing unit of the product. */
  purchasePriceMinor: z.number().int().min(0),
  mrpMinor: z.number().int().min(0),
  sellingPriceMinor: z.number().int().min(0).optional(),
  discountBps: z.number().int().min(0).max(10_000).default(0),
  discountMinor: z.number().int().min(0).default(0),
  schemeNote: z.string().trim().max(120).optional().default(''),
  taxRateBps: z.number().int().min(0).max(10_000).optional(),
  cessBps: z.number().int().min(0).max(10_000).optional(),
  /**
   * Optional barcode labels for the packs on this line. Only meaningful with receiveNow, where
   * the stock is received inline and there is no separate goods receipt to capture them in.
   */
  barcodes: z.array(barcodeLabelSchema).max(500).default([]),
});
export type PurchaseLineInput = z.infer<typeof purchaseLineSchema>;

export const createPurchaseSchema = z.object({
  supplierId: objectIdSchema,
  supplierInvoiceNumber: z.string().trim().min(1).max(60),
  invoiceDate: z.coerce.date(),
  dueDate: z.coerce.date().optional(),
  lines: z.array(purchaseLineSchema).min(1).max(300),
  billDiscountBps: z.number().int().min(0).max(10_000).default(0),
  billDiscountMinor: z.number().int().min(0).default(0),
  otherChargesMinor: z.number().int().min(0).default(0),
  otherChargesNote: z.string().trim().max(120).optional().default(''),
  /** Round the grand total to the nearest rupee. */
  roundOff: z.boolean().default(true),
  payments: z.array(paymentLineSchema).max(5).default([]),
  /** Create + confirm + receive everything in one step (small pharmacies). */
  receiveNow: z.boolean().default(false),
  attachments: z.array(attachmentRefSchema).max(5).default([]),
  notes: z.string().trim().max(1000).optional().default(''),
  customFields: customFieldValuesSchema,
  /** Client-computed grand total; the server recomputes and rejects a mismatch (catches stale prices). */
  expectedGrandTotalMinor: z.number().int().optional(),
});
export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;

export const updatePurchaseSchema = createPurchaseSchema.omit({ receiveNow: true, payments: true }).partial();
export type UpdatePurchaseInput = z.infer<typeof updatePurchaseSchema>;

export const purchaseListQuerySchema = paginationQuerySchema.extend({
  supplierId: objectIdSchema.optional(),
  status: z.enum(['draft', 'confirmed', 'partially_received', 'received', 'cancelled']).optional(),
  paymentStatus: z.enum(['unpaid', 'partial', 'paid']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type PurchaseListQuery = z.infer<typeof purchaseListQuerySchema>;

/* ---------------------------------------------------------------- GRN */

export const grnLineSchema = z.object({
  purchaseLineId: z.string().min(1),
  /** In the purchase line's unit. */
  receivedQty: z.number().min(0),
  freeQty: z.number().min(0).default(0),
  damagedQty: z.number().min(0).default(0),
  batchNumber: z.string().trim().min(1).max(40).optional(),
  expiryDate: z.coerce.date().optional(),
  mfgDate: z.coerce.date().optional(),
  mrpMinor: z.number().int().min(0).optional(),
  sellingPriceMinor: z.number().int().min(0).optional(),
  /**
   * Barcode label ids for the physical packs arriving on this line — one per strip/box, so a
   * later scan resolves to this exact batch and its prices. Optional: a pharmacy that does not
   * label packs simply receives without them.
   */
  barcodes: z.array(barcodeLabelSchema).max(500).default([]),
  note: z.string().trim().max(200).optional().default(''),
});

export const createGrnSchema = z.object({
  purchaseId: objectIdSchema,
  receivedDate: z.coerce.date().optional(),
  lines: z.array(grnLineSchema).min(1),
  attachments: z.array(attachmentRefSchema).max(5).default([]),
  notes: z.string().trim().max(1000).optional().default(''),
  /** Confirm immediately (adds stock). Otherwise saved as draft for a checker. */
  confirm: z.boolean().default(true),
});
export type CreateGrnInput = z.infer<typeof createGrnSchema>;

/* ---------------------------------------------------------------- purchase returns */

export const purchaseReturnLineSchema = z.object({
  productId: objectIdSchema,
  batchId: objectIdSchema,
  unitId: objectIdSchema,
  qty: z.number().positive(),
  reason: z.enum(['expired', 'damaged', 'near_expiry', 'excess', 'wrong_item', 'quality', 'other']),
  note: z.string().trim().max(200).optional().default(''),
});

export const createPurchaseReturnSchema = z.object({
  supplierId: objectIdSchema,
  purchaseId: objectIdSchema.optional(),
  lines: z.array(purchaseReturnLineSchema).min(1).max(200),
  /** How the supplier settles: credit note against payable (default) or cash refund. */
  settlement: z.enum(['credit_note', 'refund']).default('credit_note'),
  refund: paymentLineSchema.optional(),
  notes: z.string().trim().max(1000).optional().default(''),
  attachments: z.array(attachmentRefSchema).max(5).default([]),
});
export type CreatePurchaseReturnInput = z.infer<typeof createPurchaseReturnSchema>;

export const cancelDocumentSchema = z.object({ reason: z.string().trim().min(3).max(300) });
