import { Schema, model, type Types, type InferSchemaType } from 'mongoose';
import { attachmentSchema, jsonOptions } from './_shared';

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true, default: '' },
    avatar: { type: attachmentSchema, default: null },
    emailVerifiedAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
    security: {
      failedLoginAttempts: { type: Number, default: 0 },
      lockedUntil: { type: Date, default: null },
      passwordChangedAt: { type: Date, default: null },
      passwordResetTokenHash: { type: String, default: null, select: false },
      passwordResetExpiresAt: { type: Date, default: null, select: false },
    },
  },
  {
    timestamps: true,
    toJSON: {
      ...jsonOptions,
      transform(doc, ret: Record<string, unknown>) {
        jsonOptions.transform(doc, ret);
        delete ret.passwordHash;
        delete ret.security;
        return ret;
      },
    },
  },
);

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: Types.ObjectId };
export const UserModel = model('User', userSchema);
