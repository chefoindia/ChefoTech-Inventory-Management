'use client';

import * as React from 'react';
import { Plus, X } from 'lucide-react';
import type { PaymentLineInput, PaymentMethod } from '@pharmaos/shared';
import { Select, Input } from './input';
import { MoneyInput } from './money-input';
import { Button } from './button';
import { money } from '@/lib/format';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  upi: 'UPI',
  card: 'Card',
  bank_transfer: 'Bank transfer',
  cheque: 'Cheque',
  other: 'Other',
  credit: 'Credit',
};

export const TENDER_METHODS: PaymentMethod[] = ['cash', 'upi', 'card', 'bank_transfer', 'cheque', 'other'];

export type PaymentDraft = { method: PaymentMethod; amountMinor: number | null; reference: string };

export function toPaymentLines(drafts: PaymentDraft[]): PaymentLineInput[] {
  return drafts.filter((d) => (d.amountMinor ?? 0) > 0).map((d) => ({ method: d.method, amountMinor: d.amountMinor!, reference: d.reference }));
}

/** Split-tender editor. `total` drives the "remaining" hint and the fill-remaining shortcut. */
export function PaymentLines({ value, onChange, total, max = 5, disabled }: { value: PaymentDraft[]; onChange: (v: PaymentDraft[]) => void; total: number; max?: number; disabled?: boolean }) {
  const paid = value.reduce((s, p) => s + (p.amountMinor ?? 0), 0);
  const remaining = total - paid;
  const update = (i: number, patch: Partial<PaymentDraft>) => onChange(value.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  return (
    <div className="space-y-2">
      {value.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <Select className="h-8 w-36" value={p.method} onChange={(e) => update(i, { method: e.target.value as PaymentMethod })} disabled={disabled} aria-label="Payment method">
            {TENDER_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>)}
          </Select>
          <div className="w-36">
            <MoneyInput className="h-8" value={p.amountMinor} onChange={(v) => update(i, { amountMinor: v })} disabled={disabled} aria-label="Amount" onKeyDown={(e) => { if (e.key === 'Enter' && remaining > 0) { e.preventDefault(); update(i, { amountMinor: (p.amountMinor ?? 0) + remaining }); } }} />
          </div>
          {p.method !== 'cash' ? <Input className="h-8 flex-1" placeholder="Reference / UTR" value={p.reference} onChange={(e) => update(i, { reference: e.target.value })} disabled={disabled} aria-label="Reference" /> : <div className="flex-1" />}
          <Button variant="ghost" size="icon-sm" aria-label="Remove payment" disabled={disabled || value.length === 1} onClick={() => onChange(value.filter((_, j) => j !== i))}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <div className="flex items-center justify-between text-[12px] text-fg-subtle">
        <Button variant="link" size="sm" disabled={disabled || value.length >= max} onClick={() => onChange([...value, { method: 'upi', amountMinor: remaining > 0 ? remaining : null, reference: '' }])}>
          <Plus className="h-3.5 w-3.5" /> Split payment
        </Button>
        <span>
          {remaining > 0 ? <>Remaining <strong className="tabular text-fg">{money(remaining)}</strong></> : remaining < 0 ? <>Change <strong className="tabular text-fg">{money(-remaining)}</strong></> : <span className="text-success-700">Fully paid</span>}
        </span>
      </div>
    </div>
  );
}
