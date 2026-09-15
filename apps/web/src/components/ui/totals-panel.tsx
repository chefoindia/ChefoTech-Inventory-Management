import * as React from 'react';
import type { DocumentTotals } from '@pharmaos/shared';
import { cn } from '@/lib/utils';
import { money } from '@/lib/format';

/** Compact invoice totals block (subtotal → taxes → round-off → grand total). */
export function TotalsPanel({ totals, isInterState, className, extra }: { totals: DocumentTotals | null | undefined; isInterState?: boolean; className?: string; extra?: React.ReactNode }) {
  if (!totals) return null;
  const rows: { label: string; value: number; hide?: boolean; strong?: boolean }[] = [
    { label: 'Subtotal', value: totals.subtotalMinor },
    { label: 'Item discounts', value: -totals.itemDiscountMinor, hide: !totals.itemDiscountMinor },
    { label: 'Bill discount', value: -totals.billDiscountMinor, hide: !totals.billDiscountMinor },
    { label: 'Taxable value', value: totals.taxableMinor },
    { label: 'CGST', value: totals.cgstMinor, hide: isInterState || !totals.cgstMinor },
    { label: 'SGST', value: totals.sgstMinor, hide: isInterState || !totals.sgstMinor },
    { label: 'IGST', value: totals.igstMinor, hide: !totals.igstMinor },
    { label: 'Cess', value: totals.cessMinor, hide: !totals.cessMinor },
    { label: 'Other charges', value: totals.otherChargesMinor, hide: !totals.otherChargesMinor },
    { label: 'Round off', value: totals.roundOffMinor, hide: !totals.roundOffMinor },
  ];
  return (
    <dl className={cn('space-y-1 text-sm', className)}>
      {rows.filter((r) => !r.hide).map((r) => (
        <div key={r.label} className="flex items-center justify-between text-fg-muted">
          <dt>{r.label}</dt>
          <dd className="tabular">{money(r.value)}</dd>
        </div>
      ))}
      <div className="flex items-center justify-between border-t border-border pt-2 text-base font-semibold text-fg">
        <dt>Grand total</dt>
        <dd className="tabular">{money(totals.grandTotalMinor)}</dd>
      </div>
      {extra}
    </dl>
  );
}
