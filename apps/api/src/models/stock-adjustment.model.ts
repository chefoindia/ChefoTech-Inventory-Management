import { Schema, model, type Types, type InferSchemaType } from 'mongoose';
import { attachmentSchema, jsonOptions } from './_shared';

const adjustmentLineSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, required: true },
    productName: { type: String, required: true },
    batchId: { type: Schema.Types.ObjectId, required: true },
    batchNumber: { type: String, required: true },
    unitId: { type: Schema.Types.ObjectId, required: true },
    unitName: { type: String, default: '' },
    qtyDelta: { type: Number, required: true },
    qtyBaseDelta: { type: Number, required: true },
    unitCostMinor: { type: Number, default: 0 },
    pricingUnitFactor: { type: Number, default: 1 },
    valueMinor: { type: Number, default: 0 },
    note: { type: String, default: '' },
  },
  { _id: false },
);

const stockAdjustmentSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true },
    outletId: { type: Schema.Types.ObjectId, required: true },
    number: { type: String, required: true },
    type: { type: String, required: true },
    reason: { type: String, required: true },
    status: { type: String, enum: ['pending_approval', 'approved', 'rejected'], default: 'pending_approval' },
    lines: { type: [adjustmentLineSchema], default: [] },
    totalValueMinor: { type: Number, default: 0 },
    notes: { type: String, default: '' },
    attachments: { type: [attachmentSchema], default: [] },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: '' },
  },
  { timestamps: true, toJSON: jsonOptions },
);

stockAdjustmentSchema.index({ organizationId: 1, outletId: 1, number: 1 }, { unique: true });
stockAdjustmentSchema.index({ organizationId: 1, outletId: 1, status: 1, createdAt: -1 });

export type StockAdjustmentDoc = InferSchemaType<typeof stockAdjustmentSchema> & { _id: Types.ObjectId };
export const StockAdjustmentModel = model('StockAdjustment', stockAdjustmentSchema);
