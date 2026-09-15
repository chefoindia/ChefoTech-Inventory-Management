import { describe, it, expect } from 'vitest';
import { applyBps, splitInclusiveTax, toMinor, toMajor, roundOffToMajor, formatMoney, sumMinor, roundHalfUp } from './money';

describe('money', () => {
  it('rounds half-up symmetrically', () => {
    expect(roundHalfUp(2.5)).toBe(3);
    expect(roundHalfUp(-2.5)).toBe(-3);
    expect(roundHalfUp(2.4999)).toBe(2);
  });

  it('applies basis points exactly', () => {
    expect(applyBps(100_000, 1800)).toBe(18_000); // 18% of ₹1000
    expect(applyBps(33_333, 500)).toBe(1_667); // 5% of ₹333.33 = 16.6665 → 16.67
    expect(applyBps(1, 5000)).toBe(1); // 0.5 paise rounds up
  });

  it('splits tax-inclusive amounts', () => {
    const { taxableMinor, taxMinor } = splitInclusiveTax(11_800, 1800);
    expect(taxableMinor).toBe(10_000);
    expect(taxMinor).toBe(1_800);
    const odd = splitInclusiveTax(10_000, 1200);
    expect(odd.taxableMinor + odd.taxMinor).toBe(10_000);
  });

  it('converts between major and minor units without float drift', () => {
    expect(toMinor(12.5)).toBe(1250);
    expect(toMinor('0.1')).toBe(10);
    expect(toMinor('1.005')).toBe(101);
    expect(toMinor('-3.20')).toBe(-320);
    expect(toMajor(1250)).toBe(12.5);
    expect(() => toMinor('abc')).toThrow();
    expect(() => applyBps(10.5, 100)).toThrow();
  });

  it('rounds bill totals to the nearest rupee', () => {
    expect(roundOffToMajor(123_449)).toEqual({ rounded: 123_400, delta: -49 });
    expect(roundOffToMajor(123_450)).toEqual({ rounded: 123_500, delta: 50 });
  });

  it('formats and sums', () => {
    expect(formatMoney(123_456_789)).toBe('₹12,34,567.89');
    expect(sumMinor([1, 2, 3])).toBe(6);
  });
});
