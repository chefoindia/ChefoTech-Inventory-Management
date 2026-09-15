import { Types } from 'mongoose';
import {
  computeDocumentTotals,
  isInterState,
  priceForBaseQty,
  applyBps,
  type CreateSaleInput,
  type HoldSaleInput,
  type QuoteSaleInput,
  type SaleDto,
  type SaleQuoteDto,
  type SaleListQuery,
  type HeldSaleSummary,
  type TaxContext,
  type PaginationQuery,
} from '@pharmaos/shared';
import { SaleModel, type SaleDoc } from '@/models/sale.model';
import { CustomerModel, type CustomerDoc } from '@/models/customer.model';
import { ProductModel, type ProductDoc } from '@/models/product.model';
import { ProductBatchModel, type ProductBatchDoc } from '@/models/product-batch.model';
import { UnitModel, type UnitDoc } from '@/models/unit.model';
import { OrganizationModel, type OrganizationDoc } from '@/models/organization.model';
import { OutletModel, type OutletDoc } from '@/models/outlet.model';
import { StockModel, type StockDoc } from '@/models/stock.model';
import type { RequestContext } from '@/lib/context';
import { hasPermission } from '@/lib/context';
import { orgFilter, outletFilter, trustedFilter } from '@/lib/scoped';
import { pageMeta } from '@/lib/pagination';
import { BusinessRuleError, ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { withTransaction } from '@/db/transaction';
import { audit } from '@/services/audit.service';
import { nextDocumentNumber } from '@/services/sequence.service';
import { postLedgerEntry } from '@/services/ledger.service';
import { validateCustomFields } from '@/modules/custom-fields/custom-fields.service';
import { applyStockChange, allocateFefo, startOfToday } from '@/modules/inventory/stock.service';
import { factorFor, requireOutletId, toBaseQty } from '@/modules/inventory/inventory.service';
import { userRefs, iso, isoNow } from '@/modules/common/refs';
import { randomToken } from '@/lib/crypto';
import { events } from '@/lib/events';

/* ---------------------------------------------------------------- context */

interface SaleContext {
  org: OrganizationDoc;
  outlet: OutletDoc;
  taxCtx: TaxContext;
  settings: NonNullable<OrganizationDoc['settings']>;
}

async function loadSaleContext(ctx: RequestContext, outletId: Types.ObjectId, customer: CustomerDoc | null): Promise<SaleContext> {
  const [org, outlet] = await Promise.all([OrganizationModel.findById(ctx.organizationId).lean<OrganizationDoc>(), OutletModel.findById(outletId).lean<OutletDoc>()]);
  if (!org || !outlet) throw new NotFoundError('Outlet');
  const supplierState = outlet.stateCode || org.tax?.stateCode || '';
  // Place of supply: a B2B customer with a GSTIN in another state is inter-state; walk-ins are always local.
  const placeOfSupply = customer?.gstin && customer.stateCode ? customer.stateCode : supplierState;
  return {
    org,
    outlet,
    settings: org.settings!,
    taxCtx: { engine: 'in-gst', pricesIncludeTax: org.settings?.tax?.pricesIncludeTax ?? true, supplierStateCode: supplierState, placeOfSupplyStateCode: placeOfSupply, compositionScheme: org.tax?.registrationType === 'composition' },
  };
}

/* ---------------------------------------------------------------- pricing */

interface PricedLine {
  lineId: string;
  product: ProductDoc;
  batch: ProductBatchDoc;
  unitId: Types.ObjectId;
  unitName: string;
  factor: number;
  qty: number;
  qtyBase: number;
  unitPriceMinor: number;
  mrpPerUnitMinor: number;
  priceOverridden: boolean;
  discountBps: number;
  discountMinor: number;
  note: string;
  taxRateBps: number;
  cessBps: number;
  grossMinor: number;
  costMinor: number;
  availableBase: number;
}

/**
 * Turns request lines into batch-level priced lines. Without a batchId the FEFO allocator may
 * split one request line across several batches (each becomes its own priced line).
 */
async function priceLines(ctx: RequestContext, outletId: Types.ObjectId, sctx: SaleContext, input: QuoteSaleInput, customer: CustomerDoc | null): Promise<{ lines: PricedLine[]; warnings: string[] }> {
  const productIds = [...new Set(input.lines.map((l) => l.productId))];
  const [products, units] = await Promise.all([
    ProductModel.find(orgFilter<ProductDoc>(ctx, { _id: { $in: productIds }, status: 'active' })).lean<ProductDoc[]>(),
    UnitModel.find(orgFilter<UnitDoc>(ctx, {})).lean<UnitDoc[]>(),
  ]);
  if (products.length !== productIds.length) throw new NotFoundError('Product (inactive or unknown)');
  const pMap = new Map(products.map((p) => [String(p._id), p]));
  const uMap = new Map(units.map((u) => [String(u._id), u]));
  const blockDays = sctx.settings.inventory?.blockNearExpirySaleDays ?? 0;
  const maxDiscountBps = sctx.settings.sales?.maxDiscountBps ?? 0;
  const canOverrideDiscount = hasPermission(ctx, 'sales.overrideDiscount');
  const canOverridePrice = hasPermission(ctx, 'sales.overridePrice');
  const canChooseBatch = hasPermission(ctx, 'sales.chooseBatch');
  const warnings: string[] = [];
  const out: PricedLine[] = [];
  const reserved = new Map<string, number>();
  const reserve = (batchId: Types.ObjectId, qty: number) => reserved.set(String(batchId), (reserved.get(String(batchId)) ?? 0) + qty);

  for (const l of input.lines) {
    const product = pMap.get(l.productId)!;
    const pu = product.units.find((u) => String(u.unitId) === l.unitId);
    if (!pu) throw new ValidationError(`Unit not allowed for ${product.name}`, [{ path: 'body.lines', message: 'Unit not configured' }]);
    if (!pu.allowLooseSale && pu.factorToBase === 1 && product.units.length > 1) throw new BusinessRuleError(`${product.name} cannot be sold loose`);
    const factor = factorFor(product, l.unitId);
    const qtyBase = toBaseQty(l.qty, factor, uMap.get(l.unitId)?.allowsDecimal ?? false);
    if (qtyBase <= 0) throw new ValidationError('Quantity must be positive');

    let slices: { batch: ProductBatchDoc; qtyBase: number }[];
    if (l.batchId) {
      const batch = await ProductBatchModel.findOne(orgFilter<ProductBatchDoc>(ctx, { _id: l.batchId, productId: product._id })).lean<ProductBatchDoc>();
      if (!batch) throw new NotFoundError('Batch');
      const stock = await StockModel.findOne({ organizationId: ctx.organizationId, outletId, batchId: batch._id }).lean<StockDoc>();
      const available = (stock?.qtyBase ?? 0) - (reserved.get(String(batch._id)) ?? 0);
      if (batch.expiryDate < startOfToday()) throw new BusinessRuleError(`Batch ${batch.batchNumber} of ${product.name} has expired`);
      if (batch.status !== 'active') throw new BusinessRuleError(`Batch ${batch.batchNumber} is blocked`);
      if (available < qtyBase) throw new BusinessRuleError(`Only ${available} base unit(s) of ${product.name} batch ${batch.batchNumber} available`);
      // Choosing a later-expiring batch while an earlier one has stock needs permission.
      const fefo = await allocateFefo(ctx, outletId, product._id, 1, blockDays).catch(() => []);
      if (fefo[0] && String(fefo[0].batch._id) !== String(batch._id) && fefo[0].batch.expiryDate < batch.expiryDate && !canChooseBatch) {
        throw new ForbiddenError(`Batch ${fefo[0].batch.batchNumber} expires earlier and must be sold first`);
      }
      slices = [{ batch, qtyBase }];
    } else {
      slices = await allocateFefo(ctx, outletId, product._id, qtyBase, blockDays, undefined, reserved);
      if (slices.length > 1) warnings.push(`${product.name}: split across ${slices.length} batches (FEFO)`);
    }

    for (const s of slices) {
      const batch = s.batch;
      reserve(batch._id, s.qtyBase);
      const batchPrice = batch.sellingPriceMinor || batch.mrpMinor;
      const listUnitPrice = priceForBaseQty(batchPrice, batch.pricingUnitFactor, factor);
      const mrpPerUnit = priceForBaseQty(batch.mrpMinor, batch.pricingUnitFactor, factor);
      let unitPrice = listUnitPrice;
      let overridden = false;
      if (l.unitPriceMinor !== undefined && l.unitPriceMinor !== listUnitPrice) {
        if (!canOverridePrice) throw new ForbiddenError(`You cannot change the price of ${product.name}`);
        if (l.unitPriceMinor > mrpPerUnit && mrpPerUnit > 0) throw new BusinessRuleError(`${product.name}: price cannot exceed MRP`);
        unitPrice = l.unitPriceMinor;
        overridden = true;
      }
      const qtyInUnit = s.qtyBase / factor;
      const grossMinor = priceForBaseQty(unitPrice, factor, s.qtyBase);
      let discountBps = l.discountBps;
      let discountMinor = Math.round((l.discountMinor * s.qtyBase) / qtyBase);
      if (customer?.defaultDiscountBps && !discountBps && !discountMinor) discountBps = customer.defaultDiscountBps;
      const effectiveBps = grossMinor > 0 ? Math.round(((discountMinor + applyBps(grossMinor, discountBps)) * 10_000) / grossMinor) : 0;
      if (effectiveBps > maxDiscountBps && !canOverrideDiscount) {
        throw new ForbiddenError(`Discount on ${product.name} (${(effectiveBps / 100).toFixed(1)}%) exceeds the allowed ${(maxDiscountBps / 100).toFixed(1)}%`);
      }
      const stockNow = await StockModel.findOne({ organizationId: ctx.organizationId, outletId, batchId: batch._id }).select('qtyBase').lean<StockDoc>();
      out.push({
        lineId: randomToken(6),
        product,
        batch,
        unitId: new Types.ObjectId(l.unitId),
        unitName: uMap.get(l.unitId)?.abbreviation ?? '',
        factor,
        qty: qtyInUnit,
        qtyBase: s.qtyBase,
        unitPriceMinor: unitPrice,
        mrpPerUnitMinor: mrpPerUnit,
        priceOverridden: overridden,
        discountBps,
        discountMinor,
        note: l.note ?? '',
        taxRateBps: product.tax?.rateBps ?? 0,
        cessBps: product.tax?.cessBps ?? 0,
        grossMinor,
        costMinor: priceForBaseQty(batch.purchasePriceMinor, batch.pricingUnitFactor, s.qtyBase),
        availableBase: stockNow?.qtyBase ?? 0,
      });
    }
  }
  return { lines: out, warnings };
}

function buildTotals(lines: PricedLine[], sctx: SaleContext, input: Pick<QuoteSaleInput, 'billDiscountBps' | 'billDiscountMinor'>) {
  return computeDocumentTotals(
    lines.map((l) => ({ grossMinor: l.grossMinor, discountBps: l.discountBps, discountMinor: l.discountMinor, taxRateBps: l.taxRateBps, cessBps: l.cessBps })),
    sctx.taxCtx,
    { billDiscountBps: input.billDiscountBps, billDiscountMinor: input.billDiscountMinor, roundOff: sctx.settings.sales?.roundOff ?? 'nearest' },
  );
}

async function loadCustomer(ctx: RequestContext, customerId?: string): Promise<CustomerDoc | null> {
  if (!customerId) return null;
  const c = await CustomerModel.findOne(orgFilter<CustomerDoc>(ctx, { _id: customerId, status: { $ne: 'archived' } })).lean<CustomerDoc>();
  if (!c) throw new NotFoundError('Customer');
  return c;
}

/* ---------------------------------------------------------------- dto */

export function toSaleDto(doc: SaleDoc, who: (id: Types.ObjectId | null | undefined) => { id: string; name: string } | null, showCost: boolean, outletName = ''): SaleDto {
  const cost = doc.lines.reduce((s, l) => s + (l.costMinor ?? 0), 0);
  return {
    id: String(doc._id),
    number: doc.number ?? '',
    outletId: String(doc.outletId),
    outletName,
    status: doc.status as SaleDto['status'],
    customerId: doc.customerId ? String(doc.customerId) : null,
    customer: { name: doc.customerSnapshot?.name ?? 'Walk-in customer', phone: doc.customerSnapshot?.phone ?? '', email: doc.customerSnapshot?.email ?? '', gstin: doc.customerSnapshot?.gstin ?? '', stateCode: doc.customerSnapshot?.stateCode ?? '' },
    prescriptionIds: (doc.prescriptionIds ?? []).map(String),
    doctorName: doc.doctorName ?? '',
    lines: doc.lines.map((l) => ({
      lineId: l.lineId,
      productId: String(l.productId),
      productName: l.productName,
      packLabel: l.packLabel ?? '',
      hsnCode: l.hsnCode ?? '',
      schedule: l.schedule ?? 'none',
      batchId: String(l.batchId),
      batchNumber: l.batchNumber,
      expiryDate: isoNow(l.expiryDate),
      unitId: String(l.unitId),
      unitName: l.unitName ?? '',
      factorToBase: l.factorToBase,
      qty: l.qty,
      qtyBase: l.qtyBase,
      unitPriceMinor: l.unitPriceMinor,
      mrpPerUnitMinor: l.mrpPerUnitMinor ?? 0,
      discountBps: l.discountBps ?? 0,
      discountMinor: l.discountMinor ?? 0,
      taxRateBps: l.taxRateBps ?? 0,
      cessBps: l.cessBps ?? 0,
      grossMinor: l.grossMinor ?? 0,
      taxableMinor: l.taxableMinor ?? 0,
      cgstMinor: l.cgstMinor ?? 0,
      sgstMinor: l.sgstMinor ?? 0,
      igstMinor: l.igstMinor ?? 0,
      cessMinor: l.cessMinor ?? 0,
      totalMinor: l.totalMinor ?? 0,
      costMinor: showCost ? (l.costMinor ?? 0) : undefined,
      returnedBase: l.returnedBase ?? 0,
      note: l.note ?? '',
    })),
    totals: doc.totals as SaleDto['totals'],
    isInterState: doc.isInterState ?? false,
    payments: doc.payments.map((p) => ({ method: p.method as SaleDto['payments'][number]['method'], amountMinor: p.amountMinor, reference: p.reference ?? '', receivedAt: isoNow(p.receivedAt) })),
    paidMinor: doc.paidMinor ?? 0,
    creditMinor: doc.creditMinor ?? 0,
    balanceMinor: doc.balanceMinor ?? 0,
    refundedMinor: doc.refundedMinor ?? 0,
    paymentStatus: (doc.balanceMinor ?? 0) <= 0 ? 'paid' : (doc.paidMinor ?? 0) > 0 ? 'partial' : 'credit',
    dueDate: iso(doc.dueDate),
    soldBy: who(doc.soldBy),
    cancelledBy: who(doc.cancelledBy),
    cancelReason: doc.cancelReason ?? '',
    cancelledAt: iso(doc.cancelledAt),
    notes: doc.notes ?? '',
    label: doc.label ?? '',
    customFields: (doc.customFields as Record<string, unknown>) ?? {},
    emailStatus: (doc.email?.status ?? 'none') as SaleDto['emailStatus'],
    emailedTo: doc.email?.to ?? '',
    profitMinor: showCost ? doc.totals.taxableMinor - cost : undefined,
    createdAt: isoNow(doc.completedAt ?? doc.createdAt),
  };
}

async function dto(ctx: RequestContext, doc: SaleDoc) {
  const [who, outlet] = await Promise.all([userRefs([doc.soldBy, doc.cancelledBy]), OutletModel.findById(doc.outletId).select('name').lean<Pick<OutletDoc, 'name'>>()]);
  return toSaleDto(doc, who, hasPermission(ctx, 'products.viewCost'), outlet?.name ?? '');
}

/* ---------------------------------------------------------------- quote */

export async function quoteSale(ctx: RequestContext, input: QuoteSaleInput): Promise<SaleQuoteDto> {
  const outletId = requireOutletId(ctx);
  const customer = await loadCustomer(ctx, input.customerId);
  const sctx = await loadSaleContext(ctx, outletId, customer);
  const { lines, warnings } = await priceLines(ctx, outletId, sctx, input, customer);
  const { lines: taxed, totals } = buildTotals(lines, sctx, input);
  const showCost = hasPermission(ctx, 'products.viewCost');
  return {
    lines: lines.map((l, i) => ({
      lineIndex: i,
      productId: String(l.product._id),
      productName: l.product.name,
      packLabel: l.product.packLabel ?? '',
      hsnCode: l.product.hsnCode ?? '',
      schedule: l.product.schedule ?? 'none',
      batchId: String(l.batch._id),
      batchNumber: l.batch.batchNumber,
      expiryDate: l.batch.expiryDate.toISOString(),
      unitId: String(l.unitId),
      unitName: l.unitName,
      factorToBase: l.factor,
      qty: l.qty,
      qtyBase: l.qtyBase,
      unitPriceMinor: l.unitPriceMinor,
      mrpPerUnitMinor: l.mrpPerUnitMinor,
      discountBps: l.discountBps,
      discountMinor: taxed[i]!.discountMinor,
      taxRateBps: l.taxRateBps,
      cessBps: l.cessBps,
      grossMinor: taxed[i]!.grossMinor,
      taxableMinor: taxed[i]!.taxableMinor,
      cgstMinor: taxed[i]!.cgstMinor,
      sgstMinor: taxed[i]!.sgstMinor,
      igstMinor: taxed[i]!.igstMinor,
      cessMinor: taxed[i]!.cessMinor,
      totalMinor: taxed[i]!.totalMinor,
      costMinor: showCost ? l.costMinor : undefined,
      note: l.note,
      availableBase: l.availableBase,
    })),
    totals,
    isInterState: isInterState(sctx.taxCtx),
    warnings,
    customerBalanceMinor: customer?.balanceMinor ?? 0,
    creditLimitMinor: customer?.creditLimitMinor ?? 0,
    requiresPrescription: lines.some((l) => l.product.requiresPrescription),
  };
}

/* ---------------------------------------------------------------- create */

export async function createSale(ctx: RequestContext, input: CreateSaleInput, idempotencyKey?: string) {
  const outletId = requireOutletId(ctx);
  const customer = await loadCustomer(ctx, input.customerId);
  const sctx = await loadSaleContext(ctx, outletId, customer);
  const customFields = await validateCustomFields(ctx, 'sale', input.customFields);

  const doc = await withTransaction(async (session) => {
    const { lines, warnings } = await priceLines(ctx, outletId, sctx, input, customer);
    const { lines: taxed, totals } = buildTotals(lines, sctx, input);
    void warnings;
    if (input.expectedGrandTotalMinor !== undefined && input.expectedGrandTotalMinor !== totals.grandTotalMinor) {
      throw new BusinessRuleError(`Totals changed: server computed ${totals.grandTotalMinor / 100}, you sent ${input.expectedGrandTotalMinor / 100}. Review the bill and try again.`);
    }
    if (lines.some((l) => l.product.requiresPrescription) && input.prescriptionIds.length === 0 && !input.doctorName) {
      throw new BusinessRuleError('This bill contains prescription-only (Schedule H/H1/X) medicines: attach a prescription or enter the prescribing doctor');
    }

    // Payments & credit.
    const paid = input.payments.reduce((s, p) => s + p.amountMinor, 0);
    if (input.payments.some((p) => p.method === 'credit')) throw new ValidationError('Use creditMinor for the credit part of the bill');
    const credit = input.creditMinor;
    if (paid + credit !== totals.grandTotalMinor) {
      throw new ValidationError(`Payments (${paid / 100}) + credit (${credit / 100}) must equal the bill total (${totals.grandTotalMinor / 100})`, [{ path: 'body.payments', message: 'Does not add up' }]);
    }
    if (credit > 0) {
      if (!hasPermission(ctx, 'sales.credit')) throw new ForbiddenError('You cannot sell on credit');
      if (!customer && sctx.settings.sales?.requireCustomerForCredit !== false) throw new BusinessRuleError('Credit sales need a registered customer');
      if (customer && customer.creditLimitMinor > 0 && (customer.balanceMinor ?? 0) + credit > customer.creditLimitMinor && !hasPermission(ctx, 'customers.overrideCreditLimit')) {
        throw new BusinessRuleError(`Credit limit exceeded: outstanding ${(customer.balanceMinor ?? 0) / 100} + this bill ${credit / 100} > limit ${customer.creditLimitMinor / 100}`);
      }
    }

    const { number } = await nextDocumentNumber(ctx.organizationId, outletId, 'sale', session);
    const saleId = new Types.ObjectId();
    for (const l of lines) {
      await applyStockChange(ctx, { outletId, productId: l.product._id, batchId: l.batch._id, qtyBaseDelta: -l.qtyBase, reason: 'sale', refType: 'Sale', refId: saleId, refNumber: number, unitCostMinor: l.batch.purchasePriceMinor, pricingUnitFactor: l.batch.pricingUnitFactor }, session);
    }
    const now = new Date();
    const dueDate = credit > 0 ? (input.dueDate ?? new Date(now.getTime() + (customer?.creditDays ?? sctx.settings.sales?.defaultCreditDays ?? 30) * 86_400_000)) : null;
    const [created] = await SaleModel.create(
      [
        {
          _id: saleId,
          organizationId: ctx.organizationId,
          outletId,
          number,
          status: 'completed',
          customerId: customer?._id ?? null,
          customerSnapshot: customer
            ? { name: customer.name, phone: customer.phone, email: customer.email ?? '', gstin: customer.gstin ?? '', stateCode: customer.stateCode ?? '' }
            : { name: input.walkIn?.name || 'Walk-in customer', phone: input.walkIn?.phone ?? '', email: input.walkIn?.email ?? '', gstin: '', stateCode: '' },
          prescriptionIds: input.prescriptionIds,
          doctorName: input.doctorName,
          lines: lines.map((l, i) => ({
            lineId: l.lineId,
            productId: l.product._id,
            productName: l.product.name,
            packLabel: l.product.packLabel ?? '',
            hsnCode: l.product.hsnCode ?? '',
            schedule: l.product.schedule ?? 'none',
            batchId: l.batch._id,
            batchNumber: l.batch.batchNumber,
            expiryDate: l.batch.expiryDate,
            unitId: l.unitId,
            unitName: l.unitName,
            factorToBase: l.factor,
            qty: l.qty,
            qtyBase: l.qtyBase,
            pricingUnitFactor: l.batch.pricingUnitFactor,
            unitPriceMinor: l.unitPriceMinor,
            mrpPerUnitMinor: l.mrpPerUnitMinor,
            batchSellingPriceMinor: l.batch.sellingPriceMinor,
            batchMrpMinor: l.batch.mrpMinor,
            batchCostMinor: l.batch.purchasePriceMinor,
            discountBps: l.discountBps,
            discountMinor: taxed[i]!.discountMinor,
            taxRateBps: l.taxRateBps,
            cessBps: l.cessBps,
            grossMinor: taxed[i]!.grossMinor,
            taxableMinor: taxed[i]!.taxableMinor,
            cgstMinor: taxed[i]!.cgstMinor,
            sgstMinor: taxed[i]!.sgstMinor,
            igstMinor: taxed[i]!.igstMinor,
            cessMinor: taxed[i]!.cessMinor,
            totalMinor: taxed[i]!.totalMinor,
            costMinor: l.costMinor,
            returnedBase: 0,
            priceOverridden: l.priceOverridden,
            note: l.note,
          })),
          totals,
          isInterState: isInterState(sctx.taxCtx),
          pricesIncludeTax: sctx.taxCtx.pricesIncludeTax,
          payments: input.payments.map((p) => ({ method: p.method, amountMinor: p.amountMinor, reference: p.reference, receivedAt: now })),
          paidMinor: paid,
          creditMinor: credit,
          balanceMinor: credit,
          dueDate,
          soldBy: ctx.userId,
          notes: input.notes,
          customFields,
          email: { status: input.sendEmail ? 'queued' : 'none', to: input.sendEmail ? (customer?.email || input.walkIn?.email || '') : '' },
          idempotencyKey: idempotencyKey ?? '',
          completedAt: now,
        },
      ],
      { session },
    );
    if (customer) {
      if (credit > 0) {
        await postLedgerEntry(ctx, { partyType: 'customer', partyId: customer._id, type: 'sale', refType: 'Sale', refId: saleId, refNumber: number, debitMinor: credit, date: now, note: `Credit on invoice ${number}` }, session);
      }
      await CustomerModel.updateOne({ _id: customer._id }, { $set: { lastPurchaseAt: now }, $inc: { totalPurchasesMinor: totals.grandTotalMinor } }, { session });
    }
    if (input.heldSaleId) await SaleModel.deleteOne({ _id: input.heldSaleId, organizationId: ctx.organizationId, status: 'held' }, { session });
    const overrides = lines.filter((l) => l.priceOverridden).map((l) => l.product.name);
    await audit(ctx, { action: 'sale.created', entityType: 'Sale', entityId: saleId, summary: `Invoice ${number} for ${totals.grandTotalMinor / 100} (${customer?.name ?? 'walk-in'})${credit ? `, credit ${credit / 100}` : ''}`, after: { number, grandTotalMinor: totals.grandTotalMinor, paidMinor: paid, creditMinor: credit, lines: lines.length }, metadata: { idempotencyKey, priceOverrides: overrides } }, session);
    return created!;
  });
  events.emit('sale.completed', { organizationId: ctx.organizationId, outletId, saleId: doc._id, sendEmail: input.sendEmail });
  return dto(ctx, doc.toObject() as SaleDoc);
}

/* ---------------------------------------------------------------- hold / resume */

export async function holdSale(ctx: RequestContext, input: HoldSaleInput) {
  const outletId = requireOutletId(ctx);
  const customer = await loadCustomer(ctx, input.customerId);
  const sctx = await loadSaleContext(ctx, outletId, customer);
  const { lines } = await priceLines(ctx, outletId, sctx, input, customer);
  const { totals } = buildTotals(lines, sctx, input);
  const doc = await SaleModel.create({
    organizationId: ctx.organizationId,
    outletId,
    number: '',
    status: 'held',
    customerId: customer?._id ?? null,
    customerSnapshot: customer ? { name: customer.name, phone: customer.phone, email: customer.email ?? '' } : { name: input.walkIn?.name || 'Walk-in customer', phone: input.walkIn?.phone ?? '' },
    lines: [],
    totals,
    label: input.label,
    heldInput: input,
    soldBy: ctx.userId,
    notes: input.notes,
  });
  return { id: String(doc._id), label: doc.label, estimatedTotalMinor: totals.grandTotalMinor };
}

export async function listHeld(ctx: RequestContext): Promise<HeldSaleSummary[]> {
  const docs = await SaleModel.find(outletFilter<SaleDoc>(ctx, { status: 'held' })).sort({ createdAt: -1 }).limit(50).lean<SaleDoc[]>();
  const who = await userRefs(docs.map((d) => d.soldBy));
  return docs.map((d) => ({
    id: String(d._id),
    label: d.label ?? '',
    customerName: d.customerSnapshot?.name ?? '',
    lineCount: ((d.heldInput as HoldSaleInput | null)?.lines ?? []).length,
    estimatedTotalMinor: d.totals?.grandTotalMinor ?? 0,
    heldBy: who(d.soldBy),
    createdAt: isoNow(d.createdAt),
  }));
}

export async function getHeld(ctx: RequestContext, id: string) {
  const doc = await SaleModel.findOne(orgFilter<SaleDoc>(ctx, { _id: id, status: 'held' })).lean<SaleDoc>();
  if (!doc) throw new NotFoundError('Held bill');
  return { id: String(doc._id), label: doc.label ?? '', input: doc.heldInput as HoldSaleInput, createdAt: isoNow(doc.createdAt) };
}

export async function deleteHeld(ctx: RequestContext, id: string) {
  const res = await SaleModel.deleteOne(orgFilter<SaleDoc>(ctx, { _id: id, status: 'held' }));
  if (res.deletedCount === 0) throw new NotFoundError('Held bill');
}

/* ---------------------------------------------------------------- cancel */

export async function cancelSale(ctx: RequestContext, id: string, reason: string) {
  const doc = await SaleModel.findOne(orgFilter<SaleDoc>(ctx, { _id: id, status: 'completed' }));
  if (!doc) throw new NotFoundError('Sale');
  const org = await OrganizationModel.findById(ctx.organizationId).select('settings.sales').lean<OrganizationDoc>();
  const windowHours = org?.settings?.sales?.cancelWindowHours ?? 24;
  if (windowHours === 0 || (doc.completedAt && Date.now() - doc.completedAt.getTime() > windowHours * 3_600_000)) {
    throw new BusinessRuleError(`Invoices can only be cancelled within ${windowHours} hour(s); create a sales return instead`);
  }
  if (doc.lines.some((l) => (l.returnedBase ?? 0) > 0)) throw new BusinessRuleError('Items from this invoice were returned; it cannot be cancelled');
  if ((doc.paidMinor ?? 0) > 0 && doc.payments.some((p) => p.paymentId)) throw new BusinessRuleError('Payments were later allocated to this invoice; cancel those first');

  await withTransaction(async (session) => {
    for (const l of doc.lines) {
      await applyStockChange(ctx, { outletId: doc.outletId, productId: l.productId, batchId: l.batchId, qtyBaseDelta: l.qtyBase, reason: 'sale_cancel', refType: 'Sale', refId: doc._id, refNumber: doc.number, unitCostMinor: l.batchCostMinor, pricingUnitFactor: l.pricingUnitFactor, note: reason }, session);
    }
    if (doc.customerId && (doc.creditMinor ?? 0) > 0) {
      await postLedgerEntry(ctx, { partyType: 'customer', partyId: doc.customerId, type: 'cancellation', refType: 'Sale', refId: doc._id, refNumber: doc.number, creditMinor: doc.balanceMinor ?? 0, note: `Invoice cancelled: ${reason}` }, session);
    }
    if (doc.customerId) await CustomerModel.updateOne({ _id: doc.customerId }, { $inc: { totalPurchasesMinor: -doc.totals.grandTotalMinor } }, { session });
    doc.status = 'cancelled';
    doc.cancelledBy = ctx.userId;
    doc.cancelledAt = new Date();
    doc.cancelReason = reason;
    doc.refundedMinor = doc.paidMinor ?? 0;
    doc.balanceMinor = 0;
    await doc.save({ session });
    await audit(ctx, { action: 'sale.cancelled', entityType: 'Sale', entityId: doc._id, summary: `Cancelled invoice ${doc.number}: ${reason}`, metadata: { refundedMinor: doc.paidMinor } }, session);
  });
  return dto(ctx, doc.toObject() as SaleDoc);
}

/* ---------------------------------------------------------------- reads */

export async function listSales(ctx: RequestContext, query: SaleListQuery) {
  const filter = outletFilter<SaleDoc>(ctx, {
    status: query.status ?? { $ne: 'held' },
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.soldBy ? { soldBy: query.soldBy } : {}),
    ...(query.paymentStatus === 'paid' ? { balanceMinor: { $lte: 0 } } : {}),
    ...(query.paymentStatus === 'partial' ? { balanceMinor: { $gt: 0 }, paidMinor: { $gt: 0 } } : {}),
    ...(query.paymentStatus === 'credit' ? { balanceMinor: { $gt: 0 } } : {}),
    ...(query.from || query.to ? { completedAt: { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) } } : {}),
    ...(query.q ? { $or: [{ number: { $regex: query.q, $options: 'i' } }, { 'customerSnapshot.name': { $regex: query.q, $options: 'i' } }, { 'customerSnapshot.phone': { $regex: query.q } }] } : {}),
  });
  const skip = (query.page - 1) * query.pageSize;
  const [docs, total] = await Promise.all([SaleModel.find(filter).sort({ completedAt: -1, createdAt: -1 }).skip(skip).limit(query.pageSize).lean<SaleDoc[]>(), SaleModel.countDocuments(filter)]);
  const who = await userRefs(docs.map((d) => d.soldBy));
  const showCost = hasPermission(ctx, 'products.viewCost');
  return { items: docs.map((d) => toSaleDto(d, who, showCost)), meta: pageMeta(query, total) };
}

export async function getSale(ctx: RequestContext, id: string) {
  const doc = await SaleModel.findOne(orgFilter<SaleDoc>(ctx, { _id: id, status: { $ne: 'held' } })).lean<SaleDoc>();
  if (!doc) throw new NotFoundError('Sale');
  return dto(ctx, doc);
}

export async function customerSales(ctx: RequestContext, customerId: string, query: PaginationQuery) {
  const filter = orgFilter<SaleDoc>(ctx, { customerId, status: { $ne: 'held' } });
  const skip = (query.page - 1) * query.pageSize;
  const [docs, total] = await Promise.all([SaleModel.find(filter).sort({ completedAt: -1 }).skip(skip).limit(query.pageSize).lean<SaleDoc[]>(), SaleModel.countDocuments(filter)]);
  const who = await userRefs(docs.map((d) => d.soldBy));
  return { items: docs.map((d) => toSaleDto(d, who, false)), meta: pageMeta(query, total) };
}

export { trustedFilter as _keep };
