import { Schema, model, type Types, type InferSchemaType } from 'mongoose';
import { jsonOptions } from './_shared';

/** A plan purchase attempt: created when checkout starts, paid when the gateway confirms it. */
const subscriptionInvoiceSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true },
    number: { type: String, required: true },
    planKey: { type: String, required: true },
    months: { type: Number, required: true },
    amountMinor: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    status: { type: String, enum: ['created', 'paid', 'failed'], default: 'created' },
    provider: { type: String, default: 'razorpay' },
    providerOrderId: { type: String, default: '' },
    providerPaymentId: { type: String, default: '' },
    periodStart: { type: Date, default: null },
    periodEnd: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    failureReason: { type: String, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, toJSON: jsonOptions },
);

subscriptionInvoiceSchema.index({ organizationId: 1, createdAt: -1 });
subscriptionInvoiceSchema.index({ providerOrderId: 1 }, { unique: true, partialFilterExpression: { providerOrderId: { $type: 'string', $gt: '' } } });

export type SubscriptionInvoiceDoc = InferSchemaType<typeof subscriptionInvoiceSchema> & { _id: Types.ObjectId };
export const SubscriptionInvoiceModel = model('SubscriptionInvoice', subscriptionInvoiceSchema);
