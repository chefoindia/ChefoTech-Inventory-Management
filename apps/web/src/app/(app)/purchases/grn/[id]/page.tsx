'use client';

import { use } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { CheckCircle2 } from 'lucide-react';
import { useGrn, useConfirmGrn } from '@/features/purchases/api';
import { usePermission } from '@/features/auth/permissions';
import { errorMessage } from '@/lib/api-client';
import { money } from '@/lib/format';
import { formatDate, formatDateTime } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, KeyValue } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DocStatusBadge } from '@/components/ui/badge';
import { Spinner, ErrorState } from '@/components/ui/states';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { DocumentActions } from '@/components/documents/document-actions';
import { AttachmentList } from '@/components/ui/file-upload';
import { Alert } from '@/components/ui/alert';

export default function GrnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const grn = useGrn(id);
  const confirm = useConfirmGrn();
  const canApprove = usePermission('purchases.approveGrn');
  if (grn.isPending) return <Spinner />;
  if (grn.isError) return <ErrorState message={errorMessage(grn.error)} onRetry={() => grn.refetch()} />;
  const g = grn.data;
  return (
    <>
      <PageHeader title={`Goods receipt ${g.number}`} description={<span className="flex items-center gap-2">{formatDate(g.receivedDate)} · against <Link href={`/purchases/${g.purchaseId}`} className="text-primary-700 hover:underline">{g.purchaseNumber}</Link> · {g.supplierName} <DocStatusBadge status={g.status} /></span>} actions={g.status === 'draft' && canApprove ? <Button size="sm" loading={confirm.isPending} onClick={() => confirm.mutate(g.id, { onSuccess: () => toast.success('Receipt confirmed, stock added'), onError: (e) => toast.error(errorMessage(e)) })}><CheckCircle2 className="h-3.5 w-3.5" /> Confirm & add stock</Button> : null} />
      {g.status === 'draft' ? <Alert variant="info" className="mb-4" title="Awaiting confirmation">Stock is added only when a user with approval rights confirms this receipt.</Alert> : null}
      <div className="mb-4"><DocumentActions type="grn" refId={g.id} refType="Grn" printPermission="purchases.view" emailPermission="purchases.view" /></div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <Table>
            <THead><TR><TH>Item</TH><TH numeric>Ordered</TH><TH numeric>Received</TH><TH numeric>Free</TH><TH numeric>Damaged</TH><TH numeric>Short</TH><TH>Batch / Exp</TH><TH numeric>MRP</TH></TR></THead>
            <TBody>
              {g.lines.map((l) => (
                <TR key={l.purchaseLineId}>
                  <TD><Link href={`/products/${l.productId}`} className="font-medium hover:underline">{l.productName}</Link><div className="text-[12px] text-fg-subtle">{l.unitName}{l.note ? ` · ${l.note}` : ''}</div></TD>
                  <TD numeric>{l.orderedQty}</TD>
                  <TD numeric className="font-medium">{l.receivedQty}</TD>
                  <TD numeric>{l.freeQty || '—'}</TD>
                  <TD numeric>{l.damagedQty ? <span className="text-danger-600">{l.damagedQty}</span> : '—'}</TD>
                  <TD numeric>{l.shortQty ? <span className="text-warning-700">{l.shortQty}</span> : '—'}</TD>
                  <TD><span className="font-mono text-[12px]">{l.batchNumber}</span><div className="text-[12px] text-fg-subtle">{formatDate(l.expiryDate, { month: 'short', year: '2-digit' })}</div></TD>
                  <TD numeric>{money(l.mrpMinor)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
        <Card className="self-start">
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <KeyValue className="sm:grid-cols-1" items={[{ label: 'Received by', value: g.receivedBy?.name ?? '—' }, { label: 'Confirmed', value: g.confirmedAt ? `${formatDateTime(g.confirmedAt)} · ${g.confirmedBy?.name ?? ''}` : 'Not yet' }, { label: 'Notes', value: g.notes || '—' }]} />
            {g.attachments.length ? <AttachmentList items={g.attachments} /> : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
