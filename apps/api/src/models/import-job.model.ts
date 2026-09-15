import { Schema, model, type Types, type InferSchemaType } from 'mongoose';
import { jsonOptions } from './_shared';

const importJobSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true },
    outletId: { type: Schema.Types.ObjectId, default: null },
    entity: { type: String, required: true },
    fileName: { type: String, default: '' },
    status: { type: String, enum: ['validated', 'committing', 'committed', 'failed', 'discarded'], default: 'validated' },
    duplicateStrategy: { type: String, enum: ['skip', 'update', 'fail'], default: 'skip' },
    totalRows: { type: Number, default: 0 },
    validRows: { type: Number, default: 0 },
    invalidRows: { type: Number, default: 0 },
    duplicateRows: { type: Number, default: 0 },
    committedRows: { type: Number, default: 0 },
    /** Parsed + validated rows (normalised values) kept until commit or discard. */
    rows: { type: [Schema.Types.Mixed], default: [] },
    error: { type: String, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    committedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: jsonOptions },
);

importJobSchema.index({ organizationId: 1, createdAt: -1 });
importJobSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 });

export type ImportJobDoc = InferSchemaType<typeof importJobSchema> & { _id: Types.ObjectId };
export const ImportJobModel = model('ImportJob', importJobSchema);
