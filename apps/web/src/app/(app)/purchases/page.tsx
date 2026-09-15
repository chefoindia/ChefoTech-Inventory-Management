'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Truck, Search, Wallet, PackageCheck, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import type { PurchaseDto, GrnDto, PurchaseReturnDto, PartyPaymentDto } from '@pharmaos/shared';
import { usePurchases, useGrns, usePurchaseReturns } from '@/features/purchases/api';
import { usePayments, useCancelPayment } from '@/features/parties/api';
import { RecordPaymentDialog } from '@/features/parties/payment-dialog';
import { usePermission } from '@/features/auth/permissions';
import { useDebounce } from '@/hooks/use-debounce';
import { errorMessage } from '@/lib/api-client';
import { money } from '@/lib/format';
import { formatDate, formatDateTime } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Badge, PaymentStatusBadge, DocStatusBadge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DataTable, useListState, type Column } from '@/components/ui/data-table';
import { DateRangePicker, defaultRange, rangeToQuery, type DateRange } from '@/components/ui/date-range';
import { DocumentMenu } from '@/components/documents/document-actions';
import { PAYMENT_METHOD_LABELS } from '@/components/ui/payment-lines';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

export default function PurchasesPage() {
  return <Suspense><PurchasesInner /></Suspense>;
}

function PurchasesInner() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = params.get('tab') ?? 'invoices';
  const canCreate = usePermission('purchases.create');
  const canPay = usePermission('purchases.pay');
  const [payOpen, setPayOpen] = useState(false);
  return (
    <>
      <PageHeader title="Purchases" description="Supplier invoices, goods receipts, returns and payments." actions={<>{canPay ? <Button variant="secondary" size="sm" onClick={() => setPayOpen(true)}><Wallet className="h-3.5 w-3.5" /> Pay supplier</Button> : null}{canCreate ? <Link href="/purchases/new" className={buttonVariants({ size: 'sm' })}><Plus className="h-4 w-4" /> New purchase</Link> : null}</>} />
      <Tabs value={tab} onValueChange={(v) => router.replace(`/purchases?tab=${v}`)}>
        <TabsList><TabsTrigger value="invoices">Invoices</TabsTrigger><TabsTrigger value="grns">Goods receipts</TabsTrigger><TabsTrigger value="returns">Returns</TabsTrigger><TabsTrigger value="payments">Payments</TabsTrigger></TabsList>
        <TabsContent value="invoices"><InvoicesTab /></TabsContent>
        <TabsContent value="grns"><GrnsTab /></TabsContent>
        <TabsContent value="returns"><ReturnsTab /></TabsContent>
        <TabsContent value="payments"><PaymentsTab /></TabsContent>
      </Tabs>
      <RecordPaymentDialog partyType="supplier" open={payOpen} onOpenChange={setPayOpen} />
    </>
  );
}

function InvoicesTab() {
  const router = useRouter();
  const { page, setPage, filters, setFilter } = useListState({ q: '', status: '', paymentStatus: '' });
  const [range, setRange] = useState<DateRange>(defaultRange(90));
  const q = useDebounce(filters.q ?? '', 250);
  const purchases = usePurchases({ page, q: q || undefined, status: filters.status || undefined, paymentStatus: filters.paymentStatus || undefined, ...rangeToQuery(range) });
  const canCost = usePermission('products.viewCost');
  const columns: Column<PurchaseDto>[] = [
    { key: 'number', header: 'Purchase', cell: (p) => <div><div className="font-medium">{p.number}</div><div className="text-[12px] text-fg-subtle">Inv {p.supplierInvoiceNumber} · {formatDate(p.invoiceDate)}</div></div> },
    { key: 'supplier', header: 'Supplier', cell: (p) => p.supplierName },
    { key: 'items', header: 'Items', numeric: true, cell: (p) => p.lines.length },
    ...(canCost ? [{ key: 'total', header: 'Total', numeric: true, cell: (p: PurchaseDto) => <span className="font-medium">{money(p.totals.grandTotalMinor)}</span> }, { key: 'balance', header: 'Balance', numeric: true, cell: (p: PurchaseDto) => p.balanceMinor ? <span className={p.dueDate && new Date(p.dueDate) < new Date() ? 'text-danger-600' : ''}>{money(p.balanceMinor)}</span> : '—' }] : []),
    { key: 'status', header: 'Receipt', cell: (p) => <DocStatusBadge status={p.status} /> },
    { key: 'pay', header: 'Payment', cell: (p) => p.status === 'cancelled' ? '—' : <PaymentStatusBadge status={p.paymentStatus} /> },
    { key: 'doc', header: '', cell: (p) => <span onClick={(e) => e.stopPropagation()}><DocumentMenu type="purchaseInvoice" refId={p.id} /></span> },
  ];
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <div className="relative min-w-[200px] flex-1"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-fg-faint" /><Input className="h-9 pl-8" placeholder="Number, supplier invoice…" value={filters.q} onChange={(e) => setFilter('q', e.target.value)} aria-label="Search purchases" /></div>
        <DateRangePicker value={range} onChange={setRange} />
        <Select className="h-9 w-40" value={filters.status} onChange={(e) => setFilter('status', e.target.value)} aria-label="Status"><option value="">Any status</option><option value="draft">Draft</option><option value="confirmed">Confirmed</option><option value="partially_received">Partially received</option><option value="received">Received</option><option value="cancelled">Cancelled</option></Select>
        <Select className="h-9 w-32" value={filters.paymentStatus} onChange={(e) => setFilter('paymentStatus', e.target.value)} aria-label="Payment"><option value="">Any payment</option><option value="unpaid">Unpaid</option><option value="partial">Partial</option><option value="paid">Paid</option></Select>
      </div>
      <DataTable columns={columns} rows={purchases.data?.items} rowKey={(p) => p.id} isPending={purchases.isPending} isError={purchases.isError} error={purchases.error} onRetry={() => purchases.refetch()} meta={purchases.data?.meta} onPageChange={setPage} onRowClick={(p) => router.push(`/purchases/${p.id}`)} empty={{ icon: Truck, title: 'No purchases in this period', description: 'Record supplier invoices to bring stock in.', action: <Link href="/purchases/new" className={buttonVariants({ size: 'sm' })}><Plus className="h-4 w-4" /> New purchase</Link> }} />
    </Card>
  );
}

function GrnsTab() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const grns = useGrns({ page, status: status || undefined });
  const columns: Column<GrnDto>[] = [
    { key: 'number', header: 'GRN', cell: (g) => <div><div className="font-medium">{g.number}</div><div className="text-[12px] text-fg-subtle">{formatDate(g.receivedDate)}</div></div> },
    { key: 'purchase', header: 'Purchase', cell: (g) => g.purchaseNumber },
    { key: 'supplier', header: 'Supplier', cell: (g) => g.supplierName },
    { key: 'lines', header: 'Lines', numeric: true, cell: (g) => g.lines.length },
    { key: 'qty', header: 'Received (base)', numeric: true, cell: (g) => g.lines.reduce((s, l) => s + l.receivedBase, 0) },
    { key: 'status', header: 'Status', cell: (g) => <DocStatusBadge status={g.status} /> },
    { key: 'by', header: 'Received by', cell: (g) => g.receivedBy?.name ?? '—' },
  ];
  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-border p-3"><Select className="h-9 w-40" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Status"><option value="">All</option><option value="draft">Draft (awaiting check)</option><option value="confirmed">Confirmed</option></Select></div>
      <DataTable columns={columns} rows={grns.data?.items} rowKey={(g) => g.id} isPending={grns.isPending} isError={grns.isError} error={grns.error} meta={grns.data?.meta} onPageChange={setPage} onRowClick={(g) => router.push(`/purchases/grn/${g.id}`)} empty={{ icon: PackageCheck, title: 'No goods receipts', description: 'Receive stock from a confirmed purchase.' }} />
    </Card>
  );
}

function ReturnsTab() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const returns = usePurchaseReturns({ page });
  const columns: Column<PurchaseReturnDto>[] = [
    { key: 'number', header: 'Return', cell: (r) => <div><div className="font-medium">{r.number}</div><div className="text-[12px] text-fg-subtle">{formatDateTime(r.createdAt)}</div></div> },
    { key: 'supplier', header: 'Supplier', cell: (r) => r.supplierName },
    { key: 'purchase', header: 'Against', cell: (r) => r.purchaseNumber || '—' },
    { key: 'items', header: 'Items', numeric: true, cell: (r) => r.lines.length },
    { key: 'total', header: 'Value', numeric: true, cell: (r) => money(r.totals.grandTotalMinor) },
    { key: 'settle', header: 'Settlement', cell: (r) => <Badge>{r.settlement === 'refund' ? 'Refund' : 'Credit note'}</Badge> },
    { key: 'status', header: 'Status', cell: (r) => <DocStatusBadge status={r.status} /> },
  ];
  return <Card><DataTable columns={columns} rows={returns.data?.items} rowKey={(r) => r.id} isPending={returns.isPending} isError={returns.isError} error={returns.error} meta={returns.data?.meta} onPageChange={setPage} onRowClick={(r) => router.push(`/purchases/returns/${r.id}`)} empty={{ icon: Undo2, title: 'No purchase returns', description: 'Return expired or damaged stock to a supplier from the supplier page or a purchase.' }} /></Card>;
}

function PaymentsTab() {
  const [page, setPage] = useState(1);
  const [range, setRange] = useState<DateRange>(defaultRange(90));
  const payments = usePayments('supplier', { page, ...rangeToQuery(range) });
  const cancel = useCancelPayment('supplier');
  const canPay = usePermission('purchases.pay');
  const [cancelling, setCancelling] = useState<PartyPaymentDto | null>(null);
  const [reason, setReason] = useState('');
  const columns: Column<PartyPaymentDto>[] = [
    { key: 'number', header: 'Payment', cell: (p) => <div><div className="font-medium">{p.number}</div><div className="text-[12px] text-fg-subtle">{formatDate(p.date)}</div></div> },
    { key: 'party', header: 'Supplier', cell: (p) => <Link href={`/suppliers/${p.partyId}`} className="hover:underline">{p.partyName}</Link> },
    { key: 'method', header: 'Method', cell: (p) => <span>{PAYMENT_METHOD_LABELS[p.method]}{p.reference ? <span className="block text-[12px] text-fg-subtle">{p.reference}</span> : null}</span> },
    { key: 'amount', header: 'Amount', numeric: true, cell: (p) => <span className="font-medium">{money(p.amountMinor)}</span> },
    { key: 'alloc', header: 'Allocated to', cell: (p) => p.allocations.length ? p.allocations.map((a) => `${a.documentNumber} (${money(a.amountMinor)})`).join(', ') : <span className="text-fg-subtle">Advance {money(p.unallocatedMinor)}</span> },
    { key: 'actions', header: '', cell: (p) => <span className="flex items-center gap-1"><DocumentMenu type="paymentReceipt" refId={p.id} label="Voucher" />{canPay ? <Button variant="ghost" size="sm" onClick={() => setCancelling(p)}>Cancel</Button> : null}</span> },
  ];
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3"><DateRangePicker value={range} onChange={setRange} /></div>
      <DataTable columns={columns} rows={payments.data?.items} rowKey={(p) => p.id} isPending={payments.isPending} isError={payments.isError} error={payments.error} meta={payments.data?.meta} onPageChange={setPage} empty={{ icon: Wallet, title: 'No supplier payments in this period' }} />
      <ConfirmDialog open={!!cancelling} onOpenChange={(o) => !o && setCancelling(null)} title={`Cancel payment ${cancelling?.number}?`} description={<div className="space-y-3"><p>The amount is reversed on the supplier ledger and allocated invoices become payable again.</p><Input placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} /></div>} confirmLabel="Cancel payment" destructive loading={cancel.isPending} onConfirm={() => { if (!cancelling || reason.trim().length < 3) { toast.error('Give a reason (at least 3 characters).'); return; } cancel.mutate({ id: cancelling.id, reason }, { onSuccess: () => { toast.success('Payment cancelled'); setCancelling(null); setReason(''); }, onError: (e) => toast.error(errorMessage(e)) }); }} />
    </Card>
  );
}
