import { Schema, model, type Types, type InferSchemaType } from 'mongoose';
import { attachmentSchema, jsonOptions } from './_shared';

export const totalsSchema = new Schema(
  {
    subtotalMinor: { type: Number, default: 0 },
    itemDiscountMinor: { type: Number, default: 0 },
    billDiscountMinor: { type: Number, default: 0 },
    taxableMinor: { type: Number, default: 0 },
    cgstMinor: { type: Number, default: 0 },
    sgstMinor: { type: Number, default: 0 },
    igstMinor: { type: Number, default: 0 },
    cessMinor: { type: Number, default: 0 },
    taxMinor: { type: Number, default: 0 },
    otherChargesMinor: { type: Number, default: 0 },
    roundOffMinor: { type: Number, default: 0 },
    grandTotalMinor: { type: Number, default: 0 },
  },
  { _id: false },
);

export const paymentSchema = new Schema(
  {
    method: { type: String, required: true },
    amountMinor: { type: Number, required: true },
    reference: { type: String, default: '' },
    receivedAt: { type: Date, default: () => new Date() },
    /** Set when the payment came from a separate PartyPayment document. */
    paymentId: { type: Schema.Types.ObjectId, default: null },
  },
  { _id: false },
);

const purchaseLineSchema = new Schema(
  {
    lineId: { type: String, required: true },
    productId: { type: Schema.Types.ObjectId, required: true },
    productName: { type: String, required: true },
    packLabel: { type: String, default: '' },
    hsnCode: { type: String, default: '' },
    unitId: { type: Schema.Types.ObjectId, required: true },
    unitName: { type: String, default: '' },
    factorToBase: { type: Number, required: true },
    qty: { type: Number, required: true },
    freeQty: { type: Number, default: 0 },
    qtyBase: { type: Number, required: true },
    freeQtyBase: { type: Number, default: 0 },
    receivedBase: { type: Number, default: 0 },
    damagedBase: { type: Number, default: 0 },
    batchNumber: { type: String, required: true },
    mfgDate: { type: Date, default: null },
    expiryDate: { type: Date, required: true },
    pricingUnitId: { type: Schema.Types.ObjectId, required: true },
    pricingUnitFactor: { type: Number, required: true },
    purchasePriceMinor: { type: Number, required: true },
    mrpMinor: { type: Number, required: true },
    sellingPriceMinor: { type: Number, required: true },
    discountBps: { type: Number, default: 0 },
    discountMinor: { type: Number, default: 0 },
    schemeNote: { type: String, default: '' },
    taxRateBps: { type: Number, default: 0 },
    cessBps: { type: Number, default: 0 },
    grossMinor: { type: Number, default: 0 },
    taxableMinor: { type: Number, default: 0 },
    cgstMinor: { type: Number, default: 0 },
    sgstMinor: { type: Number, default: 0 },
    igstMinor: { type: Number, default: 0 },
    cessMinor: { type: Number, default: 0 },
    totalMinor: { type: Number, default: 0 },
  },
  { _id: false },
);

const purchaseSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true },
    outletId: { type: Schema.Types.ObjectId, required: true },
    number: { type: String, required: true },
    supplierId: { type: Schema.Types.ObjectId, required: true },
    supplierSnapshot: {
      name: { type: String, default: '' },
      gstin: { type: String, default: '' },
      stateCode: { type: String, default: '' },
    },
    supplierInvoiceNumber: { type: String, required: true },
    invoiceDate: { type: Date, required: true },
    dueDate: { type: Date, default: null },
    status: { type: String, enum: ['draft', 'confirmed', 'partially_received', 'received', 'cancelled'], default: 'confirmed' },
    lines: { type: [purchaseLineSchema], default: [] },
    totals: { type: totalsSchema, default: () => ({}) },
    otherChargesNote: { type: String, default: '' },
    isInterState: { type: Boolean, default: false },
    payments: { type: [paymentSchema], default: [] },
    paidMinor: { type: Number, default: 0 },
    balanceMinor: { type: Number, default: 0 },
    grnIds: { type: [Schema.Types.ObjectId], default: [] },
    attachments: { type: [attachmentSchema], default: [] },
    notes: { type: String, default: '' },
    customFields: { type: Schema.Types.Mixed, default: {} },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, default: '' },
  },
  { timestamps: true, toJSON: jsonOptions, minimize: false },
);

purchaseSchema.index({ organizationId: 1, outletId: 1, number: 1 }, { unique: true });
purchaseSchema.index({ organizationId: 1, supplierId: 1, invoiceDate: -1 });
purchaseSchema.index({ organizationId: 1, supplierId: 1, supplierInvoiceNumber: 1 });
purchaseSchema.index({ organizationId: 1, outletId: 1, status: 1, invoiceDate: -1 });
purchaseSchema.index({ organizationId: 1, outletId: 1, balanceMinor: 1, dueDate: 1 });

export type PurchaseDoc = InferSchemaType<typeof purchaseSchema> & { _id: Types.ObjectId };
export const PurchaseModel = model('Purchase', purchaseSchema);
