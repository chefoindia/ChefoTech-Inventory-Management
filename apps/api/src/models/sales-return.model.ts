import { Schema, model, type Types, type InferSchemaType } from 'mongoose';
import { jsonOptions } from './_shared';
import { totalsSchema, paymentSchema } from './purchase.model';

const salesReturnLineSchema = new Schema(
  {
    saleLineId: { type: String, required: true },
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
    batchCostMinor: { type: Number, default: 0 },
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
    condition: { type: String, enum: ['resaleable', 'damaged', 'expired'], default: 'resaleable' },
    reason: { type: String, default: 'other' },
    note: { type: String, default: '' },
  },
  { _id: false },
);

const salesReturnSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true },
    outletId: { type: Schema.Types.ObjectId, required: true },
    number: { type: String, required: true },
    saleId: { type: Schema.Types.ObjectId, required: true },
    saleNumber: { type: String, default: '' },
    customerId: { type: Schema.Types.ObjectId, default: null },
    customerName: { type: String, default: '' },
    status: { type: String, enum: ['completed', 'cancelled'], default: 'completed' },
    lines: { type: [salesReturnLineSchema], default: [] },
    totals: { type: totalsSchema, default: () => ({}) },
    isInterState: { type: Boolean, default: false },
    settlement: { type: String, enum: ['refund', 'credit_note'], default: 'refund' },
    refund: { type: paymentSchema, default: null },
    notes: { type: String, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, toJSON: jsonOptions },
);

salesReturnSchema.index({ organizationId: 1, outletId: 1, number: 1 }, { unique: true });
salesReturnSchema.index({ organizationId: 1, saleId: 1 });
salesReturnSchema.index({ organizationId: 1, outletId: 1, createdAt: -1 });
salesReturnSchema.index({ organizationId: 1, customerId: 1, createdAt: -1 });

export type SalesReturnDoc = InferSchemaType<typeof salesReturnSchema> & { _id: Types.ObjectId };
export const SalesReturnModel = model('SalesReturn', salesReturnSchema);
