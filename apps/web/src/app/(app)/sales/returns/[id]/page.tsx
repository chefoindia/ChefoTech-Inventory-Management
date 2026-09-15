'use client';

import { use } from 'react';
import Link from 'next/link';
import { useSalesReturn } from '@/features/sales/api';
import { errorMessage } from '@/lib/api-client';
import { money, pct } from '@/lib/format';
import { formatDateTime } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, KeyValue } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner, ErrorState } from '@/components/ui/states';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { TotalsPanel } from '@/components/ui/totals-panel';
import { DocumentActions } from '@/components/documents/document-actions';
import { PAYMENT_METHOD_LABELS } from '@/components/ui/payment-lines';

export default function SalesReturnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const ret = useSalesReturn(id);
  if (ret.isPending) return <Spinner />;
  if (ret.isError) return <ErrorState message={errorMessage(ret.error)} onRetry={() => ret.refetch()} />;
  const r = ret.data;
  return (
    <>
      <PageHeader title={`Sales return ${r.number}`} description={<span className="flex items-center gap-2">{formatDateTime(r.createdAt)} · against <Link href={`/sales/${r.saleId}`} className="text-primary-700 hover:underline">{r.saleNumber}</Link> · by {r.createdBy?.name ?? '—'} <Badge variant={r.status === 'completed' ? 'success' : 'neutral'} dot>{r.status}</Badge></span>} />
      <div className="mb-4"><DocumentActions type="salesReturn" refId={r.id} refType="SalesReturn" /></div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <Table>
            <THead><TR><TH>Item</TH><TH>Batch</TH><TH numeric>Qty</TH><TH numeric>Rate</TH><TH numeric>GST</TH><TH numeric>Total</TH><TH>Condition</TH><TH>Reason</TH></TR></THead>
            <TBody>
              {r.lines.map((l, i) => (
                <TR key={i}>
                  <TD><Link href={`/products/${l.productId}`} className="font-medium hover:underline">{l.productName}</Link>{l.note ? <div className="text-[12px] text-fg-subtle">{l.note}</div> : null}</TD>
                  <TD className="font-mono text-[12px]">{l.batchNumber}</TD>
                  <TD numeric>{l.qty} {l.unitName}</TD>
                  <TD numeric>{money(l.unitPriceMinor)}</TD>
                  <TD numeric>{pct(l.taxRateBps)}</TD>
                  <TD numeric className="font-medium">{money(l.totalMinor)}</TD>
                  <TD><Badge variant={l.condition === 'resaleable' ? 'success' : 'warning'}>{l.condition}</Badge></TD>
                  <TD className="capitalize">{l.reason.replace(/_/g, ' ')}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle>Settlement</CardTitle></CardHeader>
            <CardContent>
              <KeyValue className="sm:grid-cols-1" items={[
                { label: 'Customer', value: r.customerId ? <Link href={`/customers/${r.customerId}`} className="text-primary-700 hover:underline">{r.customerName}</Link> : r.customerName || 'Walk-in' },
                { label: 'Mode', value: r.settlement === 'refund' ? `Refund · ${r.refund ? PAYMENT_METHOD_LABELS[r.refund.method] : ''} ${r.refund ? money(r.refund.amountMinor) : ''}` : 'Credit note on ledger' },
                { label: 'Notes', value: r.notes || '—' },
              ]} />
            </CardContent>
          </Card>
          <Card><CardHeader><CardTitle>Totals</CardTitle></CardHeader><CardContent><TotalsPanel totals={r.totals} /></CardContent></Card>
        </div>
      </div>
    </>
  );
}
