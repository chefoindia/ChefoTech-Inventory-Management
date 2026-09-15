import { Types } from 'mongoose';
import { computeDocumentTotals, priceForBaseQty, type CreateSalesReturnInput, type SalesReturnDto, type PaginationQuery, type TaxContext } from '@pharmaos/shared';
import { SalesReturnModel, type SalesReturnDoc } from '@/models/sales-return.model';
import { SaleModel, type SaleDoc } from '@/models/sale.model';
import { CustomerModel } from '@/models/customer.model';
import { PartyPaymentModel } from '@/models/party-payment.model';
import { OrganizationModel, type OrganizationDoc } from '@/models/organization.model';
import type { RequestContext } from '@/lib/context';
import { orgFilter, outletFilter } from '@/lib/scoped';
import { pageMeta } from '@/lib/pagination';
import { BusinessRuleError, NotFoundError, ValidationError } from '@/lib/errors';
import { withTransaction } from '@/db/transaction';
import { audit } from '@/services/audit.service';
import { nextDocumentNumber } from '@/services/sequence.service';
import { postLedgerEntry } from '@/services/ledger.service';
import { applyStockChange } from '@/modules/inventory/stock.service';
import { requireOutletId } from '@/modules/inventory/inventory.service';
import { userRefs, isoNow } from '@/modules/common/refs';

function toDto(doc: SalesReturnDoc, who: (id: Types.ObjectId | null | undefined) => { id: string; name: string } | null): SalesReturnDto {
  return {
    id: String(doc._id),
    number: doc.number,
    outletId: String(doc.outletId),
    saleId: String(doc.saleId),
    saleNumber: doc.saleNumber ?? '',
    customerId: doc.customerId ? String(doc.customerId) : null,
    customerName: doc.customerName ?? '',
    status: doc.status as SalesReturnDto['status'],
    lines: doc.lines.map((l) => ({
      saleLineId: l.saleLineId,
      productId: String(l.productId),
      productName: l.productName,
      batchId: String(l.batchId),
      batchNumber: l.batchNumber,
      unitName: l.unitName ?? '',
      qty: l.qty,
      qtyBase: l.qtyBase,
      unitPriceMinor: l.unitPriceMinor,
      taxRateBps: l.taxRateBps ?? 0,
      taxableMinor: l.taxableMinor ?? 0,
      taxMinor: l.taxMinor ?? 0,
      totalMinor: l.totalMinor ?? 0,
      condition: l.condition as SalesReturnDto['lines'][number]['condition'],
      reason: l.reason ?? 'other',
      note: l.note ?? '',
    })),
    totals: doc.totals as SalesReturnDto['totals'],
    settlement: doc.settlement as SalesReturnDto['settlement'],
    refund: doc.refund ? { method: doc.refund.method as NonNullable<SalesReturnDto['refund']>['method'], amountMinor: doc.refund.amountMinor, reference: doc.refund.reference ?? '', receivedAt: isoNow(doc.refund.receivedAt) } : null,
    notes: doc.notes ?? '',
    createdBy: who(doc.createdBy),
    createdAt: isoNow(doc.createdAt),
  };
}

/**
 * Sales return against an invoice. Quantities are capped at sold − already returned per line.
 * Resaleable items go back to the same batch; damaged/expired ones are received then written off,
 * so every unit is traceable. The refund value uses the line's effective (post-discount) price.
 */
export async function createSalesReturn(ctx: RequestContext, input: CreateSalesReturnInput) {
  const outletId = requireOutletId(ctx);
  const sale = await SaleModel.findOne(orgFilter<SaleDoc>(ctx, { _id: input.saleId, status: 'completed' }));
  if (!sale) throw new NotFoundError('Invoice');
  if (String(sale.outletId) !== String(outletId)) throw new BusinessRuleError('Switch to the outlet that issued this invoice');
  if (input.settlement === 'refund' && !input.refund) throw new ValidationError('Refund details are required', [{ path: 'body.refund', message: 'Required' }]);
  if (input.settlement === 'credit_note' && !sale.customerId) throw new BusinessRuleError('Credit notes need a registered customer; refund the walk-in customer instead');

  const org = await OrganizationModel.findById(ctx.organizationId).select('settings.tax settings.sales').lean<OrganizationDoc>();
  const taxCtx: TaxContext = { engine: 'in-gst', pricesIncludeTax: sale.pricesIncludeTax ?? true, supplierStateCode: 'x', placeOfSupplyStateCode: sale.isInterState ? 'y' : 'x', compositionScheme: false };

  const prepared = input.lines.map((r) => {
    const line = sale.lines.find((l) => l.lineId === r.saleLineId);
    if (!line) throw new ValidationError('Unknown invoice line', [{ path: 'body.lines', message: r.saleLineId }]);
    const qtyBase = Math.round(r.qty * line.factorToBase);
    const returnable = line.qtyBase - (line.returnedBase ?? 0);
    if (qtyBase <= 0) throw new ValidationError('Quantity must be positive');
    if (qtyBase > returnable) throw new BusinessRuleError(`${line.productName}: only ${returnable} base unit(s) can still be returned`);
    // Effective price after line discount, proportional to returned quantity.
    const netLine = (line.grossMinor ?? 0) - (line.discountMinor ?? 0);
    const grossMinor = Math.round((netLine * qtyBase) / line.qtyBase);
    return { line, qtyBase, input: r, taxInput: { grossMinor, taxRateBps: line.taxRateBps ?? 0, cessBps: line.cessBps ?? 0 } };
  });
  const { lines: taxed, totals } = computeDocumentTotals(prepared.map((p) => p.taxInput), taxCtx, { roundOff: org?.settings?.sales?.roundOff ?? 'nearest' });
  // Rounding on partial returns must never refund more than what is left of the invoice.
  const refundable = sale.totals.grandTotalMinor - (sale.refundedMinor ?? 0);
  if (totals.grandTotalMinor > refundable) {
    totals.roundOffMinor -= totals.grandTotalMinor - refundable;
    totals.grandTotalMinor = refundable;
  }
  const refundAmount = totals.grandTotalMinor;

  const doc = await withTransaction(async (session) => {
    const { number } = await nextDocumentNumber(ctx.organizationId, outletId, 'salesReturn', session);
    const refId = new Types.ObjectId();
    // Re-read inside the transaction: a retried transaction must not double-apply in-memory mutations.
    const fresh = await SaleModel.findById(sale._id).session(session);
    if (!fresh) throw new NotFoundError('Invoice');
    for (const p of prepared) {
      const fl = fresh.lines.find((l) => l.lineId === p.line.lineId)!;
      if (p.qtyBase > fl.qtyBase - (fl.returnedBase ?? 0)) throw new BusinessRuleError(`${fl.productName}: only ${fl.qtyBase - (fl.returnedBase ?? 0)} base unit(s) can still be returned`);
      await applyStockChange(ctx, { outletId, productId: p.line.productId, batchId: p.line.batchId, qtyBaseDelta: p.qtyBase, reason: 'sales_return', refType: 'SalesReturn', refId, refNumber: number, unitCostMinor: p.line.batchCostMinor, pricingUnitFactor: p.line.pricingUnitFactor, note: p.input.reason }, session);
      if (p.input.condition !== 'resaleable') {
        await applyStockChange(ctx, { outletId, productId: p.line.productId, batchId: p.line.batchId, qtyBaseDelta: -p.qtyBase, reason: p.input.condition === 'expired' ? 'expiry' : 'damage', refType: 'SalesReturn', refId, refNumber: number, note: `Returned ${p.input.condition}`, allowNonSellable: true }, session);
      }
      fl.returnedBase = (fl.returnedBase ?? 0) + p.qtyBase;
    }
    fresh.refundedMinor = (fresh.refundedMinor ?? 0) + refundAmount;
    await fresh.save({ session });

    const [created] = await SalesReturnModel.create(
      [
        {
          _id: refId,
          organizationId: ctx.organizationId,
          outletId,
          number,
          saleId: sale._id,
          saleNumber: sale.number,
          customerId: sale.customerId,
          customerName: sale.customerSnapshot?.name ?? '',
          lines: prepared.map((p, i) => ({
            saleLineId: p.line.lineId,
            productId: p.line.productId,
            productName: p.line.productName,
            hsnCode: p.line.hsnCode,
            batchId: p.line.batchId,
            batchNumber: p.line.batchNumber,
            unitId: p.line.unitId,
            unitName: p.line.unitName,
            factorToBase: p.line.factorToBase,
            qty: p.input.qty,
            qtyBase: p.qtyBase,
            pricingUnitFactor: p.line.pricingUnitFactor,
            unitPriceMinor: p.line.unitPriceMinor,
            batchCostMinor: p.line.batchCostMinor,
            taxRateBps: p.line.taxRateBps,
            cessBps: p.line.cessBps,
            grossMinor: taxed[i]!.grossMinor,
            taxableMinor: taxed[i]!.taxableMinor,
            cgstMinor: taxed[i]!.cgstMinor,
            sgstMinor: taxed[i]!.sgstMinor,
            igstMinor: taxed[i]!.igstMinor,
            cessMinor: taxed[i]!.cessMinor,
            taxMinor: taxed[i]!.taxMinor,
            totalMinor: taxed[i]!.totalMinor,
            condition: p.input.condition,
            reason: p.input.reason,
            note: p.input.note ?? '',
          })),
          totals,
          isInterState: sale.isInterState,
          settlement: input.settlement,
          refund: input.settlement === 'refund' && input.refund ? { method: input.refund.method, amountMinor: refundAmount, reference: input.refund.reference, receivedAt: new Date() } : null,
          notes: input.notes,
          createdBy: ctx.userId,
        },
      ],
      { session },
    );

    if (sale.customerId) {
      if (input.settlement === 'credit_note') {
        // Reduce what the customer owes (or create an advance if they owe nothing).
        await postLedgerEntry(ctx, { partyType: 'customer', partyId: sale.customerId, type: 'sales_return', refType: 'SalesReturn', refId, refNumber: number, creditMinor: refundAmount, note: `Credit note for ${sale.number}` }, session);
        // Apply the credit to this invoice's open balance first.
        const applied = Math.min(fresh.balanceMinor ?? 0, refundAmount);
        if (applied > 0) {
          fresh.balanceMinor = (fresh.balanceMinor ?? 0) - applied;
          await fresh.save({ session });
        }
      } else if (input.refund) {
        // Cash refund of a partly-credit invoice first reduces the open balance, then pays cash for the rest.
        const applied = Math.min(fresh.balanceMinor ?? 0, refundAmount);
        if (applied > 0) {
          fresh.balanceMinor = (fresh.balanceMinor ?? 0) - applied;
          await fresh.save({ session });
          await postLedgerEntry(ctx, { partyType: 'customer', partyId: sale.customerId, type: 'sales_return', refType: 'SalesReturn', refId, refNumber: number, creditMinor: applied, note: `Return ${number} set against ${sale.number}` }, session);
        }
        const cash = refundAmount - applied;
        if (cash > 0) {
          const { number: payNo } = await nextDocumentNumber(ctx.organizationId, outletId, 'customerPayment', session);
          await PartyPaymentModel.create([{ organizationId: ctx.organizationId, outletId, number: payNo, partyType: 'customer', partyId: sale.customerId, date: new Date(), method: input.refund.method, amountMinor: -cash, reference: input.refund.reference, notes: `Refund for return ${number}`, allocations: [], unallocatedMinor: 0, createdBy: ctx.userId }], { session });
        }
      }
      await CustomerModel.updateOne({ _id: sale.customerId }, { $inc: { totalPurchasesMinor: -refundAmount } }, { session });
    } else if (input.refund) {
      // Walk-in: record the cash outflow so the day's cash reconciles.
      const { number: payNo } = await nextDocumentNumber(ctx.organizationId, outletId, 'customerPayment', session);
      await PartyPaymentModel.create([{ organizationId: ctx.organizationId, outletId, number: payNo, partyType: 'customer', partyId: refId, date: new Date(), method: input.refund.method, amountMinor: -refundAmount, reference: input.refund.reference, notes: `Walk-in refund for return ${number}`, allocations: [], unallocatedMinor: 0, createdBy: ctx.userId }], { session });
    }
    await audit(ctx, { action: 'salesReturn.created', entityType: 'SalesReturn', entityId: refId, summary: `Return ${number} against ${sale.number} for ${refundAmount / 100} (${input.settlement})` }, session);
    return created!;
  });
  const who = await userRefs([doc.createdBy]);
  return toDto(doc.toObject() as SalesReturnDoc, who);
}

export async function listSalesReturns(ctx: RequestContext, query: PaginationQuery & { saleId?: string; customerId?: string }) {
  const filter = outletFilter<SalesReturnDoc>(ctx, { ...(query.saleId ? { saleId: query.saleId } : {}), ...(query.customerId ? { customerId: query.customerId } : {}) });
  const skip = (query.page - 1) * query.pageSize;
  const [docs, total] = await Promise.all([SalesReturnModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.pageSize).lean<SalesReturnDoc[]>(), SalesReturnModel.countDocuments(filter)]);
  const who = await userRefs(docs.map((d) => d.createdBy));
  return { items: docs.map((d) => toDto(d, who)), meta: pageMeta(query, total) };
}

export async function getSalesReturn(ctx: RequestContext, id: string) {
  const doc = await SalesReturnModel.findOne(orgFilter<SalesReturnDoc>(ctx, { _id: id })).lean<SalesReturnDoc>();
  if (!doc) throw new NotFoundError('Sales return');
  const who = await userRefs([doc.createdBy]);
  return toDto(doc, who);
}
