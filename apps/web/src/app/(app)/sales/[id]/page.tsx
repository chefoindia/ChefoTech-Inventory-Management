'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { RotateCcw, Ban, Wallet, FileText } from 'lucide-react';
import type { SaleDto, PaymentMethod } from '@pharmaos/shared';
import { useSale, useCancelSale, useCreateSalesReturn, useSalesReturns } from '@/features/sales/api';
import { usePermission } from '@/features/auth/permissions';
import { RecordPaymentDialog } from '@/features/parties/payment-dialog';
import { errorMessage } from '@/lib/api-client';
import { newIdempotencyKey } from '@/lib/uuid';
import { money, pct } from '@/lib/format';
import { formatDate, formatDateTime } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, KeyValue } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, PaymentStatusBadge } from '@/components/ui/badge';
import { Spinner, ErrorState } from '@/components/ui/states';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { TotalsPanel } from '@/components/ui/totals-panel';
import { DocumentActions } from '@/components/documents/document-actions';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input, Select, Textarea } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { MoneyInput } from '@/components/ui/money-input';
import { PAYMENT_METHOD_LABELS, TENDER_METHODS } from '@/components/ui/payment-lines';
import { CustomFieldsView } from '@/components/ui/custom-fields-form';
import { Alert } from '@/components/ui/alert';

export default function SaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const sale = useSale(id);
  const returns = useSalesReturns({ page: 1, saleId: id });
  const cancel = useCancelSale();
  const canCancel = usePermission('sales.cancel');
  const canReturn = usePermission('sales.return');
  const canCollect = usePermission('sales.collectPayment');
  const canProfit = usePermission('reports.viewProfit');
  const [returnOpen, setReturnOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [reason, setReason] = useState('');

  if (sale.isPending) return <Spinner />;
  if (sale.isError) return <ErrorState message={errorMessage(sale.error)} onRetry={() => sale.refetch()} />;
  const s = sale.data;
  const returnable = s.status === 'completed' && s.lines.some((l) => l.qtyBase - l.returnedBase > 0);

  return (
    <>
      <PageHeader
        title={`Invoice ${s.number}`}
        description={<span className="flex flex-wrap items-center gap-2">{formatDateTime(s.createdAt)} · {s.outletName} · sold by {s.soldBy?.name ?? '—'} {s.status === 'cancelled' ? <Badge variant="neutral" dot>Cancelled</Badge> : <PaymentStatusBadge status={s.paymentStatus} />}{s.isInterState ? <Badge>Inter-state (IGST)</Badge> : null}</span>}
        actions={
          <>
            {canCollect && s.status === 'completed' && s.balanceMinor > 0 ? <Button size="sm" onClick={() => setPayOpen(true)}><Wallet className="h-3.5 w-3.5" /> Collect {money(s.balanceMinor)}</Button> : null}
            {canReturn && returnable ? <Button variant="secondary" size="sm" onClick={() => setReturnOpen(true)}><RotateCcw className="h-3.5 w-3.5" /> Return items</Button> : null}
            {canCancel && s.status === 'completed' ? <Button variant="ghost" size="sm" onClick={() => setCancelOpen(true)}><Ban className="h-3.5 w-3.5" /> Cancel invoice</Button> : null}
          </>
        }
      />

      {s.status === 'cancelled' ? <Alert variant="warning" className="mb-4" title={`Cancelled ${s.cancelledAt ? formatDateTime(s.cancelledAt) : ''} by ${s.cancelledBy?.name ?? '—'}`}>{s.cancelReason}</Alert> : null}

      <div className="mb-4"><DocumentActions type="saleInvoice" refId={s.id} refType="Sale" emailTo={s.customer.email} sharePhone={s.customer.phone} shareLabel={`Invoice ${s.number}`} /></div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <Table>
              <THead><TR><TH>#</TH><TH>Item</TH><TH>Batch / Exp</TH><TH numeric>Qty</TH><TH numeric>Rate</TH><TH numeric>Disc</TH><TH numeric>GST</TH><TH numeric>Total</TH></TR></THead>
              <TBody>
                {s.lines.map((l, i) => (
                  <TR key={l.lineId}>
                    <TD className="text-fg-subtle">{i + 1}</TD>
                    <TD><Link href={`/products/${l.productId}`} className="font-medium hover:underline">{l.productName}</Link><div className="text-[12px] text-fg-subtle">{l.packLabel}{l.hsnCode ? ` · HSN ${l.hsnCode}` : ''}{l.schedule && l.schedule !== 'none' ? ` · Sch ${l.schedule}` : ''}{l.returnedBase ? <span className="ml-1 text-warning-700">· {l.returnedBase} returned</span> : null}</div></TD>
                    <TD><span className="font-mono text-[12px]">{l.batchNumber}</span><div className="text-[12px] text-fg-subtle">{formatDate(l.expiryDate, { month: 'short', year: '2-digit' })}</div></TD>
                    <TD numeric>{l.qty} {l.unitName}</TD>
                    <TD numeric>{money(l.unitPriceMinor)}{l.mrpPerUnitMinor !== l.unitPriceMinor ? <div className="text-[11px] text-fg-subtle">MRP {money(l.mrpPerUnitMinor)}</div> : null}</TD>
                    <TD numeric>{l.discountMinor ? money(l.discountMinor) : l.discountBps ? pct(l.discountBps) : '—'}</TD>
                    <TD numeric>{pct(l.taxRateBps)}<div className="text-[11px] text-fg-subtle">{money(l.cgstMinor + l.sgstMinor + l.igstMinor + l.cessMinor)}</div></TD>
                    <TD numeric className="font-medium">{money(l.totalMinor)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>

          {returns.data?.items.length ? (
            <Card>
              <CardHeader><CardTitle>Returns against this invoice</CardTitle></CardHeader>
              <ul className="divide-y divide-border">
                {returns.data.items.map((r) => (
                  <li key={r.id} className="flex items-center justify-between px-5 py-2 text-sm">
                    <Link href={`/sales/returns/${r.id}`} className="font-medium hover:underline">{r.number}</Link>
                    <span className="text-fg-subtle">{formatDateTime(r.createdAt)} · {r.lines.length} items · {money(r.totals.grandTotalMinor)} · {r.settlement === 'refund' ? 'Refunded' : 'Credit note'}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle>Customer</CardTitle></CardHeader>
            <CardContent>
              {s.customerId ? <Link href={`/customers/${s.customerId}`} className="font-medium hover:underline">{s.customer.name}</Link> : <div className="font-medium">{s.customer.name || 'Walk-in customer'}</div>}
              <div className="text-[13px] text-fg-subtle">{[s.customer.phone, s.customer.email, s.customer.gstin].filter(Boolean).join(' · ')}</div>
              {s.doctorName || s.prescriptionIds.length ? <div className="mt-2 flex items-center gap-1.5 text-[13px]"><FileText className="h-3.5 w-3.5 text-fg-subtle" /> {s.doctorName || '—'}{s.prescriptionIds.length ? <> · {s.prescriptionIds.map((p) => <Link key={p} href={`/prescriptions/${p}`} className="text-primary-700 hover:underline">prescription</Link>)}</> : null}</div> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Totals</CardTitle></CardHeader>
            <CardContent>
              <TotalsPanel totals={s.totals} isInterState={s.isInterState} extra={
                <div className="mt-3 space-y-1 border-t border-border pt-2 text-[13px]">
                  {s.payments.map((p, i) => <div key={i} className="flex justify-between text-fg-muted"><span>{PAYMENT_METHOD_LABELS[p.method]}{p.reference ? ` · ${p.reference}` : ''}</span><span className="tabular">{money(p.amountMinor)}</span></div>)}
                  {s.creditMinor ? <div className="flex justify-between text-fg-muted"><span>Credit (Baki){s.dueDate ? ` · due ${formatDate(s.dueDate)}` : ''}</span><span className="tabular">{money(s.creditMinor)}</span></div> : null}
                  {s.refundedMinor ? <div className="flex justify-between text-fg-muted"><span>Refunded</span><span className="tabular">-{money(s.refundedMinor)}</span></div> : null}
                  <div className="flex justify-between font-medium"><span>Balance due</span><span className={s.balanceMinor > 0 ? 'tabular text-danger-600' : 'tabular'}>{money(s.balanceMinor)}</span></div>
                  {canProfit && s.profitMinor !== undefined ? <div className="flex justify-between text-fg-subtle"><span>Gross profit</span><span className="tabular">{money(s.profitMinor)}</span></div> : null}
                </div>
              } />
            </CardContent>
          </Card>
          {s.notes || Object.keys(s.customFields ?? {}).length ? (
            <Card>
              <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {s.notes ? <p className="text-sm">{s.notes}</p> : null}
                <CustomFieldsView entity="sale" values={s.customFields} />
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader><CardTitle>Email</CardTitle></CardHeader>
            <CardContent><KeyValue className="sm:grid-cols-1" items={[{ label: 'Status', value: s.emailStatus }, { label: 'Sent to', value: s.emailedTo || '—' }]} /></CardContent>
          </Card>
        </div>
      </div>

      <ReturnDialog sale={s} open={returnOpen} onOpenChange={setReturnOpen} onDone={(rid) => router.push(`/sales/returns/${rid}`)} />
      {s.customerId ? <RecordPaymentDialog partyType="customer" open={payOpen} onOpenChange={setPayOpen} partyId={s.customerId} defaultDocumentId={s.id} /> : null}
      <ConfirmDialog open={cancelOpen} onOpenChange={setCancelOpen} title={`Cancel invoice ${s.number}?`} description={<div className="space-y-3"><p>Stock returns to the batches, payments are reversed on the ledger and the invoice number stays in the register as cancelled.</p><Input placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} /></div>} confirmLabel="Cancel invoice" destructive loading={cancel.isPending} onConfirm={() => { if (reason.trim().length < 3) { toast.error('Give a reason (at least 3 characters).'); return; } cancel.mutate({ id: s.id, reason }, { onSuccess: () => { toast.success('Invoice cancelled'); setCancelOpen(false); }, onError: (e) => toast.error(errorMessage(e)) }); }} />
    </>
  );
}

const RETURN_REASONS = [['wrong_item', 'Wrong item'], ['not_needed', 'Not needed'], ['adverse_reaction', 'Adverse reaction'], ['damaged', 'Damaged'], ['expired', 'Expired'], ['billing_error', 'Billing error'], ['other', 'Other']] as const;

function ReturnDialog({ sale, open, onOpenChange, onDone }: { sale: SaleDto; open: boolean; onOpenChange: (o: boolean) => void; onDone: (returnId: string) => void }) {
  const create = useCreateSalesReturn();
  const [rows, setRows] = useState<Record<string, { qty: number; condition: 'resaleable' | 'damaged' | 'expired'; reason: (typeof RETURN_REASONS)[number][0]; note: string }>>({});
  const [settlement, setSettlement] = useState<'refund' | 'credit_note'>('refund');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [notes, setNotes] = useState('');
  const [key] = useState(newIdempotencyKey);
  const lines = sale.lines.filter((l) => l.qtyBase - l.returnedBase > 0);
  const selected = Object.entries(rows).filter(([, r]) => r.qty > 0);
  const estimate = selected.reduce((s, [lineId, r]) => { const l = sale.lines.find((x) => x.lineId === lineId)!; return s + Math.round((l.totalMinor / l.qty) * r.qty); }, 0);
  const submit = () => {
    if (!selected.length) return;
    create.mutate({ idempotencyKey: key, input: { saleId: sale.id, lines: selected.map(([saleLineId, r]) => ({ saleLineId, qty: r.qty, condition: r.condition, reason: r.reason, note: r.note })), settlement, refund: settlement === 'refund' ? { method, amountMinor: Math.max(estimate, 1), reference: '' } : undefined, notes } }, { onSuccess: (r) => { toast.success(`Return ${r.number} recorded`); onOpenChange(false); onDone(r.id); }, onError: (e) => toast.error(errorMessage(e)) });
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !create.isPending && onOpenChange(o)}>
      <DialogContent title={`Return items from ${sale.number}`} description="Resaleable items go back into their batch; damaged or expired stock is written off." size="xl">
        <Table>
          <THead><TR><TH>Item</TH><TH numeric>Sold</TH><TH numeric>Return qty</TH><TH>Condition</TH><TH>Reason</TH></TR></THead>
          <TBody>
            {lines.map((l) => {
              const maxQty = (l.qtyBase - l.returnedBase) / l.factorToBase;
              const r = rows[l.lineId] ?? { qty: 0, condition: 'resaleable' as const, reason: 'not_needed' as const, note: '' };
              const set = (patch: Partial<typeof r>) => setRows((x) => ({ ...x, [l.lineId]: { ...r, ...patch } }));
              return (
                <TR key={l.lineId}>
                  <TD><div className="font-medium">{l.productName}</div><div className="text-[12px] text-fg-subtle">{l.batchNumber} · {money(l.unitPriceMinor)}/{l.unitName}</div></TD>
                  <TD numeric>{l.qty} {l.unitName}{l.returnedBase ? <div className="text-[11px] text-fg-subtle">{l.returnedBase / l.factorToBase} returned</div> : null}</TD>
                  <TD numeric><Input type="number" min={0} max={maxQty} step={l.factorToBase === 1 ? 1 : 0.01} className="h-8 w-20 text-right" value={r.qty || ''} onChange={(e) => set({ qty: Math.min(Number(e.target.value) || 0, maxQty) })} aria-label="Return quantity" /></TD>
                  <TD><Select className="h-8 w-32" value={r.condition} onChange={(e) => set({ condition: e.target.value as typeof r.condition })}><option value="resaleable">Resaleable</option><option value="damaged">Damaged</option><option value="expired">Expired</option></Select></TD>
                  <TD><Select className="h-8 w-40" value={r.reason} onChange={(e) => set({ reason: e.target.value as typeof r.reason })}>{RETURN_REASONS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FormField label="Settlement" htmlFor="ret-settle">
            <Select value={settlement} onChange={(e) => setSettlement(e.target.value as typeof settlement)}><option value="refund">Refund now</option><option value="credit_note">Credit note (reduce balance)</option></Select>
          </FormField>
          {settlement === 'refund' ? <FormField label="Refund method" htmlFor="ret-method"><Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>{TENDER_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>)}</Select></FormField> : null}
          <FormField label="Estimated value" htmlFor="ret-est"><MoneyInput value={estimate} onChange={() => undefined} disabled /></FormField>
          <FormField label="Notes" htmlFor="ret-notes" className="sm:col-span-3"><Textarea className="min-h-[38px]" value={notes} onChange={(e) => setNotes(e.target.value)} /></FormField>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={create.isPending}>Cancel</Button>
          <Button loading={create.isPending} disabled={!selected.length} onClick={submit}><RotateCcw className="h-4 w-4" /> Record return</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
