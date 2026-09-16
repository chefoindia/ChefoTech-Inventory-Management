import { Schema, model, type Types, type InferSchemaType } from 'mongoose';
import { jsonOptions } from './_shared';

/**
 * Website enquiry from the public marketing site (demo request, sales or contact form).
 * Platform-level: not owned by any organization. Kept so no lead is lost even when the
 * notification email is not configured or fails.
 */
const leadSchema = new Schema(
  {
    type: { type: String, enum: ['demo', 'contact', 'sales'], required: true },
    name: { type: String, required: true },
    email: { type: String, required: true, lowercase: true },
    phone: { type: String, default: '' },
    pharmacyName: { type: String, default: '' },
    outlets: { type: String, default: '' },
    message: { type: String, default: '' },
    source: { type: String, default: '' },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    notified: { type: Boolean, default: false },
    notifyError: { type: String, default: '' },
  },
  { timestamps: true, toJSON: jsonOptions },
);

leadSchema.index({ createdAt: -1 });
leadSchema.index({ email: 1, createdAt: -1 });

export type LeadDoc = InferSchemaType<typeof leadSchema> & { _id: Types.ObjectId };
export const LeadModel = model('Lead', leadSchema);
