import { Schema, model, type Types, type InferSchemaType } from 'mongoose';
import { attachmentSchema, jsonOptions } from './_shared';

/**
 * History of rendered documents. The PDF bytes are stored inline (bounded size) so history stays
 * exact even if templates change later; a Cloudinary copy is kept when configured.
 */
const generatedDocumentSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true },
    outletId: { type: Schema.Types.ObjectId, default: null },
    documentType: { type: String, required: true },
    refType: { type: String, required: true },
    refId: { type: Schema.Types.ObjectId, required: true },
    refNumber: { type: String, default: '' },
    templateId: { type: Schema.Types.ObjectId, required: true },
    templateVersion: { type: Number, required: true },
    fileName: { type: String, required: true },
    bytes: { type: Number, default: 0 },
    pdf: { type: Buffer, select: false },
    attachment: { type: attachmentSchema, default: null },
    generatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    emails: {
      type: [new Schema({ to: String, status: { type: String, enum: ['sent', 'failed'] }, error: { type: String, default: '' }, messageId: { type: String, default: '' }, sentAt: { type: Date, default: () => new Date() } }, { _id: false })],
      default: [],
    },
  },
  { timestamps: { createdAt: 'generatedAt', updatedAt: true }, toJSON: jsonOptions },
);

generatedDocumentSchema.index({ organizationId: 1, refType: 1, refId: 1, generatedAt: -1 });
generatedDocumentSchema.index({ organizationId: 1, documentType: 1, generatedAt: -1 });

export type GeneratedDocumentDoc = InferSchemaType<typeof generatedDocumentSchema> & { _id: Types.ObjectId; generatedAt: Date };
export const GeneratedDocumentModel = model('GeneratedDocument', generatedDocumentSchema);
