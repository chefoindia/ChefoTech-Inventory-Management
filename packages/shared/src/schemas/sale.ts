import { z } from 'zod';
import { objectIdSchema, paginationQuerySchema, phoneSchema, emailSchema } from './common';
import { paymentLineSchema } from './party';
import { customFieldValuesSchema } from './product';

export const saleLineSchema = z.object({
  productId: objectIdSchema,
  /** When omitted the server allocates FEFO across batches (may split into several lines). */
  batchId: objectIdSchema.optional(),
  unitId: objectIdSchema,
  qty: z.number().positive(),
  /** Per selling unit. Omit to use the batch selling price; overriding needs sales.overridePrice. */
  unitPriceMinor: z.number().int().min(0).optional(),
  discountBps: z.number().int().min(0).max(10_000).default(0),
  discountMinor: z.number().int().min(0).default(0),
  note: z.string().trim().max(120).optional().default(''),
});
export type SaleLineInput = z.infer<typeof saleLineSchema>;

export const walkInCustomerSchema = z.object({
  name: z.string().trim().max(120).optional().default(''),
  phone: phoneSchema.optional(),
  email: emailSchema.optional(),
});

export const createSaleSchema = z.object({
  customerId: objectIdSchema.optional(),
  walkIn: walkInCustomerSchema.optional(),
  prescriptionIds: z.array(objectIdSchema).max(5).default([]),
  doctorName: z.string().trim().max(120).optional().default(''),
  lines: z.array(saleLineSchema).min(1).max(200),
  billDiscountBps: z.number().int().min(0).max(10_000).default(0),
  billDiscountMinor: z.number().int().min(0).default(0),
  payments: z.array(paymentLineSchema).max(5).default([]),
  /** Amount left as credit (Baki); requires a customer and sales.credit. */
  creditMinor: z.number().int().min(0).default(0),
  dueDate: z.coerce.date().optional(),
  notes: z.string().trim().max(500).optional().default(''),
  customFields: customFieldValuesSchema,
  /** Optional id of a held bill this completes. */
  heldSaleId: objectIdSchema.optional(),
  expectedGrandTotalMinor: z.number().int().optional(),
  sendEmail: z.boolean().default(false),
});
export type CreateSaleInput = z.infer<typeof createSaleSchema>;

export const holdSaleSchema = createSaleSchema.omit({ payments: true, creditMinor: true, expectedGrandTotalMinor: true, sendEmail: true, heldSaleId: true }).extend({
  label: z.string().trim().max(60).optional().default(''),
});
export type HoldSaleInput = z.infer<typeof holdSaleSchema>;

/** Server-side quote: same inputs as a sale, returns priced lines and totals without committing. */
export const quoteSaleSchema = createSaleSchema.pick({ customerId: true, lines: true, billDiscountBps: true, billDiscountMinor: true });
export type QuoteSaleInput = z.infer<typeof quoteSaleSchema>;

export const saleListQuerySchema = paginationQuerySchema.extend({
  customerId: objectIdSchema.optional(),
  status: z.enum(['completed', 'cancelled', 'held']).optional(),
  paymentStatus: z.enum(['paid', 'partial', 'credit']).optional(),
  soldBy: objectIdSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type SaleListQuery = z.infer<typeof saleListQuerySchema>;

/* ---------------------------------------------------------------- sales returns */

export const salesReturnLineSchema = z.object({
  saleLineId: z.string().min(1),
  /** In the original line's unit. */
  qty: z.number().positive(),
  condition: z.enum(['resaleable', 'damaged', 'expired']).default('resaleable'),
  reason: z.enum(['wrong_item', 'not_needed', 'adverse_reaction', 'damaged', 'expired', 'billing_error', 'other']),
  note: z.string().trim().max(200).optional().default(''),
});

export const createSalesReturnSchema = z.object({
  saleId: objectIdSchema,
  lines: z.array(salesReturnLineSchema).min(1),
  /** refund pays money back now; credit_note reduces the customer balance / creates credit. */
  settlement: z.enum(['refund', 'credit_note']).default('refund'),
  refund: paymentLineSchema.optional(),
  notes: z.string().trim().max(500).optional().default(''),
});
export type CreateSalesReturnInput = z.infer<typeof createSalesReturnSchema>;

export const emailInvoiceSchema = z.object({
  to: emailSchema.optional(),
  message: z.string().trim().max(500).optional(),
});
