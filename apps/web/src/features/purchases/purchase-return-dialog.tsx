'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Undo2 } from 'lucide-react';
import type { ProductSearchHit, PaymentMethod, PurchaseDto } from '@pharmaos/shared';
import { useCreatePurchaseReturn } from './api';
import { useBatches } from '@/features/inventory/api';
import { errorMessage } from '@/lib/api-client';
import { newIdempotencyKey } from '@/lib/uuid';
import { money } from '@/lib/format';
import { formatDate } from '@/lib/utils';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { ProductPicker, SupplierPicker } from '@/components/ui/pickers';
import { PAYMENT_METHOD_LABELS, TENDER_METHODS } from '@/components/ui/payment-lines';

const REASONS = [['expired', 'Expired'], ['damaged', 'Damaged'], ['near_expiry', 'Near expiry'], ['excess', 'Excess stock'], ['wrong_item', 'Wrong item'], ['quality', 'Quality issue'], ['other', 'Other']] as const;
type Reason = (typeof REASONS)[number][0];

interface Row { key: string; productId: string; product?: ProductSearchHit; batchId: string; unitId: string; qty: number | null; reason: Reason; note: string }
const newRow = (): Row => ({ key: Math.random().toString(36).slice(2, 9), productId: '', batchId: '', unitId: '', qty: null, reason: 'expired', note: '' });

function BatchSelect({ productId, value, onChange }: { productId: string; value: string; onChange: (id: string) => void }) {
  const batches = useBatches({ page: 1, productId, includeZero: false });
  return (
    <Select className="h-8 w-48" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Batch">
      <option value="">Select batch…</option>
      {(batches.data?.items ?? []).map((b) => <option key={b.batchId} value={b.batchId}>{b.batchNumber} · {formatDate(b.expiryDate, { month: 'short', year: '2-digit' })} · {b.qtyBase} left</option>)}
    </Select>
  );
}

/** Return goods to a supplier (credit note or refund). Works from a purchase or free-standing from the supplier page. */
export function PurchaseReturnDialog({ open, onOpenChange, supplierId: fixedSupplier, purchase, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; supplierId?: string; purchase?: PurchaseDto; onDone?: (id: string) => void }) {
  const create = useCreatePurchaseReturn();
  const [supplierId, setSupplierId] = React.useState<string | null>(fixedSupplier ?? purchase?.supplierId ?? null);
  const [rows, setRows] = React.useState<Row[]>([newRow()]);
  const [settlement, setSettlement] = React.useState<'credit_note' | 'refund'>('credit_note');
  const [method, setMethod] = React.useState<PaymentMethod>('bank_transfer');
  const [refundMinor, setRefundMinor] = React.useState<number | null>(null);
  const [notes, setNotes] = React.useState('');
  const [key, setKey] = React.useState(newIdempotencyKey);
  React.useEffect(() => { if (open) { setSupplierId(fixedSupplier ?? purchase?.supplierId ?? null); setRows([newRow()]); setNotes(''); setKey(newIdempotencyKey()); } }, [open, fixedSupplier, purchase]);
  const update = (k: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === k ? { ...r, ...patch } : r)));
  const valid = rows.filter((r) => r.productId && r.batchId && r.unitId && r.qty);
  const submit = () => {
    if (!supplierId || !valid.length) return;
    create.mutate({ idempotencyKey: key, input: { supplierId, purchaseId: purchase?.id, lines: valid.map((r) => ({ productId: r.productId, batchId: r.batchId, unitId: r.unitId, qty: r.qty!, reason: r.reason, note: r.note })), settlement, refund: settlement === 'refund' && refundMinor ? { method, amountMinor: refundMinor, reference: '' } : undefined, notes, attachments: [] } }, { onSuccess: (r) => { toast.success(`Return ${r.number} recorded · ${money(r.totals.grandTotalMinor)}`); onOpenChange(false); onDone?.(r.id); }, onError: (e) => toast.error(errorMessage(e)) });
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !create.isPending && onOpenChange(o)}>
      <DialogContent title={purchase ? `Return to supplier against ${purchase.number}` : 'Return goods to supplier'} description="Stock leaves the selected batch; the value is priced at the batch purchase cost." size="xl">
        <div className="space-y-4">
          {!fixedSupplier && !purchase ? <FormField info="The distributor the goods are going back to. The return posts against their account, reducing what you owe." label="Supplier" htmlFor="pr-supplier" required><SupplierPicker value={supplierId} onChange={setSupplierId} /></FormField> : null}
          <table className="w-full text-[13px]">
            <thead className="text-left text-[11px] uppercase tracking-wide text-fg-subtle"><tr><th className="py-1 pr-2 w-[280px]">Product</th><th className="py-1 pr-2">Batch</th><th className="py-1 pr-2">Unit</th><th className="py-1 pr-2 text-right">Qty</th><th className="py-1 pr-2">Reason</th><th className="w-8" /></tr></thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.key} className="align-top">
                  <td className="py-1.5 pr-2"><ProductPicker value={r.productId || null} withStock onChange={(id, p) => update(r.key, { productId: id ?? '', product: p, batchId: '', unitId: p ? (p.units.find((u) => u.isDefaultPurchase)?.unitId ?? p.pricingUnitId) : '' })} /></td>
                  <td className="py-1.5 pr-2">{r.productId ? <BatchSelect productId={r.productId} value={r.batchId} onChange={(b) => update(r.key, { batchId: b })} /> : <span className="text-fg-faint">—</span>}</td>
                  <td className="py-1.5 pr-2"><Select className="h-8 w-24" value={r.unitId} onChange={(e) => update(r.key, { unitId: e.target.value })} disabled={!r.product} aria-label="Unit">{(r.product?.units ?? []).map((u) => <option key={u.unitId} value={u.unitId}>{u.unitName}</option>)}</Select></td>
                  <td className="py-1.5 pr-2"><Input type="number" min={0} className="h-8 w-20 text-right" value={r.qty ?? ''} onChange={(e) => update(r.key, { qty: e.target.value === '' ? null : Number(e.target.value) })} aria-label="Quantity" /></td>
                  <td className="py-1.5 pr-2"><Select className="h-8 w-36" value={r.reason} onChange={(e) => update(r.key, { reason: e.target.value as Reason })}>{REASONS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></td>
                  <td className="py-1.5"><Button variant="ghost" size="icon-sm" aria-label="Remove" onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : [newRow()]))}><Trash2 className="h-3.5 w-3.5" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <Button variant="secondary" size="sm" onClick={() => setRows((rs) => [...rs, newRow()])}><Plus className="h-3.5 w-3.5" /> Add line</Button>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField info="Whether the supplier refunds you or gives credit against your next bill." label="Settlement" htmlFor="pr-settle"><Select value={settlement} onChange={(e) => setSettlement(e.target.value as typeof settlement)}><option value="credit_note">Credit note (reduce payable)</option><option value="refund">Cash refund received</option></Select></FormField>
            {settlement === 'refund' ? <><FormField info="How the money comes back, if they are refunding rather than crediting." label="Refund method" htmlFor="pr-method"><Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>{TENDER_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>)}</Select></FormField><FormField info="How much you expect back. Usually the purchase value of the returned goods." label="Refund amount" htmlFor="pr-amt" hint="Leave blank to use the return value."><Input type="number" min={0} step="0.01" value={refundMinor === null ? '' : refundMinor / 100} onChange={(e) => setRefundMinor(e.target.value === '' ? null : Math.round(Number(e.target.value) * 100))} /></FormField></> : null}
            <FormField info="Why the goods are going back, for example damage in transit or near expiry." label="Notes" htmlFor="pr-notes" className="sm:col-span-3"><Textarea className="min-h-[38px]" value={notes} onChange={(e) => setNotes(e.target.value)} /></FormField>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={create.isPending}>Cancel</Button>
          <Button loading={create.isPending} disabled={!supplierId || !valid.length} onClick={submit}><Undo2 className="h-4 w-4" /> Record return</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
