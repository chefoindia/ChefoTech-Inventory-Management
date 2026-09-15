import { Schema, model, type Types, type InferSchemaType } from 'mongoose';

const idempotencyKeySchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    key: { type: String, required: true },
    method: { type: String, required: true },
    path: { type: String, required: true },
    requestHash: { type: String, required: true },
    status: { type: String, enum: ['in_progress', 'completed'], default: 'in_progress' },
    statusCode: { type: Number, default: null },
    responseBody: { type: Schema.Types.Mixed, default: null },
    createdAt: { type: Date, default: () => new Date() },
  },
  { versionKey: false },
);

idempotencyKeySchema.index({ organizationId: 1, key: 1 }, { unique: true });
idempotencyKeySchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 });

export type IdempotencyKeyDoc = InferSchemaType<typeof idempotencyKeySchema> & { _id: Types.ObjectId };
export const IdempotencyKeyModel = model('IdempotencyKey', idempotencyKeySchema);
