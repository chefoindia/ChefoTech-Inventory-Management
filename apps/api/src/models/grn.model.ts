import { Schema, model, type Types, type InferSchemaType } from 'mongoose';
import { attachmentSchema, jsonOptions } from './_shared';

const grnLineSchema = new Schema(
  {
    purchaseLineId: { type: String, required: true },
    productId: { type: Schema.Types.ObjectId, required: true },
    productName: { type: String, required: true },
    unitId: { type: Schema.Types.ObjectId, required: true },
    unitName: { type: String, default: '' },
    factorToBase: { type: Number, required: true },
    orderedQty: { type: Number, required: true },
    receivedQty: { type: Number, required: true },
    freeQty: { type: Number, default: 0 },
    damagedQty: { type: Number, default: 0 },
    shortQty: { type: Number, default: 0 },
    receivedBase: { type: Number, required: true },
    freeBase: { type: Number, default: 0 },
    damagedBase: { type: Number, default: 0 },
    batchId: { type: Schema.Types.ObjectId, default: null },
    batchNumber: { type: String, required: true },
    mfgDate: { type: Date, default: null },
    expiryDate: { type: Date, required: true },
    pricingUnitId: { type: Schema.Types.ObjectId, required: true },
    pricingUnitFactor: { type: Number, required: true },
    purchasePriceMinor: { type: Number, required: true },
    mrpMinor: { type: Number, required: true },
    sellingPriceMinor: { type: Number, required: true },
    /** Barcode label ids captured for the packs received on this line (one per strip/box). */
    barcodes: { type: [String], default: [] },
    note: { type: String, default: '' },
  },
  { _id: false },
);

const grnSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true },
    outletId: { type: Schema.Types.ObjectId, required: true },
    number: { type: String, required: true },
    purchaseId: { type: Schema.Types.ObjectId, required: true },
    purchaseNumber: { type: String, default: '' },
    supplierId: { type: Schema.Types.ObjectId, required: true },
    supplierName: { type: String, default: '' },
    receivedDate: { type: Date, required: true },
    status: { type: String, enum: ['draft', 'confirmed'], default: 'draft' },
    lines: { type: [grnLineSchema], default: [] },
    attachments: { type: [attachmentSchema], default: [] },
    notes: { type: String, default: '' },
    receivedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    confirmedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    confirmedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: jsonOptions },
);

grnSchema.index({ organizationId: 1, outletId: 1, number: 1 }, { unique: true });
grnSchema.index({ organizationId: 1, purchaseId: 1 });
grnSchema.index({ organizationId: 1, outletId: 1, receivedDate: -1 });

export type GrnDoc = InferSchemaType<typeof grnSchema> & { _id: Types.ObjectId };
export const GrnModel = model('Grn', grnSchema);
