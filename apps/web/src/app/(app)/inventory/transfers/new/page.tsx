'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Trash2, ArrowLeftRight } from 'lucide-react';
import type { ProductSearchHit } from '@pharmaos/shared';
import { useCreateTransfer, useBatches } from '@/features/inventory/api';
import { useOutlets } from '@/features/outlets/api';
import { usePermission } from '@/features/auth/permissions';
import { useSession } from '@/stores/session';
import { errorMessage } from '@/lib/api-client';
import { newIdempotencyKey } from '@/lib/uuid';
import { formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea, Checkbox } from '@/components/ui/input';
import { FormField, FormGrid } from '@/components/ui/form-field';
import { ProductPicker } from '@/components/ui/pickers';

interface Row { key: string; productId: string; product?: ProductSearchHit; batchId: string; unitId: string; qty: number | null }
const newRow = (): Row => ({ key: Math.random().toString(36).slice(2, 9), productId: '', batchId: '', unitId: '', qty: null });

function BatchSelect({ productId, value, onChange }: { productId: string; value: string; onChange: (id: string) => void }) {
  const batches = useBatches({ page: 1, productId, expiryStatus: 'all' });
  return (
    <Select className="h-8 w-56" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Batch">
      <option value="">Select batch…</option>
      {(batches.data?.items ?? []).filter((b) => !b.isExpired && b.status !== 'blocked').map((b) => <option key={b.batchId} value={b.batchId}>{b.batchNumber} · {formatDate(b.expiryDate, { month: 'short', year: '2-digit' })} · {b.qtyBase} available</option>)}
    </Select>
  );
}

export default function NewTransferPage() {
  const router = useRouter();
  const create = useCreateTransfer();
  const outlets = useOutlets();
  const me = useSession((s) => s.me)!;
  const fromId = useSession((s) => s.activeOutletId);
  const canDispatch = usePermission('inventory.transfer.dispatch');
  const [toOutletId, setToOutletId] = useState('');
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [notes, setNotes] = useState('');
  const [dispatchNow, setDispatchNow] = useState(false);
  const [key] = useState(newIdempotencyKey);
  const update = (k: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === k ? { ...r, ...patch } : r)));
  const valid = rows.filter((r) => r.productId && r.batchId && r.unitId && r.qty);
  const destinations = (outlets.data ?? []).filter((o) => o.id !== fromId && o.status === 'active');
  const submit = () => {
    if (!toOutletId || !valid.length) return;
    create.mutate({ idempotencyKey: key, input: { toOutletId, notes, dispatchNow, lines: valid.map((r) => ({ productId: r.productId, batchId: r.batchId, unitId: r.unitId, qty: r.qty! })) } }, { onSuccess: (t) => { toast.success(`${t.number} ${t.status === 'dispatched' ? 'dispatched' : 'requested'}`); router.push(`/inventory/transfers/${t.id}`); }, onError: (e) => toast.error(errorMessage(e)) });
  };
  return (
    <>
      <PageHeader title="New stock transfer" description={`From ${me.outlets.find((o) => o.id === fromId)?.name ?? 'this outlet'} to another outlet. Stock is reserved on dispatch and added on receipt.`} />
      <Card>
        <CardHeader><CardTitle>Destination</CardTitle><CardDescription>Only batches with sellable stock at this outlet can be transferred.</CardDescription></CardHeader>
        <CardContent>
          <FormGrid className="sm:grid-cols-3">
            <FormField info="The branch receiving this stock. It leaves your current outlet when you dispatch and arrives there when they receive it." label="To outlet" htmlFor="to" required>
              <Select value={toOutletId} onChange={(e) => setToOutletId(e.target.value)}><option value="">Select outlet…</option>{destinations.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.code})</option>)}</Select>
            </FormField>
            <FormField info="Anything the receiving outlet should know, for example who is carrying the stock." label="Notes" htmlFor="notes" className="sm:col-span-2"><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Courier, vehicle, reason…" /></FormField>
          </FormGrid>
          {destinations.length === 0 && outlets.data ? <p className="mt-2 text-[13px] text-warning-700">No other active outlet. Add one under Settings → Outlets (plan permitting).</p> : null}
        </CardContent>
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead className="bg-surface-muted text-left text-[11px] font-medium uppercase tracking-wide text-fg-subtle"><tr><th className="px-3 py-2 w-[300px]">Product</th><th className="px-2 py-2">Batch</th><th className="px-2 py-2">Unit</th><th className="px-2 py-2 text-right">Qty</th><th className="w-8" /></tr></thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className="px-3 py-1.5"><ProductPicker value={r.productId || null} withStock onChange={(id, p) => update(r.key, { productId: id ?? '', product: p, batchId: '', unitId: p ? (p.units.find((u) => u.isDefaultPurchase)?.unitId ?? p.pricingUnitId) : '' })} /></td>
                  <td className="px-2 py-1.5">{r.productId ? <BatchSelect productId={r.productId} value={r.batchId} onChange={(b) => update(r.key, { batchId: b })} /> : <span className="text-fg-faint">—</span>}</td>
                  <td className="px-2 py-1.5"><Select className="h-8 w-24" value={r.unitId} onChange={(e) => update(r.key, { unitId: e.target.value })} disabled={!r.product} aria-label="Unit">{(r.product?.units ?? []).map((u) => <option key={u.unitId} value={u.unitId}>{u.unitName}</option>)}</Select></td>
                  <td className="px-2 py-1.5"><Input type="number" min={0} className="h-8 w-24 text-right" value={r.qty ?? ''} onChange={(e) => update(r.key, { qty: e.target.value === '' ? null : Number(e.target.value) })} aria-label="Quantity" /></td>
                  <td className="px-1 py-1.5"><Button variant="ghost" size="icon-sm" aria-label="Remove" onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : [newRow()]))}><Trash2 className="h-3.5 w-3.5" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <CardContent className="flex flex-wrap items-center gap-4">
          <Button variant="secondary" size="sm" onClick={() => setRows((rs) => [...rs, newRow()])}><Plus className="h-3.5 w-3.5" /> Add line</Button>
          {canDispatch ? <label className="flex items-center gap-2 text-sm"><Checkbox checked={dispatchNow} onChange={(e) => setDispatchNow(e.target.checked)} /> Dispatch immediately (skip request/approval)</label> : null}
          <Textarea className="w-full" placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </CardContent>
        <CardFooter>
          <Button variant="secondary" onClick={() => router.push('/inventory?tab=transfers')}>Cancel</Button>
          <Button loading={create.isPending} disabled={!toOutletId || !valid.length} onClick={submit}><ArrowLeftRight className="h-4 w-4" /> {dispatchNow ? 'Create & dispatch' : 'Request transfer'}</Button>
        </CardFooter>
      </Card>
    </>
  );
}
