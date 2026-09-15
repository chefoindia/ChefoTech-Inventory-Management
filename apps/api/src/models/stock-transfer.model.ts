import { Schema, model, type Types, type InferSchemaType } from 'mongoose';
import { jsonOptions } from './_shared';

const transferLineSchema = new Schema(
  {
    lineId: { type: String, required: true },
    productId: { type: Schema.Types.ObjectId, required: true },
    productName: { type: String, required: true },
    batchId: { type: Schema.Types.ObjectId, required: true },
    batchNumber: { type: String, required: true },
    expiryDate: { type: Date, required: true },
    unitId: { type: Schema.Types.ObjectId, required: true },
    unitName: { type: String, default: '' },
    factorToBase: { type: Number, default: 1 },
    qtyRequestedBase: { type: Number, required: true },
    qtyDispatchedBase: { type: Number, default: 0 },
    qtyReceivedBase: { type: Number, default: 0 },
    unitCostMinor: { type: Number, default: 0 },
    pricingUnitFactor: { type: Number, default: 1 },
    discrepancyNote: { type: String, default: '' },
  },
  { _id: false },
);

const stockTransferSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true },
    number: { type: String, required: true },
    fromOutletId: { type: Schema.Types.ObjectId, required: true },
    toOutletId: { type: Schema.Types.ObjectId, required: true },
    status: { type: String, enum: ['requested', 'approved', 'dispatched', 'received', 'partially_received', 'cancelled'], default: 'requested' },
    lines: { type: [transferLineSchema], default: [] },
    notes: { type: String, default: '' },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    dispatchedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    receivedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    requestedAt: { type: Date, default: () => new Date() },
    approvedAt: { type: Date, default: null },
    dispatchedAt: { type: Date, default: null },
    receivedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, default: '' },
  },
  { timestamps: true, toJSON: jsonOptions },
);

stockTransferSchema.index({ organizationId: 1, number: 1 }, { unique: true });
stockTransferSchema.index({ organizationId: 1, fromOutletId: 1, status: 1, createdAt: -1 });
stockTransferSchema.index({ organizationId: 1, toOutletId: 1, status: 1, createdAt: -1 });

export type StockTransferDoc = InferSchemaType<typeof stockTransferSchema> & { _id: Types.ObjectId };
export const StockTransferModel = model('StockTransfer', stockTransferSchema);
