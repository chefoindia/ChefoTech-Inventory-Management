import { Schema, model, type Types, type InferSchemaType } from 'mongoose';
import { addressSchema, jsonOptions } from './_shared';

const outletSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, uppercase: true, trim: true },
    type: { type: String, enum: ['retail', 'warehouse'], default: 'retail' },
    stateCode: { type: String, required: true },
    gstin: { type: String, uppercase: true, trim: true, default: '' },
    drugLicenseNo: { type: String, trim: true, default: '' },
    drugLicenseExpiry: { type: Date, default: null },
    phone: { type: String, trim: true, default: '' },
    email: { type: String, lowercase: true, trim: true, default: '' },
    address: { type: addressSchema, default: () => ({}) },
    settings: {
      invoiceFooterNote: { type: String, default: '' },
      defaultPrinter: { type: String, enum: ['a4', 'thermal80', 'thermal58'], default: 'a4' },
      autoPrintOnSale: { type: Boolean, default: false },
    },
    isDefault: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'inactive', 'archived'], default: 'active' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, toJSON: jsonOptions },
);

outletSchema.index({ organizationId: 1, code: 1 }, { unique: true });
outletSchema.index({ organizationId: 1, status: 1, name: 1 });

export type OutletDoc = InferSchemaType<typeof outletSchema> & { _id: Types.ObjectId };
export const OutletModel = model('Outlet', outletSchema);
