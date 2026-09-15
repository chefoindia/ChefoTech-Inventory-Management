import { Schema, model, type Types, type InferSchemaType } from 'mongoose';
import { jsonOptions } from './_shared';

const membershipSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    roleId: { type: Schema.Types.ObjectId, ref: 'Role', required: true },
    outletAccess: {
      all: { type: Boolean, default: false },
      outletIds: { type: [Schema.Types.ObjectId], default: [] },
    },
    defaultOutletId: { type: Schema.Types.ObjectId, ref: 'Outlet', default: null },
    isOwner: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'invited', 'suspended'], default: 'active' },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    invitedAt: { type: Date, default: null },
    joinedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: jsonOptions },
);

membershipSchema.index({ userId: 1, organizationId: 1 }, { unique: true });
membershipSchema.index({ organizationId: 1, status: 1 });
membershipSchema.index({ organizationId: 1, roleId: 1 });

export type MembershipDoc = InferSchemaType<typeof membershipSchema> & { _id: Types.ObjectId };
export const MembershipModel = model('Membership', membershipSchema);
