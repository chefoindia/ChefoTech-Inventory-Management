import { formatMoney as fm, toMajor, toMinor } from '@pharmaos/shared';

export const money = (minor: number | null | undefined) => fm(minor ?? 0);
export const moneyCompact = (minor: number | null | undefined) => {
  const v = toMajor(minor ?? 0);
  if (Math.abs(v) >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(2)} Cr`;
  if (Math.abs(v) >= 1_00_000) return `₹${(v / 1_00_000).toFixed(2)} L`;
  if (Math.abs(v) >= 1_000) return `₹${(v / 1_000).toFixed(1)}k`;
  return fm(minor ?? 0);
};
export const major = (minor: number | null | undefined) => toMajor(minor ?? 0);
export const minor = (majorValue: number | string) => toMinor(majorValue);
export const pct = (bps: number | null | undefined) => `${((bps ?? 0) / 100).toFixed((bps ?? 0) % 100 === 0 ? 0 : 2)}%`;
export const qty = (n: number | null | undefined) => (Number.isInteger(n ?? 0) ? String(n ?? 0) : (n ?? 0).toFixed(2));

/** Display a base quantity as packs + loose, e.g. 23 tablets with factor 10 → "2 strip 3 tab". */
export function baseToDisplay(qtyBase: number, factor: number, packUnit: string, baseUnit: string): string {
  if (!factor || factor <= 1) return `${qtyBase} ${baseUnit}`;
  const packs = Math.floor(qtyBase / factor);
  const loose = qtyBase % factor;
  if (packs && loose) return `${packs} ${packUnit} ${loose} ${baseUnit}`;
  if (packs) return `${packs} ${packUnit}`;
  return `${loose} ${baseUnit}`;
}

export function daysUntil(date: string | Date): number {
  const d = typeof date === 'string' ? new Date(date) : date;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((d.getTime() - today.getTime()) / 86_400_000);
}

export function expiryLabel(date: string | Date): { text: string; tone: 'danger' | 'warning' | 'neutral' } {
  const d = daysUntil(date);
  if (d < 0) return { text: `Expired ${-d}d ago`, tone: 'danger' };
  if (d <= 30) return { text: `${d}d left`, tone: 'warning' };
  return { text: new Date(date).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }), tone: 'neutral' };
}

export const dateInput = (d?: string | Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : '');
export const startOfMonth = () => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; };
export const daysAgo = (n: number) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - n); return d; };
