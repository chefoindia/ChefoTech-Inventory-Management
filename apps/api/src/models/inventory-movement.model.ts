import { Schema, model, type Types, type InferSchemaType } from 'mongoose';
import { jsonOptions } from './_shared';

export const MOVEMENT_REASONS = [
  'opening',
  'grn',
  'sale',
  'sale_cancel',
  'sales_return',
  'purchase_return',
  'transfer_out',
  'transfer_in',
  'adjustment',
  'damage',
  'expiry',
  'lost',
  'reconciliation',
] as const;
export type MovementReason = (typeof MOVEMENT_REASONS)[number];

/** Append-only stock ledger. Every change to Stock.qtyBase has exactly one movement. */
const inventoryMovementSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true },
    outletId: { type: Schema.Types.ObjectId, required: true },
    productId: { type: Schema.Types.ObjectId, required: true },
    batchId: { type: Schema.Types.ObjectId, required: true },
    qtyBaseDelta: { type: Number, required: true },
    balanceAfterBase: { type: Number, required: true },
    reason: { type: String, enum: MOVEMENT_REASONS, required: true },
    refType: { type: String, default: '' },
    refId: { type: Schema.Types.ObjectId, default: null },
    refNumber: { type: String, default: '' },
    /** Cost per pricing unit at the time, for valuation and COGS. */
    unitCostMinor: { type: Number, default: 0 },
    pricingUnitFactor: { type: Number, default: 1 },
    note: { type: String, default: '' },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, toJSON: jsonOptions },
);

inventoryMovementSchema.index({ organizationId: 1, outletId: 1, productId: 1, createdAt: -1 });
inventoryMovementSchema.index({ organizationId: 1, refType: 1, refId: 1 });
inventoryMovementSchema.index({ organizationId: 1, outletId: 1, createdAt: -1 });
inventoryMovementSchema.index({ organizationId: 1, outletId: 1, reason: 1, createdAt: -1 });

export type InventoryMovementDoc = InferSchemaType<typeof inventoryMovementSchema> & { _id: Types.ObjectId };
export const InventoryMovementModel = model('InventoryMovement', inventoryMovementSchema);
