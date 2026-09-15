import { Types, type Model } from 'mongoose';

interface PayableDoc {
  _id: Types.ObjectId;
  number: string;
  paidMinor?: number;
  balanceMinor?: number;
  payments: { method: string; amountMinor: number; reference?: string; receivedAt?: Date; paymentId?: Types.ObjectId | null }[];
}
interface PartyDoc {
  _id: Types.ObjectId;
  name: string;
  balanceMinor?: number;
}
import type { PartyPaymentInput, PartyPaymentDto, PaginationQuery } from '@pharmaos/shared';
import { PartyPaymentModel, type PartyPaymentDoc } from '@/models/party-payment.model';
import { SaleModel, type SaleDoc } from '@/models/sale.model';
import { PurchaseModel, type PurchaseDoc } from '@/models/purchase.model';
import { CustomerModel } from '@/models/customer.model';
import { SupplierModel } from '@/models/supplier.model';
import type { RequestContext } from '@/lib/context';
import { orgFilter, outletFilter, trustedFilter } from '@/lib/scoped';
import { pageMeta } from '@/lib/pagination';
import { BusinessRuleError, NotFoundError, ValidationError } from '@/lib/errors';
import { withTransaction } from '@/db/transaction';
import { audit } from '@/services/audit.service';
import { nextDocumentNumber } from '@/services/sequence.service';
import { postLedgerEntry, type PartyType } from '@/services/ledger.service';
import { requireOutletId } from '@/modules/inventory/inventory.service';
import { userRefs, isoNow } from '@/modules/common/refs';

function toDto(doc: PartyPaymentDoc, partyName: string, who: (id: Types.ObjectId | null | undefined) => { id: string; name: string } | null): PartyPaymentDto {
  return {
    id: String(doc._id),
    number: doc.number,
    partyId: String(doc.partyId),
    partyName,
    date: isoNow(doc.date),
    method: doc.method as PartyPaymentDto['method'],
    amountMinor: doc.amountMinor,
    reference: doc.reference ?? '',
    notes: doc.notes ?? '',
    allocations: doc.allocations.map((a) => ({ documentId: String(a.documentId), documentNumber: a.documentNumber ?? '', amountMinor: a.amountMinor })),
    unallocatedMinor: doc.unallocatedMinor ?? 0,
    createdBy: who(doc.createdBy),
    createdAt: isoNow(doc.createdAt),
  };
}

/** Open documents (with a balance) for a party, oldest first, for allocation UIs. */
export async function outstandingDocuments(ctx: RequestContext, partyType: PartyType, partyId: string) {
  if (partyType === 'customer') {
    const sales = await SaleModel.find(orgFilter<SaleDoc>(ctx, { customerId: partyId, status: 'completed', balanceMinor: { $gt: 0 } })).sort({ completedAt: 1 }).select('number completedAt totals.grandTotalMinor paidMinor balanceMinor dueDate').lean<SaleDoc[]>();
    return sales.map((s) => ({ id: String(s._id), number: s.number, date: isoNow(s.completedAt), totalMinor: s.totals.grandTotalMinor, paidMinor: s.paidMinor ?? 0, balanceMinor: s.balanceMinor ?? 0, dueDate: s.dueDate ? s.dueDate.toISOString() : null, overdue: !!s.dueDate && s.dueDate < new Date() }));
  }
  const purchases = await PurchaseModel.find(orgFilter<PurchaseDoc>(ctx, { supplierId: partyId, status: { $ne: 'cancelled' }, balanceMinor: { $gt: 0 } })).sort({ invoiceDate: 1 }).select('number invoiceDate totals.grandTotalMinor paidMinor balanceMinor dueDate').lean<PurchaseDoc[]>();
  return purchases.map((p) => ({ id: String(p._id), number: p.number, date: isoNow(p.invoiceDate), totalMinor: p.totals.grandTotalMinor, paidMinor: p.paidMinor ?? 0, balanceMinor: p.balanceMinor ?? 0, dueDate: p.dueDate ? p.dueDate.toISOString() : null, overdue: !!p.dueDate && p.dueDate < new Date() }));
}

/**
 * Records a payment from a customer (receipt) or to a supplier, allocates it to open documents
 * (explicitly or oldest-first), updates each document's paid/balance and posts the ledger credit.
 */
export async function recordPayment(ctx: RequestContext, partyType: PartyType, input: PartyPaymentInput) {
  const outletId = requireOutletId(ctx);
  const PartyModel = (partyType === 'customer' ? CustomerModel : SupplierModel) as unknown as Model<PartyDoc>;
  const party = await PartyModel.findOne(orgFilter(ctx, { _id: input.partyId })).lean<PartyDoc>();
  if (!party) throw new NotFoundError(partyType === 'customer' ? 'Customer' : 'Supplier');
  const DocModel = (partyType === 'customer' ? SaleModel : PurchaseModel) as unknown as Model<PayableDoc>;
  const partyField = partyType === 'customer' ? 'customerId' : 'supplierId';

  const doc = await withTransaction(async (session) => {
    const open = await DocModel.find(trustedFilter({ organizationId: ctx.organizationId, [partyField]: party._id, balanceMinor: { $gt: 0 }, status: partyType === 'customer' ? 'completed' : { $ne: 'cancelled' } }))
      .sort(partyType === 'customer' ? { completedAt: 1 } : { invoiceDate: 1 })
      .session(session);

    let remaining = input.amountMinor;
    const allocations: { documentId: Types.ObjectId; documentNumber: string; amountMinor: number }[] = [];
    if (input.allocations.length) {
      for (const a of input.allocations) {
        const target = open.find((d) => String(d._id) === a.documentId);
        if (!target) throw new ValidationError(`Document ${a.documentId} is not open for this party`, [{ path: 'body.allocations', message: 'Not open' }]);
        if (a.amountMinor > (target.balanceMinor ?? 0)) throw new ValidationError(`Allocation to ${target.number} exceeds its balance`, [{ path: 'body.allocations', message: 'Exceeds balance' }]);
        if (a.amountMinor > remaining) throw new ValidationError('Allocations exceed the payment amount', [{ path: 'body.allocations', message: 'Exceeds payment' }]);
        allocations.push({ documentId: target._id, documentNumber: target.number, amountMinor: a.amountMinor });
        remaining -= a.amountMinor;
      }
    } else {
      for (const target of open) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, target.balanceMinor ?? 0);
        if (take <= 0) continue;
        allocations.push({ documentId: target._id, documentNumber: target.number, amountMinor: take });
        remaining -= take;
      }
    }
    if (remaining > 0 && (party.balanceMinor ?? 0) - (input.amountMinor - remaining) < remaining) {
      // Paying more than the party owes: allowed (advance) but flagged in the audit trail.
    }

    const { number } = await nextDocumentNumber(ctx.organizationId, outletId, partyType === 'customer' ? 'customerPayment' : 'supplierPayment', session);
    const [payment] = await PartyPaymentModel.create(
      [{ organizationId: ctx.organizationId, outletId, number, partyType, partyId: party._id, date: input.date ?? new Date(), method: input.method, amountMinor: input.amountMinor, reference: input.reference, notes: input.notes, allocations, unallocatedMinor: remaining, createdBy: ctx.userId }],
      { session },
    );
    for (const a of allocations) {
      const target = open.find((d) => String(d._id) === String(a.documentId))!;
      target.paidMinor = (target.paidMinor ?? 0) + a.amountMinor;
      target.balanceMinor = (target.balanceMinor ?? 0) - a.amountMinor;
      target.payments.push({ method: input.method, amountMinor: a.amountMinor, reference: input.reference, receivedAt: input.date ?? new Date(), paymentId: payment!._id });
      await target.save({ session });
    }
    await postLedgerEntry(ctx, { partyType, partyId: party._id, type: 'payment', refType: 'PartyPayment', refId: payment!._id, refNumber: number, creditMinor: input.amountMinor, date: input.date ?? new Date(), note: allocations.length ? `Against ${allocations.map((a) => a.documentNumber).join(', ')}` : 'On account' }, session);
    await audit(ctx, { action: `${partyType}.paymentRecorded`, entityType: 'PartyPayment', entityId: payment!._id, summary: `${partyType === 'customer' ? 'Received' : 'Paid'} ${input.amountMinor / 100} ${partyType === 'customer' ? 'from' : 'to'} ${party.name} (${number})`, after: { amountMinor: input.amountMinor, method: input.method, allocations, unallocatedMinor: remaining } }, session);
    return payment!;
  });
  const who = await userRefs([doc.createdBy]);
  return toDto(doc.toObject() as PartyPaymentDoc, party.name, who);
}

export async function cancelPayment(ctx: RequestContext, id: string, reason: string) {
  const payment = await PartyPaymentModel.findOne(orgFilter<PartyPaymentDoc>(ctx, { _id: id }));
  if (!payment) throw new NotFoundError('Payment');
  if (payment.status === 'cancelled') throw new BusinessRuleError('Payment is already cancelled');
  const DocModel = (payment.partyType === 'customer' ? SaleModel : PurchaseModel) as unknown as Model<PayableDoc>;
  await withTransaction(async (session) => {
    for (const a of payment.allocations) {
      const target = await DocModel.findOne({ _id: a.documentId, organizationId: ctx.organizationId }).session(session);
      if (!target) continue;
      target.paidMinor = (target.paidMinor ?? 0) - a.amountMinor;
      target.balanceMinor = (target.balanceMinor ?? 0) + a.amountMinor;
      target.set('payments', target.payments.filter((p) => String(p.paymentId ?? '') !== String(payment._id)));
      await target.save({ session });
    }
    payment.status = 'cancelled';
    payment.cancelledAt = new Date();
    payment.cancelReason = reason;
    await payment.save({ session });
    await postLedgerEntry(ctx, { partyType: payment.partyType as PartyType, partyId: payment.partyId, type: 'cancellation', refType: 'PartyPayment', refId: payment._id, refNumber: payment.number, debitMinor: payment.amountMinor, note: `Payment cancelled: ${reason}` }, session);
    await audit(ctx, { action: 'payment.cancelled', entityType: 'PartyPayment', entityId: payment._id, summary: `Cancelled payment ${payment.number}: ${reason}` }, session);
  });
  const who = await userRefs([payment.createdBy]);
  return toDto(payment.toObject() as PartyPaymentDoc, '', who);
}

export async function listPayments(ctx: RequestContext, partyType: PartyType, query: PaginationQuery & { partyId?: string; from?: Date; to?: Date }) {
  const filter = outletFilter<PartyPaymentDoc>(ctx, {
    partyType,
    ...(query.partyId ? { partyId: query.partyId } : {}),
    ...(query.from || query.to ? { date: { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) } } : {}),
  });
  const skip = (query.page - 1) * query.pageSize;
  const [docs, total] = await Promise.all([PartyPaymentModel.find(filter).sort({ date: -1, createdAt: -1 }).skip(skip).limit(query.pageSize).lean<PartyPaymentDoc[]>(), PartyPaymentModel.countDocuments(filter)]);
  const PartyModel = (partyType === 'customer' ? CustomerModel : SupplierModel) as unknown as Model<PartyDoc>;
  const parties = await PartyModel.find(trustedFilter({ _id: { $in: docs.map((d) => d.partyId) } })).select('name').lean<PartyDoc[]>();
  const nameMap = new Map(parties.map((p) => [String(p._id), p.name]));
  const who = await userRefs(docs.map((d) => d.createdBy));
  return { items: docs.map((d) => toDto(d, nameMap.get(String(d.partyId)) ?? '', who)), meta: pageMeta(query, total) };
}

export async function getPayment(ctx: RequestContext, id: string) {
  const doc = await PartyPaymentModel.findOne(orgFilter<PartyPaymentDoc>(ctx, { _id: id })).lean<PartyPaymentDoc>();
  if (!doc) throw new NotFoundError('Payment');
  const PartyModel = (doc.partyType === 'customer' ? CustomerModel : SupplierModel) as unknown as Model<PartyDoc>;
  const party = await PartyModel.findById(doc.partyId).select('name').lean<PartyDoc>();
  const who = await userRefs([doc.createdBy]);
  return toDto(doc, party?.name ?? '', who);
}
