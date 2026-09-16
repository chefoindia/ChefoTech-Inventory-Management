'use client';

import * as React from 'react';
import { toast } from 'sonner';
import type { PaymentMethod } from '@pharmaos/shared';
import { useOutstanding, useRecordPayment } from './api';
import { CustomerPicker, SupplierPicker } from '@/components/ui/pickers';
import { errorMessage } from '@/lib/api-client';
import { newIdempotencyKey } from '@/lib/uuid';
import { money, dateInput } from '@/lib/format';
import { formatDate } from '@/lib/utils';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FormField, FormGrid } from '@/components/ui/form-field';
import { Input, Select, Textarea, Checkbox } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { PAYMENT_METHOD_LABELS, TENDER_METHODS } from '@/components/ui/payment-lines';
import { Badge } from '@/components/ui/badge';

/**
 * Records a receipt from a customer or a payment to a supplier, with optional per-invoice
 * allocation. Unallocated amounts sit as advance/credit on the party ledger.
 */
export function RecordPaymentDialog({ partyType, open, onOpenChange, partyId: fixedPartyId, defaultDocumentId, onDone }: { partyType: 'customer' | 'supplier'; open: boolean; onOpenChange: (o: boolean) => void; partyId?: string; defaultDocumentId?: string; onDone?: () => void }) {
  const [partyId, setPartyId] = React.useState<string | null>(fixedPartyId ?? null);
  const [method, setMethod] = React.useState<PaymentMethod>('cash');
  const [amount, setAmount] = React.useState<number | null>(null);
  const [date, setDate] = React.useState(dateInput(new Date()));
  const [reference, setReference] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [auto, setAuto] = React.useState(true);
  const [alloc, setAlloc] = React.useState<Record<string, number>>({});
  const [key, setKey] = React.useState(newIdempotencyKey);
  const outstanding = useOutstanding(partyType, open ? partyId : null);
  const record = useRecordPayment(partyType);

  React.useEffect(() => {
    if (open) { setPartyId(fixedPartyId ?? null); setAmount(null); setReference(''); setNotes(''); setAuto(!defaultDocumentId); setAlloc({}); setKey(newIdempotencyKey()); setDate(dateInput(new Date())); }
  }, [open, fixedPartyId, defaultDocumentId]);
  React.useEffect(() => {
    if (defaultDocumentId && outstanding.data) {
      const d = outstanding.data.find((x) => x.id === defaultDocumentId);
      if (d) { setAlloc({ [d.id]: d.balanceMinor }); setAmount(d.balanceMinor); setAuto(false); }
    }
  }, [defaultDocumentId, outstanding.data]);

  const totalOutstanding = (outstanding.data ?? []).reduce((s, d) => s + d.balanceMinor, 0);
  const allocated = Object.values(alloc).reduce((s, v) => s + v, 0);
  const submit = () => {
    if (!partyId || !amount) return;
    if (!auto && allocated > amount) return toast.error('Allocations exceed the amount received.');
    record.mutate(
      { idempotencyKey: key, input: { partyId, method: method as Exclude<PaymentMethod, 'credit'>, amountMinor: amount, date: new Date(date), reference, notes, allocations: auto ? [] : Object.entries(alloc).filter(([, v]) => v > 0).map(([documentId, amountMinor]) => ({ documentId, amountMinor })) } },
      { onSuccess: (p) => { toast.success(`${p.number} recorded · ${money(p.amountMinor)}`); onOpenChange(false); onDone?.(); }, onError: (err) => toast.error(errorMessage(err)) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !record.isPending && onOpenChange(o)}>
      <DialogContent title={partyType === 'customer' ? 'Record payment received' : 'Record payment to supplier'} description={partyType === 'customer' ? 'Collect against outstanding invoices or as an advance.' : 'Pay against purchase invoices or record an advance.'} size="lg">
        <div className="space-y-4">
          {!fixedPartyId ? (
            <FormField label={partyType === 'customer' ? 'Customer' : 'Supplier'} htmlFor="pay-party" required>
              {partyType === 'customer' ? <CustomerPicker value={partyId} onChange={setPartyId} /> : <SupplierPicker value={partyId} onChange={setPartyId} />}
            </FormField>
          ) : null}
          <FormGrid className="sm:grid-cols-4">
            <FormField info="How much money is actually moving now. For a part payment, enter only what was received or paid today; the rest stays outstanding." label="Amount" htmlFor="pay-amount" required className="sm:col-span-2"><MoneyInput value={amount} onChange={setAmount} autoFocus /></FormField>
            <FormField info="How the money moved: cash, UPI, card, bank transfer or cheque. Your payment mix report is built from this." label="Method" htmlFor="pay-method">
              <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>{TENDER_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>)}</Select>
            </FormField>
            <FormField info="The day the money actually moved. Use the real date if you are entering it later, so the ledger stays accurate." label="Date" htmlFor="pay-date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></FormField>
            <FormField info="A UPI reference, cheque number or transaction id, so you can match this entry to your bank statement." label="Reference" htmlFor="pay-ref" className="sm:col-span-2"><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UTR / cheque no." /></FormField>
            <FormField info="Anything worth remembering about this payment, for example that a cheque is post-dated." label="Notes" htmlFor="pay-notes" className="sm:col-span-2"><Textarea className="min-h-[38px]" value={notes} onChange={(e) => setNotes(e.target.value)} /></FormField>
          </FormGrid>

          {partyId ? (
            <div className="rounded-[var(--radius-card)] border border-border">
              <div className="flex items-center justify-between border-b border-border px-3 py-2 text-[13px]">
                <span className="font-medium">Outstanding {outstanding.data ? <span className="text-fg-subtle">· {money(totalOutstanding)} across {outstanding.data.length}</span> : null}</span>
                <label className="flex items-center gap-2 text-fg-muted"><Checkbox checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Allocate oldest first</label>
              </div>
              {outstanding.isPending ? <p className="px-3 py-3 text-[13px] text-fg-subtle">Loading…</p> : !outstanding.data?.length ? <p className="px-3 py-3 text-[13px] text-fg-subtle">Nothing outstanding. The amount is recorded as an advance.</p> : (
                <table className="w-full text-[13px]">
                  <thead className="text-left text-[11px] uppercase tracking-wide text-fg-subtle"><tr><th className="px-3 py-1.5">Document</th><th className="px-3 py-1.5">Due</th><th className="px-3 py-1.5 text-right">Balance</th><th className="px-3 py-1.5 text-right">Allocate</th></tr></thead>
                  <tbody className="divide-y divide-border">
                    {outstanding.data.map((d) => (
                      <tr key={d.id}>
                        <td className="px-3 py-1.5"><span className="font-medium">{d.number}</span> <span className="text-fg-subtle">{formatDate(d.date)}</span></td>
                        <td className="px-3 py-1.5">{d.dueDate ? <span className={d.overdue ? 'text-danger-600' : ''}>{formatDate(d.dueDate)}{d.overdue ? <Badge className="ml-1" variant="danger">Overdue</Badge> : null}</span> : '—'}</td>
                        <td className="px-3 py-1.5 text-right tabular">{money(d.balanceMinor)}</td>
                        <td className="px-3 py-1.5 text-right">
                          {auto ? <span className="text-fg-faint">auto</span> : <MoneyInput className="h-7 w-28 text-[12px]" value={alloc[d.id] ?? null} onChange={(v) => setAlloc((a) => ({ ...a, [d.id]: Math.min(v ?? 0, d.balanceMinor) }))} aria-label={`Allocate to ${d.number}`} />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {!auto && amount ? <div className="border-t border-border px-3 py-2 text-[12px] text-fg-subtle">Allocated {money(allocated)} · unallocated {money(Math.max(amount - allocated, 0))}</div> : null}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={record.isPending}>Cancel</Button>
          <Button loading={record.isPending} disabled={!partyId || !amount} onClick={submit}>Record {amount ? money(amount) : ''}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
