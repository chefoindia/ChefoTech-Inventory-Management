import { Schema } from 'mongoose';
import type { AttachmentRef } from '@pharmaos/shared';

export const addressSchema = new Schema(
  {
    line1: { type: String, default: '', trim: true },
    line2: { type: String, default: '', trim: true },
    city: { type: String, default: '', trim: true },
    state: { type: String, default: '', trim: true },
    pincode: { type: String, default: '', trim: true },
    country: { type: String, default: 'IN', trim: true },
  },
  { _id: false },
);

export const attachmentSchema = new Schema<AttachmentRef>(
  {
    provider: { type: String, enum: ['cloudinary'], required: true },
    publicId: { type: String, required: true },
    resourceType: { type: String, required: true },
    format: { type: String, required: true },
    bytes: { type: Number, required: true },
    width: Number,
    height: Number,
    originalName: String,
    access: { type: String, enum: ['public', 'private'], required: true },
  },
  { _id: false },
);

/** Standard toJSON: id instead of _id, drop __v. Models opt in via schema options. */
export const jsonOptions = {
  virtuals: true,
  versionKey: false,
  transform(_doc: unknown, ret: Record<string, unknown>) {
    ret.id = String(ret._id);
    delete ret._id;
    return ret;
  },
};
