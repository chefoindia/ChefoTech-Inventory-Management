'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useAdjustment, useApproveAdjustment, useRejectAdjustment } from '@/features/inventory/api';
import { usePermission } from '@/features/auth/permissions';
import { errorMessage } from '@/lib/api-client';
import { money } from '@/lib/format';
import { formatDateTime } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, KeyValue } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DocStatusBadge } from '@/components/ui/badge';
import { Spinner, ErrorState } from '@/components/ui/states';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { DocumentActions } from '@/components/documents/document-actions';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { AttachmentList } from '@/components/ui/file-upload';
import { Alert } from '@/components/ui/alert';

export default function AdjustmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const adj = useAdjustment(id);
  const approve = useApproveAdjustment();
  const reject = useRejectAdjustment();
  const canApprove = usePermission('inventory.approveAdjustment');
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  if (adj.isPending) return <Spinner />;
  if (adj.isError) return <ErrorState message={errorMessage(adj.error)} onRetry={() => adj.refetch()} />;
  const a = adj.data;
  return (
    <>
      <PageHeader title={`Adjustment ${a.number}`} description={<span className="flex items-center gap-2 capitalize">{a.type} · {a.reason.replace(/_/g, ' ')} · {formatDateTime(a.createdAt)} <DocStatusBadge status={a.status} /></span>} actions={a.status === 'pending_approval' && canApprove ? <><Button variant="secondary" size="sm" onClick={() => setRejecting(true)}><XCircle className="h-3.5 w-3.5" /> Reject</Button><Button size="sm" loading={approve.isPending} onClick={() => approve.mutate(a.id, { onSuccess: () => toast.success('Adjustment approved and applied'), onError: (e) => toast.error(errorMessage(e)) })}><CheckCircle2 className="h-3.5 w-3.5" /> Approve</Button></> : null} />
      {a.status === 'pending_approval' ? <Alert variant="warning" className="mb-4" title="Awaiting approval">Stock is unchanged until an approver accepts this adjustment.</Alert> : null}
      {a.status === 'rejected' ? <Alert variant="danger" className="mb-4" title={`Rejected by ${a.approvedBy?.name ?? '—'}`}>{a.rejectionReason}</Alert> : null}
      <div className="mb-4"><DocumentActions type="stockAdjustment" refId={a.id} refType="StockAdjustment" printPermission="inventory.view" emailPermission="inventory.view" /></div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <Table>
            <THead><TR><TH>Product</TH><TH>Batch</TH><TH numeric>Change</TH><TH numeric>Base units</TH><TH numeric>Unit cost</TH><TH numeric>Value</TH><TH>Note</TH></TR></THead>
            <TBody>
              {a.lines.map((l, i) => (
                <TR key={i}>
                  <TD><Link href={`/products/${l.productId}`} className="font-medium hover:underline">{l.productName}</Link></TD>
                  <TD className="font-mono text-[12px]">{l.batchNumber}</TD>
                  <TD numeric className={l.qtyDelta < 0 ? 'text-danger-600' : 'text-success-700'}>{l.qtyDelta > 0 ? '+' : ''}{l.qtyDelta} {l.unitName}</TD>
                  <TD numeric>{l.qtyBaseDelta > 0 ? '+' : ''}{l.qtyBaseDelta}</TD>
                  <TD numeric>{money(l.unitCostMinor)}</TD>
                  <TD numeric>{money(l.valueMinor)}</TD>
                  <TD className="text-[12px] text-fg-subtle">{l.note || '—'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
        <Card className="self-start">
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <KeyValue className="sm:grid-cols-1" items={[{ label: 'Total value', value: money(a.totalValueMinor) }, { label: 'Requested by', value: a.requestedBy?.name ?? '—' }, { label: a.status === 'rejected' ? 'Rejected by' : 'Approved by', value: a.approvedBy ? `${a.approvedBy.name} · ${a.approvedAt ? formatDateTime(a.approvedAt) : ''}` : '—' }, { label: 'Notes', value: a.notes || '—' }]} />
            {a.attachments.length ? <AttachmentList items={a.attachments} /> : null}
          </CardContent>
        </Card>
      </div>
      <ConfirmDialog open={rejecting} onOpenChange={setRejecting} title="Reject this adjustment?" description={<div className="space-y-3"><p>The requester is notified and no stock changes.</p><Input placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} /></div>} confirmLabel="Reject" destructive loading={reject.isPending} onConfirm={() => { if (reason.trim().length < 3) { toast.error('Give a reason.'); return; } reject.mutate({ id: a.id, reason }, { onSuccess: () => { toast.success('Adjustment rejected'); setRejecting(false); }, onError: (e) => toast.error(errorMessage(e)) }); }} />
    </>
  );
}
