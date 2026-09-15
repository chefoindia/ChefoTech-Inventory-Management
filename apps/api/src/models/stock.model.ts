import { Schema, model, type Types, type InferSchemaType } from 'mongoose';
import { jsonOptions } from './_shared';

/** Current on-hand quantity per outlet per batch, in base units. Only changed via stock.service. */
const stockSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true },
    outletId: { type: Schema.Types.ObjectId, required: true },
    productId: { type: Schema.Types.ObjectId, required: true },
    batchId: { type: Schema.Types.ObjectId, required: true },
    qtyBase: { type: Number, required: true, default: 0, min: 0 },
    /** Quantity dispatched on a transfer and not yet received (kept off both outlets' sellable stock). */
    inTransitBase: { type: Number, default: 0, min: 0 },
    expiryDate: { type: Date, required: true },
    lastMovementAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true, toJSON: jsonOptions },
);

stockSchema.index({ organizationId: 1, outletId: 1, batchId: 1 }, { unique: true });
stockSchema.index({ organizationId: 1, outletId: 1, productId: 1, expiryDate: 1 });
stockSchema.index({ organizationId: 1, outletId: 1, expiryDate: 1, qtyBase: 1 });
stockSchema.index({ organizationId: 1, productId: 1 });

export type StockDoc = InferSchemaType<typeof stockSchema> & { _id: Types.ObjectId };
export const StockModel = model('Stock', stockSchema);
