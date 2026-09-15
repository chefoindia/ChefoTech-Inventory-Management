import { Schema, model, type Types, type InferSchemaType } from 'mongoose';
import { attachmentSchema, jsonOptions } from './_shared';
import { totalsSchema, paymentSchema } from './purchase.model';

const purchaseReturnLineSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, required: true },
    productName: { type: String, required: true },
    hsnCode: { type: String, default: '' },
    batchId: { type: Schema.Types.ObjectId, required: true },
    batchNumber: { type: String, required: true },
    unitId: { type: Schema.Types.ObjectId, required: true },
    unitName: { type: String, default: '' },
    factorToBase: { type: Number, required: true },
    qty: { type: Number, required: true },
    qtyBase: { type: Number, required: true },
    pricingUnitFactor: { type: Number, required: true },
    unitPriceMinor: { type: Number, required: true },
    taxRateBps: { type: Number, default: 0 },
    cessBps: { type: Number, default: 0 },
    grossMinor: { type: Number, default: 0 },
    taxableMinor: { type: Number, default: 0 },
    cgstMinor: { type: Number, default: 0 },
    sgstMinor: { type: Number, default: 0 },
    igstMinor: { type: Number, default: 0 },
    cessMinor: { type: Number, default: 0 },
    taxMinor: { type: Number, default: 0 },
    totalMinor: { type: Number, default: 0 },
    reason: { type: String, default: 'other' },
    note: { type: String, default: '' },
  },
  { _id: false },
);

const purchaseReturnSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true },
    outletId: { type: Schema.Types.ObjectId, required: true },
    number: { type: String, required: true },
    supplierId: { type: Schema.Types.ObjectId, required: true },
    supplierName: { type: String, default: '' },
    purchaseId: { type: Schema.Types.ObjectId, default: null },
    purchaseNumber: { type: String, default: '' },
    status: { type: String, enum: ['completed', 'cancelled'], default: 'completed' },
    lines: { type: [purchaseReturnLineSchema], default: [] },
    totals: { type: totalsSchema, default: () => ({}) },
    isInterState: { type: Boolean, default: false },
    settlement: { type: String, enum: ['credit_note', 'refund'], default: 'credit_note' },
    refund: { type: paymentSchema, default: null },
    notes: { type: String, default: '' },
    attachments: { type: [attachmentSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, toJSON: jsonOptions },
);

purchaseReturnSchema.index({ organizationId: 1, outletId: 1, number: 1 }, { unique: true });
purchaseReturnSchema.index({ organizationId: 1, supplierId: 1, createdAt: -1 });
purchaseReturnSchema.index({ organizationId: 1, outletId: 1, createdAt: -1 });

export type PurchaseReturnDoc = InferSchemaType<typeof purchaseReturnSchema> & { _id: Types.ObjectId };
export const PurchaseReturnModel = model('PurchaseReturn', purchaseReturnSchema);
