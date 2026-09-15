import { Schema, model, type Types, type InferSchemaType } from 'mongoose';
import { addressSchema, attachmentSchema, jsonOptions } from './_shared';

const customerSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    name: { type: String, required: true, trim: true },
    nameNormalized: { type: String, required: true },
    phone: { type: String, required: true },
    altPhone: { type: String, default: '' },
    email: { type: String, default: '', lowercase: true },
    address: { type: addressSchema, default: () => ({}) },
    gstin: { type: String, default: '', uppercase: true },
    stateCode: { type: String, default: '' },
    dateOfBirth: { type: Date, default: null },
    gender: { type: String, default: '' },
    creditLimitMinor: { type: Number, default: 0 },
    creditDays: { type: Number, default: null },
    openingBalanceMinor: { type: Number, default: 0 },
    /** Amount the customer owes us (receivable). Denormalised from the ledger. */
    balanceMinor: { type: Number, default: 0 },
    defaultDiscountBps: { type: Number, default: 0 },
    tags: { type: [String], default: [] },
    documents: { type: [attachmentSchema], default: [] },
    notes: { type: String, default: '' },
    customFields: { type: Schema.Types.Mixed, default: {} },
    lastPurchaseAt: { type: Date, default: null },
    totalPurchasesMinor: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'inactive', 'archived'], default: 'active' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, toJSON: jsonOptions, minimize: false },
);

customerSchema.index({ organizationId: 1, phone: 1 });
customerSchema.index({ organizationId: 1, nameNormalized: 1 });
customerSchema.index({ organizationId: 1, status: 1, balanceMinor: -1 });
customerSchema.index({ organizationId: 1, email: 1 }, { sparse: true });

export type CustomerDoc = InferSchemaType<typeof customerSchema> & { _id: Types.ObjectId };
export const CustomerModel = model('Customer', customerSchema);
