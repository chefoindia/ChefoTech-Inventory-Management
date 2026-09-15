import { applyBps, roundHalfUp, splitInclusiveTax, roundOffToMajor } from './money';

/**
 * Pluggable tax engine. `in-gst` is the first implementation: CGST+SGST for intra-state supply,
 * IGST for inter-state, cess on top. All arithmetic is in integer minor units and basis points.
 */

export interface TaxLineInput {
  /** Gross line amount before discount, in minor units (qty × unit price). */
  grossMinor: number;
  /** Item discount as basis points of gross (0-10000) and/or a fixed amount; both may be zero. */
  discountBps?: number;
  discountMinor?: number;
  taxRateBps: number;
  cessBps?: number;
}

export interface TaxLineResult {
  grossMinor: number;
  discountMinor: number;
  /** Amount after discount, still tax-inclusive when pricesIncludeTax. */
  netMinor: number;
  taxableMinor: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
  cessMinor: number;
  taxMinor: number;
  totalMinor: number;
}

export interface TaxContext {
  engine: 'in-gst';
  pricesIncludeTax: boolean;
  /** GST state code of the supplier of the goods (the pharmacy for sales, the vendor for purchases). */
  supplierStateCode: string;
  /** GST state code of the place of supply (customer state for sales, pharmacy for purchases). */
  placeOfSupplyStateCode: string;
  /** Composition dealers cannot charge GST on invoices. */
  compositionScheme?: boolean;
}

export function isInterState(ctx: Pick<TaxContext, 'supplierStateCode' | 'placeOfSupplyStateCode'>): boolean {
  if (!ctx.supplierStateCode || !ctx.placeOfSupplyStateCode) return false;
  return ctx.supplierStateCode !== ctx.placeOfSupplyStateCode;
}

export function computeTaxLine(input: TaxLineInput, ctx: TaxContext): TaxLineResult {
  const gross = input.grossMinor;
  let discount = (input.discountMinor ?? 0) + (input.discountBps ? applyBps(gross, input.discountBps) : 0);
  if (discount > gross) discount = gross;
  const net = gross - discount;
  const rate = ctx.compositionScheme ? 0 : input.taxRateBps;
  const cessRate = ctx.compositionScheme ? 0 : (input.cessBps ?? 0);

  let taxable: number;
  let tax: number;
  let cess: number;
  if (ctx.pricesIncludeTax) {
    const split = splitInclusiveTax(net, rate + cessRate);
    taxable = split.taxableMinor;
    const totalTax = split.taxMinor;
    cess = cessRate ? roundHalfUp((totalTax * cessRate) / (rate + cessRate)) : 0;
    tax = totalTax - cess;
  } else {
    taxable = net;
    tax = applyBps(net, rate);
    cess = applyBps(net, cessRate);
  }
  const inter = isInterState(ctx);
  const half = inter ? 0 : Math.floor(tax / 2);
  const cgst = inter ? 0 : half;
  const sgst = inter ? 0 : tax - half;
  const igst = inter ? tax : 0;
  return {
    grossMinor: gross,
    discountMinor: discount,
    netMinor: net,
    taxableMinor: taxable,
    cgstMinor: cgst,
    sgstMinor: sgst,
    igstMinor: igst,
    cessMinor: cess,
    taxMinor: tax + cess,
    totalMinor: taxable + tax + cess,
  };
}

export interface DocumentTotals {
  subtotalMinor: number;
  itemDiscountMinor: number;
  billDiscountMinor: number;
  taxableMinor: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
  cessMinor: number;
  taxMinor: number;
  otherChargesMinor: number;
  roundOffMinor: number;
  grandTotalMinor: number;
}

/**
 * Sums line results, applies a bill-level discount (spread proportionally across lines so tax
 * stays consistent), other charges and round-off. Returns totals plus the adjusted lines.
 */
export function computeDocumentTotals(
  lines: TaxLineInput[],
  ctx: TaxContext,
  opts: { billDiscountBps?: number; billDiscountMinor?: number; otherChargesMinor?: number; roundOff?: 'nearest' | 'none' } = {},
): { lines: TaxLineResult[]; totals: DocumentTotals } {
  const first = lines.map((l) => computeTaxLine(l, ctx));
  const netSum = first.reduce((s, l) => s + l.netMinor, 0);
  let billDiscount = (opts.billDiscountMinor ?? 0) + (opts.billDiscountBps ? applyBps(netSum, opts.billDiscountBps) : 0);
  if (billDiscount > netSum) billDiscount = netSum;

  // Spread the bill discount across lines proportionally, last line absorbs rounding.
  let allocated = 0;
  const results = lines.map((l, i) => {
    const share = i === lines.length - 1 ? billDiscount - allocated : netSum > 0 ? roundHalfUp((billDiscount * first[i]!.netMinor) / netSum) : 0;
    allocated += share;
    return computeTaxLine({ ...l, discountMinor: (l.discountMinor ?? 0) + (l.discountBps ? applyBps(l.grossMinor, l.discountBps) : 0) + share, discountBps: 0 }, ctx);
  });

  const sum = (k: keyof TaxLineResult) => results.reduce((s, r) => s + (r[k] as number), 0);
  const subtotal = sum('grossMinor');
  const itemDiscount = first.reduce((s, l) => s + l.discountMinor, 0);
  const taxable = sum('taxableMinor');
  const cgst = sum('cgstMinor');
  const sgst = sum('sgstMinor');
  const igst = sum('igstMinor');
  const cess = sum('cessMinor');
  const other = opts.otherChargesMinor ?? 0;
  const beforeRound = taxable + cgst + sgst + igst + cess + other;
  const round = opts.roundOff === 'none' ? { rounded: beforeRound, delta: 0 } : roundOffToMajor(beforeRound);
  return {
    lines: results,
    totals: {
      subtotalMinor: subtotal,
      itemDiscountMinor: itemDiscount,
      billDiscountMinor: billDiscount,
      taxableMinor: taxable,
      cgstMinor: cgst,
      sgstMinor: sgst,
      igstMinor: igst,
      cessMinor: cess,
      taxMinor: cgst + sgst + igst + cess,
      otherChargesMinor: other,
      roundOffMinor: round.delta,
      grandTotalMinor: round.rounded,
    },
  };
}

/** Price for `qtyBase` base units when the price is quoted per `pricingUnitFactor` base units. */
export function priceForBaseQty(pricePerPricingUnitMinor: number, pricingUnitFactor: number, qtyBase: number): number {
  return roundHalfUp((pricePerPricingUnitMinor * qtyBase) / pricingUnitFactor);
}
