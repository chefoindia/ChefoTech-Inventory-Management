'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Trash2, Save } from 'lucide-react';
import type { ProductSearchHit } from '@pharmaos/shared';
import { usePostOpeningStock } from '@/features/inventory/api';
import { errorMessage } from '@/lib/api-client';
import { newIdempotencyKey } from '@/lib/uuid';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { ProductPicker } from '@/components/ui/pickers';
import { Alert } from '@/components/ui/alert';

interface Row { key: string; productId: string; product?: ProductSearchHit; unitId: string; qty: number | null; batchNumber: string; mfgDate: string; expiryDate: string; mrpMinor: number | null; sellingPriceMinor: number | null; purchasePriceMinor: number | null }
const newRow = (): Row => ({ key: Math.random().toString(36).slice(2, 9), productId: '', unitId: '', qty: null, batchNumber: '', mfgDate: '', expiryDate: '', mrpMinor: null, sellingPriceMinor: null, purchasePriceMinor: null });

export default function OpeningStockPage() {
  const router = useRouter();
  const post = usePostOpeningStock();
  const [rows, setRows] = useState<Row[]>([newRow(), newRow(), newRow()]);
  const [notes, setNotes] = useState('');
  const [key] = useState(newIdempotencyKey);
  const update = (k: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === k ? { ...r, ...patch } : r)));
  const valid = rows.filter((r) => r.productId && r.unitId && r.qty && r.batchNumber && r.expiryDate && r.mrpMinor !== null && r.purchasePriceMinor !== null);
  const submit = () => {
    if (!valid.length) return toast.error('Fill at least one complete line (product, qty, batch, expiry, MRP, cost).');
    post.mutate({ idempotencyKey: key, input: { notes, lines: valid.map((r) => ({ productId: r.productId, unitId: r.unitId, qty: r.qty!, batch: { batchNumber: r.batchNumber, mfgDate: r.mfgDate ? new Date(r.mfgDate) : undefined, expiryDate: new Date(r.expiryDate), mrpMinor: r.mrpMinor!, sellingPriceMinor: r.sellingPriceMinor ?? undefined, purchasePriceMinor: r.purchasePriceMinor! } })) } }, { onSuccess: (res) => { toast.success(`Opening stock ${res.number} posted · ${res.lines} lines`); router.push('/inventory?tab=batches'); }, onError: (e) => toast.error(errorMessage(e)) });
  };
  return (
    <>
      <PageHeader title="Opening stock" description="Enter what is on the shelves today, batch by batch. For large catalogues use the CSV import." actions={<Link href="/settings/data?entity=openingStock" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>Import CSV</Link>} />
      <Alert variant="info" className="mb-4">Each line creates (or tops up) a batch at this outlet with a movement tagged “opening stock”. Cost is used for valuation and profit reports.</Alert>
      <Card>
        <CardHeader><CardTitle>Lines</CardTitle><CardDescription>Quantity is in the unit you choose; MRP and prices are per the product&apos;s pricing unit.</CardDescription></CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-[13px]">
            <thead className="bg-surface-muted text-left text-[11px] font-medium uppercase tracking-wide text-fg-subtle"><tr><th className="px-3 py-2 w-[280px]">Product</th><th className="px-2 py-2">Unit</th><th className="px-2 py-2 text-right">Qty</th><th className="px-2 py-2">Batch</th><th className="px-2 py-2">Mfg</th><th className="px-2 py-2">Expiry</th><th className="px-2 py-2 text-right">MRP</th><th className="px-2 py-2 text-right">Selling</th><th className="px-2 py-2 text-right">Cost</th><th className="w-8" /></tr></thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className="px-3 py-1.5"><ProductPicker value={r.productId || null} onChange={(id, p) => update(r.key, { productId: id ?? '', product: p, unitId: p ? (p.units.find((u) => u.isDefaultPurchase)?.unitId ?? p.pricingUnitId) : '', mrpMinor: p?.pricing.mrpMinor || null, sellingPriceMinor: p?.pricing.sellingPriceMinor || null })} /></td>
                  <td className="px-2 py-1.5"><Select className="h-8 w-24" value={r.unitId} onChange={(e) => update(r.key, { unitId: e.target.value })} disabled={!r.product} aria-label="Unit">{(r.product?.units ?? []).map((u) => <option key={u.unitId} value={u.unitId}>{u.unitName}</option>)}</Select></td>
                  <td className="px-2 py-1.5"><Input type="number" min={0} className="h-8 w-20 text-right" value={r.qty ?? ''} onChange={(e) => update(r.key, { qty: e.target.value === '' ? null : Number(e.target.value) })} aria-label="Quantity" /></td>
                  <td className="px-2 py-1.5"><Input className="h-8 w-28 font-mono" value={r.batchNumber} onChange={(e) => update(r.key, { batchNumber: e.target.value })} aria-label="Batch" /></td>
                  <td className="px-2 py-1.5"><Input type="date" className="h-8 w-36" value={r.mfgDate} onChange={(e) => update(r.key, { mfgDate: e.target.value })} aria-label="Manufacturing date" /></td>
                  <td className="px-2 py-1.5"><Input type="date" className="h-8 w-36" value={r.expiryDate} onChange={(e) => update(r.key, { expiryDate: e.target.value })} aria-label="Expiry date" /></td>
                  <td className="px-2 py-1.5"><MoneyInput className="h-8 w-28" value={r.mrpMinor} onChange={(v) => update(r.key, { mrpMinor: v })} aria-label="MRP" /></td>
                  <td className="px-2 py-1.5"><MoneyInput className="h-8 w-28" value={r.sellingPriceMinor} onChange={(v) => update(r.key, { sellingPriceMinor: v })} aria-label="Selling price" /></td>
                  <td className="px-2 py-1.5"><MoneyInput className="h-8 w-28" value={r.purchasePriceMinor} onChange={(v) => update(r.key, { purchasePriceMinor: v })} aria-label="Cost" /></td>
                  <td className="px-1 py-1.5"><Button variant="ghost" size="icon-sm" aria-label="Remove" onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : [newRow()]))}><Trash2 className="h-3.5 w-3.5" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <CardContent className="space-y-3">
          <Button variant="secondary" size="sm" onClick={() => setRows((rs) => [...rs, newRow()])}><Plus className="h-3.5 w-3.5" /> Add line</Button>
          <Textarea placeholder="Notes (e.g. physical count on 1 April)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </CardContent>
        <CardFooter>
          <span className="mr-auto text-[13px] text-fg-subtle">{valid.length} of {rows.length} lines complete</span>
          <Button variant="secondary" onClick={() => router.push('/inventory')}>Cancel</Button>
          <Button loading={post.isPending} disabled={!valid.length} onClick={submit}><Save className="h-4 w-4" /> Post opening stock</Button>
        </CardFooter>
      </Card>
    </>
  );
}
