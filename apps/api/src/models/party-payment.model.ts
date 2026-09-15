import { Schema, model, type Types, type InferSchemaType } from 'mongoose';
import { jsonOptions } from './_shared';

/** A payment received from a customer or paid to a supplier, optionally allocated to documents. */
const partyPaymentSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true },
    outletId: { type: Schema.Types.ObjectId, required: true },
    number: { type: String, required: true },
    partyType: { type: String, enum: ['customer', 'supplier'], required: true },
    partyId: { type: Schema.Types.ObjectId, required: true },
    date: { type: Date, required: true },
    method: { type: String, required: true },
    amountMinor: { type: Number, required: true },
    reference: { type: String, default: '' },
    notes: { type: String, default: '' },
    allocations: {
      type: [
        new Schema(
          {
            documentId: { type: Schema.Types.ObjectId, required: true },
            documentNumber: { type: String, default: '' },
            amountMinor: { type: Number, required: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    unallocatedMinor: { type: Number, default: 0 },
    status: { type: String, enum: ['completed', 'cancelled'], default: 'completed' },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, toJSON: jsonOptions },
);

partyPaymentSchema.index({ organizationId: 1, outletId: 1, number: 1 }, { unique: true });
partyPaymentSchema.index({ organizationId: 1, partyType: 1, partyId: 1, date: -1 });
partyPaymentSchema.index({ organizationId: 1, outletId: 1, date: -1 });

export type PartyPaymentDoc = InferSchemaType<typeof partyPaymentSchema> & { _id: Types.ObjectId };
export const PartyPaymentModel = model('PartyPayment', partyPaymentSchema);
