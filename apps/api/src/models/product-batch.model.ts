import { Schema, model, type Types, type InferSchemaType } from 'mongoose';
import { jsonOptions } from './_shared';

/**
 * A batch of a product (organization-level). Prices are quoted per `pricingUnitFactor` base units
 * (e.g. per strip of 10 tablets), so a loose unit price = price / pricingUnitFactor.
 */
const productBatchSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    batchNumber: { type: String, required: true, trim: true },
    batchNumberNormalized: { type: String, required: true },
    mfgDate: { type: Date, default: null },
    expiryDate: { type: Date, required: true },
    pricingUnitId: { type: Schema.Types.ObjectId, required: true },
    pricingUnitFactor: { type: Number, required: true, min: 1 },
    mrpMinor: { type: Number, required: true },
    sellingPriceMinor: { type: Number, required: true },
    purchasePriceMinor: { type: Number, required: true },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', default: null },
    sourceType: { type: String, enum: ['grn', 'opening', 'transfer', 'adjustment', 'import'], default: 'grn' },
    sourceId: { type: Schema.Types.ObjectId, default: null },
    /** Blocked batches are excluded from sale (recall, quality hold). */
    /**
     * Barcode LABEL ids stuck on the physical packs of this batch (one per strip/box), captured
     * when the goods are received. Scanning one resolves to this batch, so the counter sees the
     * real purchase price, selling price, MRP and expiry of the pack in hand. Manufacturer EAN
     * codes stay on the product (shared by every batch); these are per-batch and unique.
     */
    barcodes: { type: [String], default: [] },
    status: { type: String, enum: ['active', 'blocked'], default: 'active' },
    blockReason: { type: String, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, toJSON: jsonOptions },
);

productBatchSchema.index({ organizationId: 1, productId: 1, batchNumberNormalized: 1, mrpMinor: 1 }, { unique: true });
// $type filters to batches that actually carry a label: an EMPTY array still satisfies
// `$exists: true`, which would make every unlabelled batch collide on the unique index.
productBatchSchema.index({ organizationId: 1, barcodes: 1 }, { unique: true, partialFilterExpression: { barcodes: { $type: 'string' } } });
productBatchSchema.index({ organizationId: 1, expiryDate: 1 });
productBatchSchema.index({ organizationId: 1, productId: 1, expiryDate: 1 });

export type ProductBatchDoc = InferSchemaType<typeof productBatchSchema> & { _id: Types.ObjectId };
export const ProductBatchModel = model('ProductBatch', productBatchSchema);
