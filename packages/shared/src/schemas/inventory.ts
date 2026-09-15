import { z } from 'zod';
import { objectIdSchema, paginationQuerySchema } from './common';

/* ---------------------------------------------------------------- batches & opening stock */

export const batchInputSchema = z.object({
  batchNumber: z.string().trim().min(1).max(40),
  mfgDate: z.coerce.date().optional(),
  expiryDate: z.coerce.date(),
  mrpMinor: z.number().int().min(0),
  sellingPriceMinor: z.number().int().min(0).optional(),
  purchasePriceMinor: z.number().int().min(0),
});
export type BatchInput = z.infer<typeof batchInputSchema>;

export const openingStockLineSchema = z.object({
  productId: objectIdSchema,
  unitId: objectIdSchema,
  qty: z.number().positive(),
  batch: batchInputSchema,
});

export const openingStockSchema = z.object({
  lines: z.array(openingStockLineSchema).min(1).max(500),
  notes: z.string().trim().max(500).optional().default(''),
});
export type OpeningStockInput = z.infer<typeof openingStockSchema>;

/* ---------------------------------------------------------------- adjustments */

export const ADJUSTMENT_TYPES = ['increase', 'decrease', 'damage', 'expiry', 'lost', 'reconciliation'] as const;
export type AdjustmentType = (typeof ADJUSTMENT_TYPES)[number];

export const ADJUSTMENT_REASONS = [
  'physical_count',
  'damaged',
  'expired',
  'lost_theft',
  'breakage',
  'sample_free',
  'data_entry_error',
  'return_to_supplier_pending',
  'other',
] as const;

export const adjustmentLineSchema = z.object({
  productId: objectIdSchema,
  batchId: objectIdSchema,
  unitId: objectIdSchema,
  /** Positive adds stock, negative removes (in the given unit). */
  qtyDelta: z.number().refine((v) => v !== 0, 'Quantity cannot be zero'),
  note: z.string().trim().max(200).optional().default(''),
});

export const createAdjustmentSchema = z.object({
  type: z.enum(ADJUSTMENT_TYPES),
  reason: z.enum(ADJUSTMENT_REASONS),
  lines: z.array(adjustmentLineSchema).min(1).max(200),
  notes: z.string().trim().max(1000).optional().default(''),
  attachments: z.array(z.object({ publicId: z.string(), provider: z.literal('cloudinary'), resourceType: z.string(), format: z.string(), bytes: z.number(), access: z.enum(['public', 'private']), originalName: z.string().optional() })).max(5).default([]),
});
export type CreateAdjustmentInput = z.infer<typeof createAdjustmentSchema>;

export const adjustmentListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['pending_approval', 'approved', 'rejected']).optional(),
  type: z.enum(ADJUSTMENT_TYPES).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const rejectSchema = z.object({ reason: z.string().trim().min(3).max(300) });

/* ---------------------------------------------------------------- stock queries */

export const stockQuerySchema = paginationQuerySchema.extend({
  categoryId: objectIdSchema.optional(),
  onlyInStock: z.coerce.boolean().default(false),
  lowStock: z.coerce.boolean().default(false),
  outletId: objectIdSchema.optional(),
});
export type StockQuery = z.infer<typeof stockQuerySchema>;

export const batchListQuerySchema = paginationQuerySchema.extend({
  productId: objectIdSchema.optional(),
  expiryStatus: z.enum(['expired', 'expiring', 'safe', 'all']).default('all'),
  withinDays: z.coerce.number().int().min(1).max(730).optional(),
  includeZero: z.coerce.boolean().default(false),
});
export type BatchListQuery = z.infer<typeof batchListQuerySchema>;

export const movementQuerySchema = paginationQuerySchema.extend({
  productId: objectIdSchema.optional(),
  batchId: objectIdSchema.optional(),
  reason: z.string().max(40).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type MovementQuery = z.infer<typeof movementQuerySchema>;

export const blockBatchSchema = z.object({ blocked: z.boolean(), reason: z.string().trim().max(200).optional().default('') });

export const updateBatchSchema = z.object({
  expiryDate: z.coerce.date().optional(),
  mfgDate: z.coerce.date().nullable().optional(),
  sellingPriceMinor: z.number().int().min(0).optional(),
  mrpMinor: z.number().int().min(0).optional(),
});

/* ---------------------------------------------------------------- transfers */

export const transferLineSchema = z.object({
  productId: objectIdSchema,
  batchId: objectIdSchema,
  unitId: objectIdSchema,
  qty: z.number().positive(),
});

export const createTransferSchema = z.object({
  toOutletId: objectIdSchema,
  lines: z.array(transferLineSchema).min(1).max(200),
  notes: z.string().trim().max(1000).optional().default(''),
  /** Skip the request/approve stage and dispatch immediately (requires dispatch permission). */
  dispatchNow: z.boolean().default(false),
});
export type CreateTransferInput = z.infer<typeof createTransferSchema>;

export const receiveTransferSchema = z.object({
  lines: z
    .array(
      z.object({
        lineId: z.string().min(1),
        qtyReceivedBase: z.number().int().min(0),
        discrepancyNote: z.string().trim().max(300).optional().default(''),
      }),
    )
    .min(1),
  notes: z.string().trim().max(1000).optional().default(''),
});
export type ReceiveTransferInput = z.infer<typeof receiveTransferSchema>;

export const transferListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['requested', 'approved', 'dispatched', 'received', 'partially_received', 'cancelled']).optional(),
  direction: z.enum(['in', 'out', 'all']).default('all'),
});
