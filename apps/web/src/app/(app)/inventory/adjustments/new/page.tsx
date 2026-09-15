'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Trash2, Save } from 'lucide-react';
import type { ProductSearchHit, AttachmentRef } from '@pharmaos/shared';
import { ADJUSTMENT_TYPES, ADJUSTMENT_REASONS } from '@pharmaos/shared';
import { useCreateAdjustment, useBatches } from '@/features/inventory/api';
import { usePermission } from '@/features/auth/permissions';
import { errorMessage } from '@/lib/api-client';
import { newIdempotencyKey } from '@/lib/uuid';
import { formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import { FormField, FormGrid } from '@/components/ui/form-field';
import { ProductPicker } from '@/components/ui/pickers';
import { FileUpload, AttachmentList } from '@/components/ui/file-upload';
import { Alert } from '@/components/ui/alert';

interface Row { key: string; productId: string; product?: ProductSearchHit; batchId: string; unitId: string; qtyDelta: number | null; note: string }
const newRow = (): Row => ({ key: Math.random().toString(36).slice(2, 9), productId: '', batchId: '', unitId: '', qtyDelta: null, note: '' });

function BatchSelect({ productId, value, onChange }: { productId: string; value: string; onChange: (id: string) => void }) {
  const batches = useBatches({ page: 1, productId, includeZero: true });
  return (
    <Select className="h-8 w-52" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Batch">
      <option value="">Select batch…</option>
      {(batches.data?.items ?? []).map((b) => <option key={b.batchId} value={b.batchId}>{b.batchNumber} · {formatDate(b.expiryDate, { month: 'short', year: '2-digit' })} · {b.qtyBase} on hand</option>)}
    </Select>
  );
}

export default function NewAdjustmentPage() {
  const router = useRouter();
  const create = useCreateAdjustment();
  const canApprove = usePermission('inventory.approveAdjustment');
  const [type, setType] = useState<(typeof ADJUSTMENT_TYPES)[number]>('decrease');
  const [reason, setReason] = useState<(typeof ADJUSTMENT_REASONS)[number]>('physical_count');
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [notes, setNotes] = useState('');
  const [attachments, setAttachments] = useState<AttachmentRef[]>([]);
  const [key] = useState(newIdempotencyKey);
  const update = (k: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === k ? { ...r, ...patch } : r)));
  const sign = type === 'increase' ? 1 : type === 'reconciliation' ? 0 : -1;
  const valid = rows.filter((r) => r.productId && r.batchId && r.unitId && r.qtyDelta);
  const submit = () => {
    if (!valid.length) return toast.error('Add at least one complete line.');
    create.mutate({ idempotencyKey: key, input: { type, reason, notes, attachments: attachments.map((a) => ({ publicId: a.publicId, provider: 'cloudinary' as const, resourceType: a.resourceType, format: a.format, bytes: a.bytes, access: a.access, originalName: a.originalName })), lines: valid.map((r) => ({ productId: r.productId, batchId: r.batchId, unitId: r.unitId, qtyDelta: sign === 0 ? r.qtyDelta! : Math.abs(r.qtyDelta!) * sign, note: r.note })) } }, { onSuccess: (a) => { toast.success(a.status === 'approved' ? `${a.number} applied` : `${a.number} submitted for approval`); router.push(`/inventory/adjustments/${a.id}`); }, onError: (e) => toast.error(errorMessage(e)) });
  };
  return (
    <>
      <PageHeader title="New stock adjustment" description="Correct stock after a physical count, damage, loss or data-entry error." />
      {!canApprove ? <Alert variant="info" className="mb-4">Your role submits adjustments for approval. Stock changes only once an approver accepts it.</Alert> : null}
      <Card>
        <CardHeader><CardTitle>Adjustment</CardTitle><CardDescription>Quantities are in the chosen unit. Decrease-type adjustments remove stock; reconciliation lets you enter signed values.</CardDescription></CardHeader>
        <CardContent>
          <FormGrid className="sm:grid-cols-3">
            <FormField label="Type" htmlFor="adj-type"><Select value={type} onChange={(e) => setType(e.target.value as typeof type)}>{ADJUSTMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</Select></FormField>
            <FormField label="Reason" htmlFor="adj-reason"><Select value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>{ADJUSTMENT_REASONS.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}</Select></FormField>
            <FormField label="Evidence" htmlFor="adj-files" hint="Photos or count sheets."><FileUpload purpose="adjustmentDocument" multiple accept="image/*,.pdf" onUploaded={(refs) => setAttachments((a) => [...a, ...refs].slice(0, 5))} label="Upload" /></FormField>
          </FormGrid>
          {attachments.length ? <div className="mt-3"><AttachmentList items={attachments} onRemove={(pid) => setAttachments((a) => a.filter((x) => x.publicId !== pid))} /></div> : null}
        </CardContent>
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full min-w-[800px] text-[13px]">
            <thead className="bg-surface-muted text-left text-[11px] font-medium uppercase tracking-wide text-fg-subtle"><tr><th className="px-3 py-2 w-[280px]">Product</th><th className="px-2 py-2">Batch</th><th className="px-2 py-2">Unit</th><th className="px-2 py-2 text-right">{sign === 0 ? 'Change (±)' : sign > 0 ? 'Add qty' : 'Remove qty'}</th><th className="px-2 py-2">Note</th><th className="w-8" /></tr></thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className="px-3 py-1.5"><ProductPicker value={r.productId || null} withStock onChange={(id, p) => update(r.key, { productId: id ?? '', product: p, batchId: '', unitId: p?.baseUnitId ?? '' })} /></td>
                  <td className="px-2 py-1.5">{r.productId ? <BatchSelect productId={r.productId} value={r.batchId} onChange={(b) => update(r.key, { batchId: b })} /> : <span className="text-fg-faint">—</span>}</td>
                  <td className="px-2 py-1.5"><Select className="h-8 w-24" value={r.unitId} onChange={(e) => update(r.key, { unitId: e.target.value })} disabled={!r.product} aria-label="Unit">{(r.product?.units ?? []).map((u) => <option key={u.unitId} value={u.unitId}>{u.unitName}</option>)}</Select></td>
                  <td className="px-2 py-1.5"><Input type="number" className="h-8 w-24 text-right" value={r.qtyDelta ?? ''} onChange={(e) => update(r.key, { qtyDelta: e.target.value === '' ? null : Number(e.target.value) })} aria-label="Quantity" /></td>
                  <td className="px-2 py-1.5"><Input className="h-8" value={r.note} onChange={(e) => update(r.key, { note: e.target.value })} aria-label="Line note" /></td>
                  <td className="px-1 py-1.5"><Button variant="ghost" size="icon-sm" aria-label="Remove" onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : [newRow()]))}><Trash2 className="h-3.5 w-3.5" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <CardContent className="space-y-3">
          <Button variant="secondary" size="sm" onClick={() => setRows((rs) => [...rs, newRow()])}><Plus className="h-3.5 w-3.5" /> Add line</Button>
          <Textarea placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </CardContent>
        <CardFooter>
          <Button variant="secondary" onClick={() => router.push('/inventory?tab=adjustments')}>Cancel</Button>
          <Button loading={create.isPending} disabled={!valid.length} onClick={submit}><Save className="h-4 w-4" /> {canApprove ? 'Apply adjustment' : 'Submit for approval'}</Button>
        </CardFooter>
      </Card>
    </>
  );
}
