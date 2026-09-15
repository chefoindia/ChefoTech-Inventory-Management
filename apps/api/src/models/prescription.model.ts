import { Schema, model, type Types, type InferSchemaType } from 'mongoose';
import { attachmentSchema, jsonOptions } from './_shared';

const prescriptionSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true },
    customerId: { type: Schema.Types.ObjectId, required: true },
    doctorName: { type: String, required: true },
    doctorRegNo: { type: String, default: '' },
    hospital: { type: String, default: '' },
    prescriptionDate: { type: Date, required: true },
    validUntil: { type: Date, default: null },
    diagnosis: { type: String, default: '' },
    items: {
      type: [new Schema({ medicine: String, dosage: { type: String, default: '' }, duration: { type: String, default: '' }, productId: { type: Schema.Types.ObjectId, default: null } }, { _id: false })],
      default: [],
    },
    files: { type: [attachmentSchema], default: [] },
    notes: { type: String, default: '' },
    linkedSaleIds: { type: [Schema.Types.ObjectId], default: [] },
    status: { type: String, enum: ['active', 'used', 'expired', 'archived'], default: 'active' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, toJSON: jsonOptions },
);

prescriptionSchema.index({ organizationId: 1, customerId: 1, prescriptionDate: -1 });
prescriptionSchema.index({ organizationId: 1, status: 1, prescriptionDate: -1 });

export type PrescriptionDoc = InferSchemaType<typeof prescriptionSchema> & { _id: Types.ObjectId };
export const PrescriptionModel = model('Prescription', prescriptionSchema);
