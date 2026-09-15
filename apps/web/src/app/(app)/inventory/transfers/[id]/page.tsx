'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { CheckCircle2, Truck, PackageCheck, Ban } from 'lucide-react';
import type { TransferDto } from '@pharmaos/shared';
import { useTransfer, useTransferAction } from '@/features/inventory/api';
import { usePermission } from '@/features/auth/permissions';
import { useSession } from '@/stores/session';
import { errorMessage } from '@/lib/api-client';
import { formatDate, formatDateTime } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, KeyValue } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DocStatusBadge } from '@/components/ui/badge';
import { Spinner, ErrorState } from '@/components/ui/states';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { DocumentActions } from '@/components/documents/document-actions';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';

const STEPS: TransferDto['status'][] = ['requested', 'approved', 'dispatched', 'received'];

export default function TransferDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const transfer = useTransfer(id);
  const action = useTransferAction();
  const outletId = useSession((s) => s.activeOutletId);
  const canApprove = usePermission('inventory.transfer.approve');
  const canDispatch = usePermission('inventory.transfer.dispatch');
  const canReceive = usePermission('inventory.transfer.receive');
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  if (transfer.isPending) return <Spinner />;
  if (transfer.isError) return <ErrorState message={errorMessage(transfer.error)} onRetry={() => transfer.refetch()} />;
  const t = transfer.data;
  const isSource = t.fromOutletId === outletId;
  const isDest = t.toOutletId === outletId;
  const run = (a: 'approve' | 'dispatch', label: string) => action.mutate({ id: t.id, action: a }, { onSuccess: () => toast.success(label), onError: (e) => toast.error(errorMessage(e)) });
  const stepIndex = STEPS.indexOf(t.status === 'partially_received' ? 'received' : t.status);

  return (
    <>
      <PageHeader title={`Transfer ${t.number}`} description={<span className="flex items-center gap-2">{t.fromOutletName} → {t.toOutletName} · requested {formatDateTime(t.requestedAt)} by {t.requestedBy?.name ?? '—'} <DocStatusBadge status={t.status} /></span>} actions={<>
        {t.status === 'requested' && canApprove && isSource ? <Button size="sm" loading={action.isPending} onClick={() => run('approve', 'Transfer approved')}><CheckCircle2 className="h-3.5 w-3.5" /> Approve</Button> : null}
        {(t.status === 'approved' || t.status === 'requested') && canDispatch && isSource ? <Button size="sm" loading={action.isPending} onClick={() => run('dispatch', 'Dispatched · stock moved to transit')}><Truck className="h-3.5 w-3.5" /> Dispatch</Button> : null}
        {t.status === 'dispatched' && canReceive && isDest ? <Button size="sm" onClick={() => setReceiveOpen(true)}><PackageCheck className="h-3.5 w-3.5" /> Receive</Button> : null}
        {['requested', 'approved'].includes(t.status) && (canApprove || canDispatch) ? <Button variant="ghost" size="sm" onClick={() => setCancelOpen(true)}><Ban className="h-3.5 w-3.5" /> Cancel</Button> : null}
      </>} />

      {t.status === 'dispatched' && !isDest ? <Alert variant="info" className="mb-4">In transit. Switch to {t.toOutletName} to receive it.</Alert> : null}
      {t.status === 'partially_received' ? <Alert variant="warning" className="mb-4" title="Received with discrepancies">Some lines were received short. Check the notes per line.</Alert> : null}

      <ol className="mb-4 flex flex-wrap gap-2 text-[12px]">
        {STEPS.map((s, i) => <li key={s} className={`rounded-full border px-3 py-1 capitalize ${i <= stepIndex && t.status !== 'cancelled' ? 'border-primary-300 bg-primary-50 text-primary-800' : 'border-border text-fg-subtle'}`}>{i + 1}. {s}</li>)}
        {t.status === 'cancelled' ? <li className="rounded-full border border-danger-600/30 bg-danger-50 px-3 py-1 text-danger-700">Cancelled</li> : null}
      </ol>

      <div className="mb-4"><DocumentActions type="stockTransfer" refId={t.id} refType="StockTransfer" printPermission="inventory.view" emailPermission="inventory.view" /></div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <Table>
            <THead><TR><TH>Product</TH><TH>Batch / Exp</TH><TH numeric>Requested</TH><TH numeric>Dispatched</TH><TH numeric>Received</TH><TH>Discrepancy</TH></TR></THead>
            <TBody>
              {t.lines.map((l) => (
                <TR key={l.lineId}>
                  <TD><Link href={`/products/${l.productId}`} className="font-medium hover:underline">{l.productName}</Link><div className="text-[12px] text-fg-subtle">{l.unitName} × {l.factorToBase}</div></TD>
                  <TD><span className="font-mono text-[12px]">{l.batchNumber}</span><div className="text-[12px] text-fg-subtle">{formatDate(l.expiryDate, { month: 'short', year: '2-digit' })}</div></TD>
                  <TD numeric>{l.qtyRequestedBase}</TD>
                  <TD numeric>{l.qtyDispatchedBase || '—'}</TD>
                  <TD numeric className={l.qtyReceivedBase && l.qtyReceivedBase < l.qtyDispatchedBase ? 'text-warning-700' : ''}>{t.status === 'received' || t.status === 'partially_received' ? l.qtyReceivedBase : '—'}</TD>
                  <TD className="text-[12px] text-fg-subtle">{l.discrepancyNote || '—'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
        <Card className="self-start">
          <CardHeader><CardTitle>Timeline</CardTitle></CardHeader>
          <CardContent>
            <KeyValue className="sm:grid-cols-1" items={[
              { label: 'Requested', value: `${formatDateTime(t.requestedAt)} · ${t.requestedBy?.name ?? '—'}` },
              { label: 'Approved', value: t.approvedAt ? `${formatDateTime(t.approvedAt)} · ${t.approvedBy?.name ?? ''}` : '—' },
              { label: 'Dispatched', value: t.dispatchedAt ? `${formatDateTime(t.dispatchedAt)} · ${t.dispatchedBy?.name ?? ''}` : '—' },
              { label: 'Received', value: t.receivedAt ? `${formatDateTime(t.receivedAt)} · ${t.receivedBy?.name ?? ''}` : '—' },
              { label: 'Cancelled', value: t.cancelledAt ? formatDateTime(t.cancelledAt) : '—' },
              { label: 'Notes', value: t.notes || '—' },
            ]} />
          </CardContent>
        </Card>
      </div>

      <ReceiveDialog transfer={t} open={receiveOpen} onOpenChange={setReceiveOpen} />
      <ConfirmDialog open={cancelOpen} onOpenChange={setCancelOpen} title={`Cancel ${t.number}?`} description={<div className="space-y-3"><p>The request is closed; nothing has moved yet.</p><Input placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} /></div>} confirmLabel="Cancel transfer" destructive loading={action.isPending} onConfirm={() => action.mutate({ id: t.id, action: 'cancel', body: { reason: reason || 'Cancelled' } }, { onSuccess: () => { toast.success('Transfer cancelled'); setCancelOpen(false); }, onError: (e) => toast.error(errorMessage(e)) })} />
    </>
  );
}

function ReceiveDialog({ transfer, open, onOpenChange }: { transfer: TransferDto; open: boolean; onOpenChange: (o: boolean) => void }) {
  const action = useTransferAction();
  const [rows, setRows] = useState<Record<string, { qty: number; note: string }>>({});
  const [notes, setNotes] = useState('');
  const init = () => { const r: typeof rows = {}; for (const l of transfer.lines) r[l.lineId] = { qty: l.qtyDispatchedBase, note: '' }; setRows(r); };
  const submit = () => action.mutate({ id: transfer.id, action: 'receive', body: { notes, lines: transfer.lines.map((l) => ({ lineId: l.lineId, qtyReceivedBase: rows[l.lineId]?.qty ?? 0, discrepancyNote: rows[l.lineId]?.note ?? '' })) } }, { onSuccess: (t) => { toast.success(t.status === 'received' ? 'Stock received' : 'Received with discrepancies'); onOpenChange(false); }, onError: (e) => toast.error(errorMessage(e)) });
  return (
    <Dialog open={open} onOpenChange={(o) => { if (o) init(); if (!action.isPending) onOpenChange(o); }}>
      <DialogContent title={`Receive ${transfer.number}`} description="Count what actually arrived. Short quantities are recorded as discrepancies and stay in the source outlet's transit ledger." size="lg">
        <Table>
          <THead><TR><TH>Product</TH><TH>Batch</TH><TH numeric>Dispatched</TH><TH numeric>Received (base)</TH><TH>Note</TH></TR></THead>
          <TBody>
            {transfer.lines.map((l) => (
              <TR key={l.lineId}>
                <TD className="font-medium">{l.productName}</TD>
                <TD className="font-mono text-[12px]">{l.batchNumber}</TD>
                <TD numeric>{l.qtyDispatchedBase}</TD>
                <TD numeric><Input type="number" min={0} max={l.qtyDispatchedBase} className="h-8 w-24 text-right" value={rows[l.lineId]?.qty ?? ''} onChange={(e) => setRows((r) => ({ ...r, [l.lineId]: { qty: Math.min(Number(e.target.value) || 0, l.qtyDispatchedBase), note: r[l.lineId]?.note ?? '' } }))} aria-label="Received quantity" /></TD>
                <TD><Input className="h-8" placeholder="Damaged, missing…" value={rows[l.lineId]?.note ?? ''} onChange={(e) => setRows((r) => ({ ...r, [l.lineId]: { qty: r[l.lineId]?.qty ?? 0, note: e.target.value } }))} aria-label="Discrepancy note" /></TD>
              </TR>
            ))}
          </TBody>
        </Table>
        <Textarea className="mt-3" placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={action.isPending}>Cancel</Button>
          <Button loading={action.isPending} onClick={submit}><PackageCheck className="h-4 w-4" /> Confirm receipt</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
