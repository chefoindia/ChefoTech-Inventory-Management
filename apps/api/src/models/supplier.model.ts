import { Schema, model, type Types, type InferSchemaType } from 'mongoose';
import { addressSchema, attachmentSchema, jsonOptions } from './_shared';

const supplierSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    name: { type: String, required: true, trim: true },
    nameNormalized: { type: String, required: true },
    code: { type: String, default: '' },
    contactPerson: { type: String, default: '' },
    phone: { type: String, default: '' },
    altPhone: { type: String, default: '' },
    email: { type: String, default: '', lowercase: true },
    address: { type: addressSchema, default: () => ({}) },
    gstin: { type: String, default: '', uppercase: true },
    stateCode: { type: String, default: '' },
    pan: { type: String, default: '', uppercase: true },
    drugLicenseNo: { type: String, default: '' },
    paymentTermsDays: { type: Number, default: 30 },
    openingBalanceMinor: { type: Number, default: 0 },
    /** Amount we owe the supplier (payable). Denormalised from the ledger. */
    balanceMinor: { type: Number, default: 0 },
    bank: {
      accountName: { type: String, default: '' },
      accountNumber: { type: String, default: '' },
      ifsc: { type: String, default: '' },
      upiId: { type: String, default: '' },
    },
    documents: { type: [attachmentSchema], default: [] },
    notes: { type: String, default: '' },
    customFields: { type: Schema.Types.Mixed, default: {} },
    status: { type: String, enum: ['active', 'inactive', 'archived'], default: 'active' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, toJSON: jsonOptions, minimize: false },
);

supplierSchema.index({ organizationId: 1, nameNormalized: 1 });
supplierSchema.index({ organizationId: 1, phone: 1 });
supplierSchema.index({ organizationId: 1, gstin: 1 }, { sparse: true });
supplierSchema.index({ organizationId: 1, status: 1, balanceMinor: -1 });

export type SupplierDoc = InferSchemaType<typeof supplierSchema> & { _id: Types.ObjectId };
export const SupplierModel = model('Supplier', supplierSchema);
