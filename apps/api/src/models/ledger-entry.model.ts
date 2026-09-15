import { Schema, model, type Types, type InferSchemaType } from 'mongoose';
import { jsonOptions } from './_shared';

/**
 * Append-only party ledger shared by customers (receivable) and suppliers (payable).
 * Convention: `debitMinor` increases what the party owes us / what we owe them (the balance),
 * `creditMinor` decreases it. `balanceAfterMinor` is the running balance after this entry.
 */
const ledgerEntrySchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true },
    outletId: { type: Schema.Types.ObjectId, default: null },
    partyType: { type: String, enum: ['customer', 'supplier'], required: true },
    partyId: { type: Schema.Types.ObjectId, required: true },
    date: { type: Date, required: true, default: () => new Date() },
    type: {
      type: String,
      enum: ['opening', 'sale', 'purchase', 'payment', 'sales_return', 'purchase_return', 'adjustment', 'cancellation', 'credit_note', 'debit_note'],
      required: true,
    },
    refType: { type: String, default: '' },
    refId: { type: Schema.Types.ObjectId, default: null },
    refNumber: { type: String, default: '' },
    debitMinor: { type: Number, default: 0 },
    creditMinor: { type: Number, default: 0 },
    balanceAfterMinor: { type: Number, required: true },
    note: { type: String, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, toJSON: jsonOptions },
);

ledgerEntrySchema.index({ organizationId: 1, partyType: 1, partyId: 1, date: -1, _id: -1 });
ledgerEntrySchema.index({ organizationId: 1, refType: 1, refId: 1 });

export type LedgerEntryDoc = InferSchemaType<typeof ledgerEntrySchema> & { _id: Types.ObjectId };
export const LedgerEntryModel = model('LedgerEntry', ledgerEntrySchema);
