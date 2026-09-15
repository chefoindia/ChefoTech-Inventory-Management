import { Schema, model, type Types, type InferSchemaType } from 'mongoose';

/**
 * Atomic counters for document numbering. One row per (org, outlet|null, documentType, fyKey|null).
 * Incremented with findOneAndUpdate({$inc}) inside the document's transaction so numbers are gapless
 * per committed transaction and can never duplicate.
 */
const documentSequenceSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true },
    outletId: { type: Schema.Types.ObjectId, default: null },
    documentType: { type: String, required: true },
    fyKey: { type: String, default: null },
    next: { type: Number, default: 1 },
  },
  { versionKey: false },
);

documentSequenceSchema.index(
  { organizationId: 1, outletId: 1, documentType: 1, fyKey: 1 },
  { unique: true },
);

export type DocumentSequenceDoc = InferSchemaType<typeof documentSequenceSchema> & { _id: Types.ObjectId };
export const DocumentSequenceModel = model('DocumentSequence', documentSequenceSchema);
