import { Schema, model, type Types, type InferSchemaType } from 'mongoose';
import { jsonOptions } from './_shared';

const invitationSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    roleId: { type: Schema.Types.ObjectId, ref: 'Role', required: true },
    outletAccess: {
      all: { type: Boolean, default: false },
      outletIds: { type: [Schema.Types.ObjectId], default: [] },
    },
    defaultOutletId: { type: Schema.Types.ObjectId, ref: 'Outlet', default: null },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    acceptedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    emailStatus: { type: String, enum: ['pending', 'sent', 'failed'], default: 'pending' },
    emailError: { type: String, default: null },
  },
  { timestamps: true, toJSON: jsonOptions },
);

invitationSchema.index({ tokenHash: 1 }, { unique: true });
invitationSchema.index({ organizationId: 1, email: 1, acceptedAt: 1 });

export type InvitationDoc = InferSchemaType<typeof invitationSchema> & { _id: Types.ObjectId };
export const InvitationModel = model('Invitation', invitationSchema);
