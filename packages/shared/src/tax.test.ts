import { describe, it, expect } from 'vitest';
import { computeTaxLine, computeDocumentTotals, priceForBaseQty, isInterState, type TaxContext } from './tax';

const intra: TaxContext = { engine: 'in-gst', pricesIncludeTax: true, supplierStateCode: '27', placeOfSupplyStateCode: '27' };
const inter: TaxContext = { ...intra, placeOfSupplyStateCode: '29' };
const exclusive: TaxContext = { ...intra, pricesIncludeTax: false };

describe('tax engine (in-gst)', () => {
  it('splits an inclusive price into taxable + CGST/SGST', () => {
    const r = computeTaxLine({ grossMinor: 11_200, taxRateBps: 1200 }, intra);
    expect(r.taxableMinor).toBe(10_000);
    expect(r.cgstMinor).toBe(600);
    expect(r.sgstMinor).toBe(600);
    expect(r.igstMinor).toBe(0);
    expect(r.totalMinor).toBe(11_200);
  });

  it('uses IGST for inter-state supply', () => {
    const r = computeTaxLine({ grossMinor: 11_200, taxRateBps: 1200 }, inter);
    expect(r.igstMinor).toBe(1_200);
    expect(r.cgstMinor).toBe(0);
    expect(isInterState(inter)).toBe(true);
  });

  it('applies discount before tax and never exceeds gross', () => {
    const r = computeTaxLine({ grossMinor: 10_000, discountBps: 1000, taxRateBps: 500 }, intra);
    expect(r.discountMinor).toBe(1_000);
    expect(r.netMinor).toBe(9_000);
    expect(r.taxableMinor + r.taxMinor).toBe(9_000);
    const capped = computeTaxLine({ grossMinor: 1_000, discountMinor: 5_000, taxRateBps: 500 }, intra);
    expect(capped.netMinor).toBe(0);
    expect(capped.totalMinor).toBe(0);
  });

  it('adds tax on top for exclusive pricing', () => {
    const r = computeTaxLine({ grossMinor: 10_000, taxRateBps: 1800 }, exclusive);
    expect(r.taxableMinor).toBe(10_000);
    expect(r.taxMinor).toBe(1_800);
    expect(r.totalMinor).toBe(11_800);
  });

  it('zero-rates composition dealers', () => {
    const r = computeTaxLine({ grossMinor: 10_000, taxRateBps: 1800 }, { ...intra, compositionScheme: true });
    expect(r.taxMinor).toBe(0);
    expect(r.totalMinor).toBe(10_000);
  });

  it('spreads bill discount proportionally, rounds the total and keeps totals as sum of lines', () => {
    const { lines, totals } = computeDocumentTotals(
      [
        { grossMinor: 18_500, taxRateBps: 1200 },
        { grossMinor: 4_333, taxRateBps: 500 },
        { grossMinor: 999, taxRateBps: 0 },
      ],
      intra,
      { billDiscountBps: 1000 },
    );
    expect(totals.billDiscountMinor).toBe(2_383);
    expect(lines.reduce((s, l) => s + l.discountMinor, 0)).toBe(2_383);
    const sumLines = lines.reduce((s, l) => s + l.totalMinor, 0);
    expect(totals.taxableMinor + totals.taxMinor).toBe(sumLines);
    expect(totals.grandTotalMinor % 100).toBe(0);
    expect(Math.abs(totals.roundOffMinor)).toBeLessThanOrEqual(50);
    expect(totals.grandTotalMinor).toBe(sumLines + totals.roundOffMinor);
  });

  it('prices loose quantities from the pricing unit', () => {
    expect(priceForBaseQty(18_500, 10, 3)).toBe(5_550);
    expect(priceForBaseQty(18_500, 10, 10)).toBe(18_500);
    expect(priceForBaseQty(999, 15, 7)).toBe(466);
  });
});
