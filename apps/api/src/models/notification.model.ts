import { Schema, model, type Types, type InferSchemaType } from 'mongoose';
import { jsonOptions } from './_shared';

/** In-app notification. `userId` null = visible to everyone in the org holding `permission`. */
const notificationSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true },
    outletId: { type: Schema.Types.ObjectId, default: null },
    userId: { type: Schema.Types.ObjectId, default: null },
    permission: { type: String, default: '' },
    type: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    severity: { type: String, enum: ['info', 'warning', 'danger', 'success'], default: 'info' },
    entityType: { type: String, default: null },
    entityId: { type: Schema.Types.ObjectId, default: null },
    href: { type: String, default: null },
    /** Prevents re-creating the same alert for the same entity while it is still open. */
    dedupeKey: { type: String, default: null },
    readBy: { type: [Schema.Types.ObjectId], default: [] },
    channels: { type: [String], default: ['inApp'] },
    deliveries: { type: [new Schema({ channel: String, status: String, error: { type: String, default: '' }, at: { type: Date, default: () => new Date() } }, { _id: false })], default: [] },
    expiresAt: { type: Date, default: () => new Date(Date.now() + 90 * 86_400_000) },
  },
  { timestamps: true, toJSON: jsonOptions },
);

notificationSchema.index({ organizationId: 1, createdAt: -1 });
notificationSchema.index({ organizationId: 1, userId: 1, createdAt: -1 });
notificationSchema.index({ organizationId: 1, dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type NotificationDoc = InferSchemaType<typeof notificationSchema> & { _id: Types.ObjectId };
export const NotificationModel = model('Notification', notificationSchema);

const notificationRuleSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true },
    type: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    channels: { type: [String], default: ['inApp'] },
    roleKeys: { type: [String], default: [] },
    threshold: { type: Number, default: null },
  },
  { timestamps: true, toJSON: jsonOptions },
);

notificationRuleSchema.index({ organizationId: 1, type: 1 }, { unique: true });

export type NotificationRuleDoc = InferSchemaType<typeof notificationRuleSchema> & { _id: Types.ObjectId };
export const NotificationRuleModel = model('NotificationRule', notificationRuleSchema);

/** Per-user notification preferences (mute types, email digest). */
const notificationPreferenceSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    mutedTypes: { type: [String], default: [] },
    emailDigest: { type: String, enum: ['none', 'daily'], default: 'none' },
  },
  { timestamps: true, toJSON: jsonOptions },
);
notificationPreferenceSchema.index({ organizationId: 1, userId: 1 }, { unique: true });
export type NotificationPreferenceDoc = InferSchemaType<typeof notificationPreferenceSchema> & { _id: Types.ObjectId };
export const NotificationPreferenceModel = model('NotificationPreference', notificationPreferenceSchema);
