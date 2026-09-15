import { Schema, model, type Types, type InferSchemaType } from 'mongoose';
import { attachmentSchema, jsonOptions } from './_shared';

const productUnitSchema = new Schema(
  {
    unitId: { type: Schema.Types.ObjectId, ref: 'Unit', required: true },
    factorToBase: { type: Number, required: true, min: 1 },
    isDefaultPurchase: { type: Boolean, default: false },
    isDefaultSale: { type: Boolean, default: false },
    allowLooseSale: { type: Boolean, default: true },
  },
  { _id: false },
);

const barcodeSchema = new Schema(
  {
    code: { type: String, required: true, trim: true },
    unitId: { type: Schema.Types.ObjectId, ref: 'Unit', default: null },
    isPrimary: { type: Boolean, default: false },
    source: { type: String, enum: ['manufacturer', 'internal'], default: 'manufacturer' },
  },
  { _id: false },
);

const productSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    name: { type: String, required: true, trim: true },
    nameNormalized: { type: String, required: true },
    brandName: { type: String, default: '' },
    genericName: { type: String, default: '' },
    composition: { type: String, default: '' },
    manufacturer: { type: String, default: '' },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    dosageForm: { type: String, default: 'other' },
    strength: { type: String, default: '' },
    packLabel: { type: String, default: '' },
    hsnCode: { type: String, default: '' },
    tax: {
      rateBps: { type: Number, default: 1200 },
      cessBps: { type: Number, default: 0 },
    },
    schedule: { type: String, default: 'none' },
    requiresPrescription: { type: Boolean, default: false },
    baseUnitId: { type: Schema.Types.ObjectId, ref: 'Unit', required: true },
    pricingUnitId: { type: Schema.Types.ObjectId, ref: 'Unit', required: true },
    units: { type: [productUnitSchema], default: [] },
    pricing: {
      mrpMinor: { type: Number, default: 0 },
      sellingPriceMinor: { type: Number, default: 0 },
      purchasePriceMinor: { type: Number, default: 0 },
    },
    stockRules: {
      reorderLevelBase: { type: Number, default: 0 },
      minStockBase: { type: Number, default: 0 },
      maxStockBase: { type: Number, default: 0 },
    },
    barcodes: { type: [barcodeSchema], default: [] },
    rackLocation: { type: String, default: '' },
    images: { type: [attachmentSchema], default: [] },
    documents: { type: [attachmentSchema], default: [] },
    /** Lower-cased word prefixes for fast prefix search over name/brand/generic/composition/manufacturer. */
    searchTokens: { type: [String], default: [] },
    tags: { type: [String], default: [] },
    notes: { type: String, default: '' },
    customFields: { type: Schema.Types.Mixed, default: {} },
    /** True once any inventory movement exists; unit factors become immutable. */
    hasMovements: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'inactive', 'archived'], default: 'active' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, toJSON: jsonOptions, minimize: false },
);

productSchema.index({ organizationId: 1, nameNormalized: 1 });
productSchema.index({ organizationId: 1, 'barcodes.code': 1 }, { unique: true, partialFilterExpression: { 'barcodes.code': { $exists: true } } });
productSchema.index({ organizationId: 1, searchTokens: 1 });
productSchema.index({ organizationId: 1, categoryId: 1, status: 1 });
productSchema.index({ organizationId: 1, status: 1, updatedAt: -1 });
productSchema.index({ organizationId: 1, manufacturer: 1 });

export type ProductDoc = InferSchemaType<typeof productSchema> & { _id: Types.ObjectId };
export const ProductModel = model('Product', productSchema);

export function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Tokens: every word plus its 3+ char prefixes so an anchored regex hits the index. */
export function buildSearchTokens(...fields: string[]): string[] {
  const tokens = new Set<string>();
  for (const f of fields) {
    for (const word of normalizeName(f).split(/[^a-z0-9]+/)) {
      if (!word) continue;
      tokens.add(word);
    }
  }
  return [...tokens].slice(0, 60);
}
