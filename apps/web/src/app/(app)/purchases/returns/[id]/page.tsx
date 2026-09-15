'use client';

import { use } from 'react';
import Link from 'next/link';
import { usePurchaseReturn } from '@/features/purchases/api';
import { errorMessage } from '@/lib/api-client';
import { money, pct } from '@/lib/format';
import { formatDateTime } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, KeyValue } from '@/components/ui/card';
import { DocStatusBadge } from '@/components/ui/badge';
import { Spinner, ErrorState } from '@/components/ui/states';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { TotalsPanel } from '@/components/ui/totals-panel';
import { DocumentActions } from '@/components/documents/document-actions';
import { PAYMENT_METHOD_LABELS } from '@/components/ui/payment-lines';
import { AttachmentList } from '@/components/ui/file-upload';

export default function PurchaseReturnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const ret = usePurchaseReturn(id);
  if (ret.isPending) return <Spinner />;
  if (ret.isError) return <ErrorState message={errorMessage(ret.error)} onRetry={() => ret.refetch()} />;
  const r = ret.data;
  return (
    <>
      <PageHeader title={`Purchase return ${r.number}`} description={<span className="flex items-center gap-2">{formatDateTime(r.createdAt)} · <Link href={`/suppliers/${r.supplierId}`} className="text-primary-700 hover:underline">{r.supplierName}</Link>{r.purchaseId ? <> · against <Link href={`/purchases/${r.purchaseId}`} className="text-primary-700 hover:underline">{r.purchaseNumber}</Link></> : null} <DocStatusBadge status={r.status} /></span>} />
      <div className="mb-4"><DocumentActions type="purchaseReturn" refId={r.id} refType="PurchaseReturn" printPermission="purchases.view" emailPermission="purchases.view" /></div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <Table>
            <THead><TR><TH>Item</TH><TH>Batch</TH><TH numeric>Qty</TH><TH numeric>Rate</TH><TH numeric>GST</TH><TH numeric>Total</TH><TH>Reason</TH></TR></THead>
            <TBody>
              {r.lines.map((l, i) => (
                <TR key={i}>
                  <TD><Link href={`/products/${l.productId}`} className="font-medium hover:underline">{l.productName}</Link>{l.note ? <div className="text-[12px] text-fg-subtle">{l.note}</div> : null}</TD>
                  <TD className="font-mono text-[12px]">{l.batchNumber}</TD>
                  <TD numeric>{l.qty} {l.unitName}</TD>
                  <TD numeric>{money(l.unitPriceMinor)}</TD>
                  <TD numeric>{pct(l.taxRateBps)}</TD>
                  <TD numeric className="font-medium">{money(l.totalMinor)}</TD>
                  <TD className="capitalize">{l.reason.replace(/_/g, ' ')}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle>Settlement</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <KeyValue className="sm:grid-cols-1" items={[{ label: 'Mode', value: r.settlement === 'refund' ? `Refund · ${r.refund ? `${PAYMENT_METHOD_LABELS[r.refund.method]} ${money(r.refund.amountMinor)}` : ''}` : 'Credit note against payable' }, { label: 'Recorded by', value: r.createdBy?.name ?? '—' }, { label: 'Notes', value: r.notes || '—' }]} />
              {r.attachments.length ? <AttachmentList items={r.attachments} /> : null}
            </CardContent>
          </Card>
          <Card><CardHeader><CardTitle>Totals</CardTitle></CardHeader><CardContent><TotalsPanel totals={r.totals} /></CardContent></Card>
        </div>
      </div>
    </>
  );
}
