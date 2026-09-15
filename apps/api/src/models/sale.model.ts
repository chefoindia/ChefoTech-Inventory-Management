import { Schema, model, type Types, type InferSchemaType } from 'mongoose';
import { jsonOptions } from './_shared';
import { totalsSchema, paymentSchema } from './purchase.model';

const saleLineSchema = new Schema(
  {
    lineId: { type: String, required: true },
    productId: { type: Schema.Types.ObjectId, required: true },
    productName: { type: String, required: true },
    packLabel: { type: String, default: '' },
    hsnCode: { type: String, default: '' },
    schedule: { type: String, default: 'none' },
    batchId: { type: Schema.Types.ObjectId, required: true },
    batchNumber: { type: String, required: true },
    expiryDate: { type: Date, required: true },
    unitId: { type: Schema.Types.ObjectId, required: true },
    unitName: { type: String, default: '' },
    factorToBase: { type: Number, required: true },
    qty: { type: Number, required: true },
    qtyBase: { type: Number, required: true },
    pricingUnitFactor: { type: Number, required: true },
    unitPriceMinor: { type: Number, required: true },
    mrpPerUnitMinor: { type: Number, default: 0 },
    /** Batch prices at the time, per pricing unit (immutable history). */
    batchSellingPriceMinor: { type: Number, default: 0 },
    batchMrpMinor: { type: Number, default: 0 },
    batchCostMinor: { type: Number, default: 0 },
    discountBps: { type: Number, default: 0 },
    discountMinor: { type: Number, default: 0 },
    taxRateBps: { type: Number, default: 0 },
    cessBps: { type: Number, default: 0 },
    grossMinor: { type: Number, default: 0 },
    taxableMinor: { type: Number, default: 0 },
    cgstMinor: { type: Number, default: 0 },
    sgstMinor: { type: Number, default: 0 },
    igstMinor: { type: Number, default: 0 },
    cessMinor: { type: Number, default: 0 },
    totalMinor: { type: Number, default: 0 },
    costMinor: { type: Number, default: 0 },
    returnedBase: { type: Number, default: 0 },
    priceOverridden: { type: Boolean, default: false },
    note: { type: String, default: '' },
  },
  { _id: false },
);

const saleSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true },
    outletId: { type: Schema.Types.ObjectId, required: true },
    number: { type: String, default: '' },
    status: { type: String, enum: ['completed', 'cancelled', 'held'], required: true },
    customerId: { type: Schema.Types.ObjectId, default: null },
    customerSnapshot: {
      name: { type: String, default: 'Walk-in customer' },
      phone: { type: String, default: '' },
      email: { type: String, default: '' },
      gstin: { type: String, default: '' },
      stateCode: { type: String, default: '' },
    },
    prescriptionIds: { type: [Schema.Types.ObjectId], default: [] },
    doctorName: { type: String, default: '' },
    lines: { type: [saleLineSchema], default: [] },
    totals: { type: totalsSchema, default: () => ({}) },
    isInterState: { type: Boolean, default: false },
    pricesIncludeTax: { type: Boolean, default: true },
    payments: { type: [paymentSchema], default: [] },
    paidMinor: { type: Number, default: 0 },
    creditMinor: { type: Number, default: 0 },
    balanceMinor: { type: Number, default: 0 },
    refundedMinor: { type: Number, default: 0 },
    dueDate: { type: Date, default: null },
    soldBy: { type: Schema.Types.ObjectId, ref: 'User' },
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, default: '' },
    notes: { type: String, default: '' },
    /** Held bills only. */
    label: { type: String, default: '' },
    /** Held bills keep the raw request so the POS can resume it. */
    heldInput: { type: Schema.Types.Mixed, default: null },
    customFields: { type: Schema.Types.Mixed, default: {} },
    email: {
      status: { type: String, enum: ['none', 'queued', 'sent', 'failed'], default: 'none' },
      to: { type: String, default: '' },
      sentAt: { type: Date, default: null },
      error: { type: String, default: '' },
      messageId: { type: String, default: '' },
    },
    idempotencyKey: { type: String, default: '' },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: jsonOptions, minimize: false },
);

saleSchema.index({ organizationId: 1, outletId: 1, number: 1 }, { unique: true, partialFilterExpression: { number: { $type: 'string', $gt: '' } } });
saleSchema.index({ organizationId: 1, outletId: 1, status: 1, completedAt: -1 });
saleSchema.index({ organizationId: 1, customerId: 1, completedAt: -1 });
saleSchema.index({ organizationId: 1, outletId: 1, balanceMinor: 1, dueDate: 1 });
saleSchema.index({ organizationId: 1, outletId: 1, 'lines.productId': 1, completedAt: -1 });
saleSchema.index({ organizationId: 1, soldBy: 1, completedAt: -1 });

export type SaleDoc = InferSchemaType<typeof saleSchema> & { _id: Types.ObjectId };
export const SaleModel = model('Sale', saleSchema);
