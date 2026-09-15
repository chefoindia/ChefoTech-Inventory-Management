import { Schema, model, type Types, type InferSchemaType } from 'mongoose';
import { DOCUMENT_TYPES } from '@pharmaos/shared';
import { addressSchema, attachmentSchema, jsonOptions } from './_shared';

const numberingRuleSchema = new Schema(
  {
    prefix: { type: String, default: '' },
    padding: { type: Number, default: 6 },
    resetOnFinancialYear: { type: Boolean, default: false },
    perOutlet: { type: Boolean, default: true },
  },
  { _id: false },
);

const settingsSchema = new Schema(
  {
    sales: {
      maxDiscountBps: { type: Number, default: 1000 },
      requireCustomerForCredit: { type: Boolean, default: true },
      defaultCreditDays: { type: Number, default: 30 },
      roundOff: { type: String, enum: ['nearest', 'none'], default: 'nearest' },
      askEmailInvoice: { type: Boolean, default: true },
      cancelWindowHours: { type: Number, default: 24 },
    },
    purchases: {
      requireGrnForStock: { type: Boolean, default: true },
      autoUpdateSellingPriceFromPurchase: { type: Boolean, default: false },
    },
    inventory: {
      expiryWarningDays: { type: [Number], default: [30, 60, 90] },
      lowStockMode: { type: String, enum: ['reorderLevel', 'minStock'], default: 'reorderLevel' },
      blockNearExpirySaleDays: { type: Number, default: 0 },
      adjustmentApprovalThresholdMinor: { type: Number, default: 500_000 },
    },
    tax: {
      engine: { type: String, enum: ['in-gst'], default: 'in-gst' },
      pricesIncludeTax: { type: Boolean, default: true },
    },
    numbering: {
      type: Map,
      of: numberingRuleSchema,
      default: () => new Map(),
    },
    documents: {
      defaultPageSize: { type: String, enum: ['A4', 'A5', 'thermal80', 'thermal58'], default: 'A4' },
    },
  },
  { _id: false, minimize: false },
);

const organizationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    legalName: { type: String, trim: true, default: '' },
    logo: { type: attachmentSchema, default: null },
    email: { type: String, lowercase: true, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    website: { type: String, trim: true, default: '' },
    address: { type: addressSchema, default: () => ({}) },
    tax: {
      gstin: { type: String, uppercase: true, trim: true, default: '' },
      pan: { type: String, uppercase: true, trim: true, default: '' },
      stateCode: { type: String, required: true },
      registrationType: {
        type: String,
        enum: ['regular', 'composition', 'unregistered'],
        default: 'regular',
      },
    },
    currency: { type: String, default: 'INR' },
    locale: { type: String, default: 'en-IN' },
    timezone: { type: String, default: 'Asia/Kolkata' },
    financialYearStartMonth: { type: Number, default: 4, min: 1, max: 12 },
    settings: { type: settingsSchema, default: () => ({}) },
    subscription: {
      planKey: { type: String, default: 'trial' },
      status: { type: String, enum: ['trialing', 'active', 'past_due', 'cancelled'], default: 'trialing' },
      trialEndsAt: { type: Date, default: null },
      limits: {
        outlets: { type: Number, default: 3 },
        users: { type: Number, default: 10 },
        products: { type: Number, default: 20_000 },
        storageMb: { type: Number, default: 2048 },
      },
    },
    subscriptionHistory: { type: [new Schema({ at: Date, from: String, to: String, by: String }, { _id: false })], default: [] },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, toJSON: jsonOptions, minimize: false },
);

organizationSchema.index({ status: 1, createdAt: -1 });

export type OrganizationDoc = InferSchemaType<typeof organizationSchema> & { _id: Types.ObjectId };
export const OrganizationModel = model('Organization', organizationSchema);

export function isDocumentType(value: string): value is (typeof DOCUMENT_TYPES)[number] {
  return (DOCUMENT_TYPES as readonly string[]).includes(value);
}
