'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { PackageCheck, Wallet, Undo2, Ban, Pencil } from 'lucide-react';
import type { PurchaseDto } from '@pharmaos/shared';
import { usePurchase, useCancelPurchase, useCreateGrn, useGrns } from '@/features/purchases/api';
import { usePermission } from '@/features/auth/permissions';
import { RecordPaymentDialog } from '@/features/parties/payment-dialog';
import { PurchaseReturnDialog } from '@/features/purchases/purchase-return-dialog';
import { errorMessage } from '@/lib/api-client';
import { newIdempotencyKey } from '@/lib/uuid';
import { money, pct, dateInput } from '@/lib/format';
import { formatDate, formatDateTime } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, KeyValue } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge, PaymentStatusBadge, DocStatusBadge } from '@/components/ui/badge';
import { Spinner, ErrorState } from '@/components/ui/states';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { TotalsPanel } from '@/components/ui/totals-panel';
import { DocumentActions } from '@/components/documents/document-actions';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input, Checkbox, Textarea } from '@/components/ui/input';
import { FormField, FormGrid } from '@/components/ui/form-field';
import { MoneyInput } from '@/components/ui/money-input';
import { PAYMENT_METHOD_LABELS } from '@/components/ui/payment-lines';
import { AttachmentList } from '@/components/ui/file-upload';
import { CustomFieldsView } from '@/components/ui/custom-fields-form';
import { Alert } from '@/components/ui/alert';

export default function PurchaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const purchase = usePurchase(id);
  const grns = useGrns({ page: 1, purchaseId: id });
  const cancel = useCancelPurchase();
  const canReceive = usePermission('purchases.receive');
  const canPay = usePermission('purchases.pay');
  const canReturn = usePermission('purchases.return');
  const canCancel = usePermission('purchases.cancel');
  const canEdit = usePermission('purchases.edit');
  const canCost = usePermission('products.viewCost');
  const [grnOpen, setGrnOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');

  if (purchase.isPending) return <Spinner />;
  if (purchase.isError) return <ErrorState message={errorMessage(purchase.error)} onRetry={() => purchase.refetch()} />;
  const p = purchase.data;
  const receivable = (p.status === 'confirmed' || p.status === 'partially_received' || p.status === 'draft') && p.lines.some((l) => l.receivedBase + l.damagedBase < l.qtyBase);

  return (
    <>
      <PageHeader
        title={p.number}
        description={<span className="flex flex-wrap items-center gap-2">Supplier invoice {p.supplierInvoiceNumber} · {formatDate(p.invoiceDate)} · <Link href={`/suppliers/${p.supplierId}`} className="text-primary-700 hover:underline">{p.supplierName}</Link> <DocStatusBadge status={p.status} />{p.status !== 'cancelled' ? <PaymentStatusBadge status={p.paymentStatus} /> : null}{p.isInterState ? <Badge>IGST</Badge> : null}</span>}
        actions={
          <>
            {canReceive && receivable ? <Button size="sm" onClick={() => setGrnOpen(true)}><PackageCheck className="h-3.5 w-3.5" /> Receive goods</Button> : null}
            {canPay && p.status !== 'cancelled' && p.balanceMinor > 0 ? <Button variant="secondary" size="sm" onClick={() => setPayOpen(true)}><Wallet className="h-3.5 w-3.5" /> Pay {money(p.balanceMinor)}</Button> : null}
            {canReturn && (p.status === 'received' || p.status === 'partially_received') ? <Button variant="secondary" size="sm" onClick={() => setReturnOpen(true)}><Undo2 className="h-3.5 w-3.5" /> Return to supplier</Button> : null}
            {canEdit && p.status !== 'cancelled' ? <Link href={`/purchases/${p.id}/edit`} className={buttonVariants({ variant: 'ghost', size: 'sm' })}><Pencil className="h-3.5 w-3.5" /> Edit</Link> : null}
            {canCancel && p.status !== 'cancelled' ? <Button variant="ghost" size="sm" onClick={() => setCancelOpen(true)}><Ban className="h-3.5 w-3.5" /> Cancel</Button> : null}
          </>
        }
      />
      {p.status === 'cancelled' ? <Alert variant="warning" className="mb-4" title={`Cancelled by ${p.cancelledBy?.name ?? '—'}`}>{p.cancelReason}</Alert> : null}
      {p.status === 'draft' ? <Alert variant="info" className="mb-4" title="Draft">Stock has not been received. Use “Receive goods” to add stock and confirm the invoice.</Alert> : null}
      <div className="mb-4"><DocumentActions type="purchaseInvoice" refId={p.id} refType="Purchase" printPermission="purchases.view" emailPermission="purchases.view" /></div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <Table>
              <THead><TR><TH>Item</TH><TH>Batch / Exp</TH><TH numeric>Qty</TH><TH numeric>Received</TH>{canCost ? <><TH numeric>Rate</TH><TH numeric>Disc</TH></> : null}<TH numeric>MRP</TH><TH numeric>GST</TH>{canCost ? <TH numeric>Total</TH> : null}</TR></THead>
              <TBody>
                {p.lines.map((l) => {
                  const expected = l.qtyBase;
                  return (
                    <TR key={l.lineId}>
                      <TD><Link href={`/products/${l.productId}`} className="font-medium hover:underline">{l.productName}</Link><div className="text-[12px] text-fg-subtle">{l.packLabel}{l.hsnCode ? ` · HSN ${l.hsnCode}` : ''}{l.schemeNote ? ` · ${l.schemeNote}` : ''}</div></TD>
                      <TD><span className="font-mono text-[12px]">{l.batchNumber}</span><div className="text-[12px] text-fg-subtle">{formatDate(l.expiryDate, { month: 'short', year: '2-digit' })}</div></TD>
                      <TD numeric>{l.qty} {l.unitName}{l.freeQty ? <div className="text-[11px] text-success-700">+{l.freeQty} free</div> : null}</TD>
                      <TD numeric><span className={l.receivedBase >= expected ? 'text-success-700' : l.receivedBase > 0 ? 'text-warning-700' : 'text-fg-subtle'}>{l.receivedBase}/{expected}</span>{l.freeQtyBase ? <div className="text-[11px] text-success-700">+{l.freeQtyBase} free</div> : null}{l.damagedBase ? <div className="text-[11px] text-danger-600">{l.damagedBase} damaged</div> : null}</TD>
                      {canCost ? <><TD numeric>{money(l.purchasePriceMinor)}</TD><TD numeric>{l.discountMinor ? money(l.discountMinor) : l.discountBps ? pct(l.discountBps) : '—'}</TD></> : null}
                      <TD numeric>{money(l.mrpMinor)}<div className="text-[11px] text-fg-subtle">SP {money(l.sellingPriceMinor)}</div></TD>
                      <TD numeric>{pct(l.taxRateBps)}</TD>
                      {canCost ? <TD numeric className="font-medium">{money(l.totalMinor)}</TD> : null}
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </Card>
          <Card>
            <CardHeader><CardTitle>Goods receipts</CardTitle></CardHeader>
            {!grns.data?.items.length ? <p className="px-5 py-4 text-[13px] text-fg-subtle">No goods receipt yet.</p> : (
              <ul className="divide-y divide-border">
                {grns.data.items.map((g) => (
                  <li key={g.id} className="flex items-center justify-between px-5 py-2 text-sm"><Link href={`/purchases/grn/${g.id}`} className="font-medium hover:underline">{g.number}</Link><span className="flex items-center gap-2 text-fg-subtle">{formatDate(g.receivedDate)} · {g.lines.reduce((s, l) => s + l.receivedBase, 0)} units · {g.receivedBy?.name} <DocStatusBadge status={g.status} /></span></li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="space-y-5">
          {canCost ? (
            <Card>
              <CardHeader><CardTitle>Totals</CardTitle></CardHeader>
              <CardContent>
                <TotalsPanel totals={p.totals} isInterState={p.isInterState} extra={
                  <div className="mt-3 space-y-1 border-t border-border pt-2 text-[13px]">
                    {p.payments.map((pay, i) => <div key={i} className="flex justify-between text-fg-muted"><span>{PAYMENT_METHOD_LABELS[pay.method]}{pay.reference ? ` · ${pay.reference}` : ''} · {formatDate(pay.receivedAt)}</span><span className="tabular">{money(pay.amountMinor)}</span></div>)}
                    <div className="flex justify-between font-medium"><span>Balance payable{p.dueDate ? ` · due ${formatDate(p.dueDate)}` : ''}</span><span className={p.balanceMinor > 0 ? 'tabular text-danger-600' : 'tabular'}>{money(p.balanceMinor)}</span></div>
                  </div>
                } />
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <KeyValue className="sm:grid-cols-1" items={[{ label: 'Supplier GSTIN', value: p.supplierGstin || '—' }, { label: 'Other charges', value: p.otherChargesNote || '—' }, { label: 'Created', value: `${formatDateTime(p.createdAt)} · ${p.createdBy?.name ?? '—'}` }, { label: 'Notes', value: p.notes || '—' }]} />
              <CustomFieldsView entity="purchase" values={p.customFields} />
              {p.attachments.length ? <AttachmentList items={p.attachments} /> : null}
            </CardContent>
          </Card>
        </div>
      </div>

      <GrnDialog purchase={p} open={grnOpen} onOpenChange={setGrnOpen} onDone={(gid) => router.push(`/purchases/grn/${gid}`)} />
      <RecordPaymentDialog partyType="supplier" open={payOpen} onOpenChange={setPayOpen} partyId={p.supplierId} defaultDocumentId={p.id} />
      <PurchaseReturnDialog open={returnOpen} onOpenChange={setReturnOpen} purchase={p} onDone={(rid) => router.push(`/purchases/returns/${rid}`)} />
      <ConfirmDialog open={cancelOpen} onOpenChange={setCancelOpen} title={`Cancel ${p.number}?`} description={<div className="space-y-3"><p>Received stock is reversed (it must still be on hand), payments are reversed on the supplier ledger.</p><Input placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} /></div>} confirmLabel="Cancel purchase" destructive loading={cancel.isPending} onConfirm={() => { if (reason.trim().length < 3) { toast.error('Give a reason (at least 3 characters).'); return; } cancel.mutate({ id: p.id, reason }, { onSuccess: () => { toast.success('Purchase cancelled'); setCancelOpen(false); }, onError: (e) => toast.error(errorMessage(e)) }); }} />
    </>
  );
}

function GrnDialog({ purchase, open, onOpenChange, onDone }: { purchase: PurchaseDto; open: boolean; onOpenChange: (o: boolean) => void; onDone: (id: string) => void }) {
  const create = useCreateGrn();
  const canApprove = usePermission('purchases.approveGrn');
  const pendingLines = purchase.lines.filter((l) => l.receivedBase + l.damagedBase < l.qtyBase);
  const [rows, setRows] = useState<Record<string, { receivedQty: number; freeQty: number; damagedQty: number; batchNumber: string; expiryDate: string; mrpMinor: number | null; sellingPriceMinor: number | null; note: string }>>({});
  const [receivedDate, setReceivedDate] = useState(dateInput(new Date()));
  const [confirm, setConfirm] = useState(true);
  const [notes, setNotes] = useState('');
  const [key, setKey] = useState(newIdempotencyKey);
  const init = () => {
    const r: typeof rows = {};
    for (const l of pendingLines) {
      const remainingUnits = (l.qtyBase - l.receivedBase - l.damagedBase) / l.factorToBase;
      // free goods are counted separately from the paid quantity; assume they arrive with the first receipt
      const free = l.receivedBase === 0 ? l.freeQty : 0;
      r[l.lineId] = { receivedQty: Math.max(remainingUnits, 0), freeQty: free, damagedQty: 0, batchNumber: l.batchNumber, expiryDate: dateInput(l.expiryDate), mrpMinor: l.mrpMinor, sellingPriceMinor: l.sellingPriceMinor, note: '' };
    }
    setRows(r);
    setKey(newIdempotencyKey());
  };
  const submit = () => {
    const lines = Object.entries(rows).filter(([, r]) => r.receivedQty > 0 || r.freeQty > 0 || r.damagedQty > 0).map(([purchaseLineId, r]) => ({ purchaseLineId, receivedQty: r.receivedQty, freeQty: r.freeQty, damagedQty: r.damagedQty, batchNumber: r.batchNumber || undefined, expiryDate: r.expiryDate ? new Date(r.expiryDate) : undefined, mrpMinor: r.mrpMinor ?? undefined, sellingPriceMinor: r.sellingPriceMinor ?? undefined, note: r.note }));
    if (!lines.length) return toast.error('Enter a received quantity on at least one line.');
    create.mutate({ idempotencyKey: key, input: { purchaseId: purchase.id, receivedDate: new Date(receivedDate), lines, attachments: [], notes, confirm } }, { onSuccess: (g) => { toast.success(`${g.number} ${g.status === 'confirmed' ? 'confirmed, stock added' : 'saved as draft'}`); onOpenChange(false); onDone(g.id); }, onError: (e) => toast.error(errorMessage(e)) });
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { if (o) init(); if (!create.isPending) onOpenChange(o); }}>
      <DialogContent title={`Receive goods · ${purchase.number}`} description="Check quantities against the physical delivery. Short or damaged items stay pending for a later receipt." size="xl">
        <FormGrid className="sm:grid-cols-3">
          <FormField label="Received on" htmlFor="grn-date"><Input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} /></FormField>
          <FormField label="Notes" htmlFor="grn-notes" className="sm:col-span-2"><Textarea className="min-h-[38px]" value={notes} onChange={(e) => setNotes(e.target.value)} /></FormField>
        </FormGrid>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[900px] text-[13px]">
            <thead className="text-left text-[11px] uppercase tracking-wide text-fg-subtle"><tr><th className="py-1 pr-2">Item</th><th className="py-1 pr-2 text-right">Pending</th><th className="py-1 pr-2 text-right">Received</th><th className="py-1 pr-2 text-right">Free</th><th className="py-1 pr-2 text-right">Damaged</th><th className="py-1 pr-2">Batch</th><th className="py-1 pr-2">Expiry</th><th className="py-1 pr-2 text-right">MRP</th><th className="py-1 pr-2 text-right">Selling</th></tr></thead>
            <tbody className="divide-y divide-border">
              {pendingLines.map((l) => {
                const r = rows[l.lineId];
                if (!r) return null;
                const set = (patch: Partial<typeof r>) => setRows((x) => ({ ...x, [l.lineId]: { ...r, ...patch } }));
                return (
                  <tr key={l.lineId}>
                    <td className="py-1.5 pr-2"><div className="font-medium">{l.productName}</div><div className="text-[11px] text-fg-subtle">{l.unitName} · ordered {l.qty}{l.freeQty ? ` + ${l.freeQty} free` : ''}</div></td>
                    <td className="py-1.5 pr-2 text-right tabular">{(l.qtyBase - l.receivedBase - l.damagedBase) / l.factorToBase}</td>
                    <td className="py-1.5 pr-2"><Input type="number" min={0} className="h-8 w-20 text-right" value={r.receivedQty} onChange={(e) => set({ receivedQty: Number(e.target.value) || 0 })} aria-label="Received quantity" /></td>
                    <td className="py-1.5 pr-2"><Input type="number" min={0} className="h-8 w-16 text-right" value={r.freeQty} onChange={(e) => set({ freeQty: Number(e.target.value) || 0 })} aria-label="Free quantity" /></td>
                    <td className="py-1.5 pr-2"><Input type="number" min={0} className="h-8 w-16 text-right" value={r.damagedQty} onChange={(e) => set({ damagedQty: Number(e.target.value) || 0 })} aria-label="Damaged quantity" /></td>
                    <td className="py-1.5 pr-2"><Input className="h-8 w-28 font-mono" value={r.batchNumber} onChange={(e) => set({ batchNumber: e.target.value })} aria-label="Batch" /></td>
                    <td className="py-1.5 pr-2"><Input type="date" className="h-8 w-36" value={r.expiryDate} onChange={(e) => set({ expiryDate: e.target.value })} aria-label="Expiry" /></td>
                    <td className="py-1.5 pr-2"><MoneyInput className="h-8 w-24" value={r.mrpMinor} onChange={(v) => set({ mrpMinor: v })} aria-label="MRP" /></td>
                    <td className="py-1.5 pr-2"><MoneyInput className="h-8 w-24" value={r.sellingPriceMinor} onChange={(v) => set({ sellingPriceMinor: v })} aria-label="Selling price" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm"><Checkbox checked={confirm} onChange={(e) => setConfirm(e.target.checked)} disabled={!canApprove} /> Confirm now and add stock {!canApprove ? <span className="text-[12px] text-fg-subtle">(a checker will confirm this receipt)</span> : null}</label>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={create.isPending}>Cancel</Button>
          <Button loading={create.isPending} onClick={submit}><PackageCheck className="h-4 w-4" /> {confirm && canApprove ? 'Receive & confirm' : 'Save receipt'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
