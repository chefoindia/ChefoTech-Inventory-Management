import { Schema, model, type Types, type InferSchemaType } from 'mongoose';
import { jsonOptions } from './_shared';

/** Browser Web Push subscription for a user (one per device/browser). */
const pushSubscriptionSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    endpoint: { type: String, required: true },
    keys: { p256dh: { type: String, required: true }, auth: { type: String, required: true } },
    userAgent: { type: String, default: '' },
    lastUsedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: jsonOptions },
);

pushSubscriptionSchema.index({ endpoint: 1 }, { unique: true });
pushSubscriptionSchema.index({ organizationId: 1, userId: 1 });

export type PushSubscriptionDoc = InferSchemaType<typeof pushSubscriptionSchema> & { _id: Types.ObjectId };
export const PushSubscriptionModel = model('PushSubscription', pushSubscriptionSchema);
