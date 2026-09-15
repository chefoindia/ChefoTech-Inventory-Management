import { Schema, model, type Types, type InferSchemaType } from 'mongoose';
import { jsonOptions } from './_shared';

const templateVersionSchema = new Schema(
  {
    version: { type: Number, required: true },
    layout: { type: Schema.Types.Mixed, required: true },
    note: { type: String, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    createdAt: { type: Date, default: () => new Date() },
  },
  { _id: true },
);

const pdfTemplateSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true },
    /** null = organization-wide; set = outlet-specific override. */
    outletId: { type: Schema.Types.ObjectId, default: null },
    documentType: { type: String, required: true },
    name: { type: String, required: true },
    isDefault: { type: Boolean, default: false },
    isSystem: { type: Boolean, default: false },
    currentVersion: { type: Number, default: 1 },
    layout: { type: Schema.Types.Mixed, required: true },
    versions: { type: [templateVersionSchema], default: [] },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, toJSON: jsonOptions, minimize: false },
);

pdfTemplateSchema.index({ organizationId: 1, documentType: 1, outletId: 1, isDefault: 1 });
pdfTemplateSchema.index({ organizationId: 1, status: 1, documentType: 1 });

export type PdfTemplateDoc = InferSchemaType<typeof pdfTemplateSchema> & { _id: Types.ObjectId };
export const PdfTemplateModel = model('PdfTemplate', pdfTemplateSchema);
