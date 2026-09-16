/**
 * Money helpers. All amounts are integers in minor units (paise for INR).
 * Percentages are basis points (bps): 18% = 1800.
 */

export const BPS_DENOMINATOR = 10_000;

export function assertMinor(value: number, label = 'amount'): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} must be an integer in minor units, received ${value}`);
  }
}

/** Half-up rounding for positive and negative values (symmetric). */
export function roundHalfUp(value: number): number {
  const sign = value < 0 ? -1 : 1;
  return sign * Math.floor(Math.abs(value) + 0.5);
}

/** amount * bps / 10000, rounded half-up to the nearest minor unit. */
export function applyBps(amountMinor: number, bps: number): number {
  assertMinor(amountMinor, 'amountMinor');
  assertMinor(bps, 'bps');
  return roundHalfUp((amountMinor * bps) / BPS_DENOMINATOR);
}

/** Split a tax-inclusive amount into taxable + tax for a given rate. */
export function splitInclusiveTax(inclusiveMinor: number, rateBps: number): {
  taxableMinor: number;
  taxMinor: number;
} {
  assertMinor(inclusiveMinor, 'inclusiveMinor');
  const taxableMinor = roundHalfUp((inclusiveMinor * BPS_DENOMINATOR) / (BPS_DENOMINATOR + rateBps));
  return { taxableMinor, taxMinor: inclusiveMinor - taxableMinor };
}

/** Convert a decimal major-unit value (e.g. 12.50 from a form) to minor units safely. */
export function toMinor(major: number | string, minorDigits = 2): number {
  const str = typeof major === 'number' ? major.toFixed(minorDigits) : String(major).trim();
  if (!/^-?\d+(\.\d+)?$/.test(str)) throw new Error(`Invalid amount: ${major}`);
  const negative = str.startsWith('-');
  const [intPart = '0', fracPartRaw = ''] = str.replace('-', '').split('.');
  const fracPart = (fracPartRaw + '0'.repeat(minorDigits)).slice(0, minorDigits);
  const extra = fracPartRaw.slice(minorDigits);
  let minor = Number(intPart) * 10 ** minorDigits + Number(fracPart);
  if (extra && Number(extra[0]) >= 5) minor += 1;
  return negative ? -minor : minor;
}

export function toMajor(minor: number, minorDigits = 2): number {
  return minor / 10 ** minorDigits;
}

export function formatMoney(
  minor: number,
  opts: { currency?: string; locale?: string; minorDigits?: number } = {},
): string {
  const { currency = 'INR', locale = 'en-IN', minorDigits = 2 } = opts;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: minorDigits,
    maximumFractionDigits: minorDigits,
  }).format(toMajor(minor, minorDigits));
}

/**
 * Grouped amount with no currency symbol, e.g. 12,34,567.89.
 *
 * Printed documents use this rather than `formatMoney`: the rupee sign (U+20B9) has no glyph in
 * the PDF core fonts, so it comes out as a stray mark in front of every figure. Documents state the
 * currency once, in the column heading and in the amount in words.
 */
export function formatMoneyPlain(minor: number, opts: { locale?: string; minorDigits?: number } = {}): string {
  const { locale = 'en-IN', minorDigits = 2 } = opts;
  return new Intl.NumberFormat(locale, { minimumFractionDigits: minorDigits, maximumFractionDigits: minorDigits }).format(toMajor(minor, minorDigits));
}

/** Round a total to the nearest major unit; returns the round-off delta in minor units. */
export function roundOffToMajor(minor: number, minorDigits = 2): { rounded: number; delta: number } {
  const unit = 10 ** minorDigits;
  const rounded = roundHalfUp(minor / unit) * unit;
  return { rounded, delta: rounded - minor };
}

export function sumMinor(values: number[]): number {
  return values.reduce((acc, v) => {
    assertMinor(v);
    return acc + v;
  }, 0);
}
