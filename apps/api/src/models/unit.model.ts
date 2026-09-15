import { Schema, model, type Types, type InferSchemaType } from 'mongoose';
import { jsonOptions } from './_shared';

const unitSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    name: { type: String, required: true, trim: true },
    nameNormalized: { type: String, required: true },
    abbreviation: { type: String, required: true, trim: true },
    allowsDecimal: { type: Boolean, default: false },
    isSystem: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'inactive', 'archived'], default: 'active' },
  },
  { timestamps: true, toJSON: jsonOptions },
);

unitSchema.index({ organizationId: 1, nameNormalized: 1 }, { unique: true });

export type UnitDoc = InferSchemaType<typeof unitSchema> & { _id: Types.ObjectId };
export const UnitModel = model('Unit', unitSchema);

/** Seeded into every new organization. */
export const DEFAULT_UNITS: { name: string; abbreviation: string; allowsDecimal?: boolean }[] = [
  { name: 'Tablet', abbreviation: 'tab' },
  { name: 'Capsule', abbreviation: 'cap' },
  { name: 'Strip', abbreviation: 'strip' },
  { name: 'Box', abbreviation: 'box' },
  { name: 'Bottle', abbreviation: 'btl' },
  { name: 'Millilitre', abbreviation: 'ml' },
  { name: 'Gram', abbreviation: 'g' },
  { name: 'Piece', abbreviation: 'pc' },
  { name: 'Pack', abbreviation: 'pack' },
  { name: 'Vial', abbreviation: 'vial' },
  { name: 'Tube', abbreviation: 'tube' },
  { name: 'Sachet', abbreviation: 'sach' },
  { name: 'Ampoule', abbreviation: 'amp' },
  { name: 'Unit', abbreviation: 'unit' },
];
