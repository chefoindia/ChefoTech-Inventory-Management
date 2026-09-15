'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, ShoppingCart, Search, Download, Wallet, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import type { SaleDto, SalesReturnDto, PartyPaymentDto } from '@pharmaos/shared';
import { useSales, useSalesReturns, useHeldSales } from '@/features/sales/api';
import { usePayments, useCancelPayment } from '@/features/parties/api';
import { RecordPaymentDialog } from '@/features/parties/payment-dialog';
import { usePermission } from '@/features/auth/permissions';
import { useDebounce } from '@/hooks/use-debounce';
import { downloadFile } from '@/features/reports/api';
import { errorMessage } from '@/lib/api-client';
import { money } from '@/lib/format';
import { formatDate, formatDateTime, relativeTime } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Badge, PaymentStatusBadge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DataTable, useListState, type Column } from '@/components/ui/data-table';
import { DateRangePicker, defaultRange, rangeToQuery, type DateRange } from '@/components/ui/date-range';
import { DocumentMenu } from '@/components/documents/document-actions';
import { PAYMENT_METHOD_LABELS } from '@/components/ui/payment-lines';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

export default function SalesPage() {
  return <Suspense><SalesInner /></Suspense>;
}

function SalesInner() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = params.get('tab') ?? 'invoices';
  const canCreate = usePermission('sales.create');
  const canCollect = usePermission('sales.collectPayment');
  const [payOpen, setPayOpen] = useState(false);

  return (
    <>
      <PageHeader
        title="Sales"
        description="Invoices, returns, collections and parked bills for this outlet."
        actions={
          <>
            {canCollect ? <Button variant="secondary" size="sm" onClick={() => setPayOpen(true)}><Wallet className="h-3.5 w-3.5" /> Record payment</Button> : null}
            {canCreate ? <Link href="/sales/pos" className={buttonVariants({ size: 'sm' })}><Plus className="h-4 w-4" /> New sale</Link> : null}
          </>
        }
      />
      <Tabs value={tab} onValueChange={(v) => router.replace(`/sales?tab=${v}`)}>
        <TabsList>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="returns">Returns</TabsTrigger>
          <TabsTrigger value="collections">Collections</TabsTrigger>
          <TabsTrigger value="held">Held bills</TabsTrigger>
        </TabsList>
        <TabsContent value="invoices"><InvoicesTab /></TabsContent>
        <TabsContent value="returns"><ReturnsTab /></TabsContent>
        <TabsContent value="collections"><CollectionsTab /></TabsContent>
        <TabsContent value="held"><HeldTab /></TabsContent>
      </Tabs>
      <RecordPaymentDialog partyType="customer" open={payOpen} onOpenChange={setPayOpen} />
    </>
  );
}

function InvoicesTab() {
  const router = useRouter();
  const { page, setPage, filters, setFilter } = useListState({ q: '', status: '', paymentStatus: '' });
  const [range, setRange] = useState<DateRange>(defaultRange(30));
  const q = useDebounce(filters.q ?? '', 250);
  const sales = useSales({ page, q: q || undefined, status: filters.status || undefined, paymentStatus: filters.paymentStatus || undefined, ...rangeToQuery(range) });
  const canExport = usePermission('data.export');
  const [exporting, setExporting] = useState(false);
  const columns: Column<SaleDto>[] = [
    { key: 'number', header: 'Invoice', cell: (s) => <div><div className="font-medium">{s.number}</div><div className="text-[12px] text-fg-subtle">{formatDateTime(s.createdAt)}</div></div> },
    { key: 'customer', header: 'Customer', cell: (s) => <div><div>{s.customer.name || 'Walk-in'}</div><div className="text-[12px] text-fg-subtle">{s.customer.phone}</div></div> },
    { key: 'items', header: 'Items', numeric: true, cell: (s) => s.lines.length },
    { key: 'total', header: 'Total', numeric: true, cell: (s) => <span className="font-medium">{money(s.totals.grandTotalMinor)}</span> },
    { key: 'balance', header: 'Balance', numeric: true, cell: (s) => s.balanceMinor ? <span className="text-danger-600">{money(s.balanceMinor)}</span> : '—' },
    { key: 'status', header: 'Status', cell: (s) => s.status === 'cancelled' ? <Badge variant="neutral" dot>Cancelled</Badge> : <PaymentStatusBadge status={s.paymentStatus} /> },
    { key: 'by', header: 'Sold by', cell: (s) => s.soldBy?.name ?? '—' },
    { key: 'doc', header: '', cell: (s) => <span onClick={(e) => e.stopPropagation()}><DocumentMenu type="saleInvoice" refId={s.id} /></span> },
  ];
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-fg-faint" />
          <Input className="h-9 pl-8" placeholder="Invoice no., customer, phone…" value={filters.q} onChange={(e) => setFilter('q', e.target.value)} aria-label="Search invoices" />
        </div>
        <DateRangePicker value={range} onChange={setRange} />
        <Select className="h-9 w-32" value={filters.status} onChange={(e) => setFilter('status', e.target.value)} aria-label="Status"><option value="">Any status</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></Select>
        <Select className="h-9 w-32" value={filters.paymentStatus} onChange={(e) => setFilter('paymentStatus', e.target.value)} aria-label="Payment"><option value="">Any payment</option><option value="paid">Paid</option><option value="partial">Partial</option><option value="credit">Credit</option></Select>
        {canExport ? <Button variant="secondary" size="sm" loading={exporting} onClick={async () => { setExporting(true); try { const r = rangeToQuery(range); await downloadFile(`/exports/sales?format=xlsx&from=${r.from}&to=${r.to}`, 'sales.xlsx'); } catch (err) { toast.error(errorMessage(err)); } finally { setExporting(false); } }}><Download className="h-3.5 w-3.5" /> Export</Button> : null}
      </div>
      <DataTable columns={columns} rows={sales.data?.items} rowKey={(s) => s.id} isPending={sales.isPending} isError={sales.isError} error={sales.error} onRetry={() => sales.refetch()} meta={sales.data?.meta} onPageChange={setPage} onRowClick={(s) => router.push(`/sales/${s.id}`)} empty={{ icon: ShoppingCart, title: 'No invoices in this period', description: 'Sales made at the POS appear here.' }} />
    </Card>
  );
}

function ReturnsTab() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const returns = useSalesReturns({ page });
  const columns: Column<SalesReturnDto>[] = [
    { key: 'number', header: 'Return', cell: (r) => <div><div className="font-medium">{r.number}</div><div className="text-[12px] text-fg-subtle">{formatDateTime(r.createdAt)}</div></div> },
    { key: 'sale', header: 'Against', cell: (r) => r.saleNumber },
    { key: 'customer', header: 'Customer', cell: (r) => r.customerName || 'Walk-in' },
    { key: 'items', header: 'Items', numeric: true, cell: (r) => r.lines.length },
    { key: 'total', header: 'Value', numeric: true, cell: (r) => money(r.totals.grandTotalMinor) },
    { key: 'settle', header: 'Settlement', cell: (r) => <Badge>{r.settlement === 'refund' ? `Refund · ${r.refund ? PAYMENT_METHOD_LABELS[r.refund.method] : ''}` : 'Credit note'}</Badge> },
    { key: 'by', header: 'By', cell: (r) => r.createdBy?.name ?? '—' },
  ];
  return <Card><DataTable columns={columns} rows={returns.data?.items} rowKey={(r) => r.id} isPending={returns.isPending} isError={returns.isError} error={returns.error} meta={returns.data?.meta} onPageChange={setPage} onRowClick={(r) => router.push(`/sales/returns/${r.id}`)} empty={{ icon: RotateCcw, title: 'No returns yet', description: 'Open an invoice and choose “Return items”.' }} /></Card>;
}

function CollectionsTab() {
  const [page, setPage] = useState(1);
  const [range, setRange] = useState<DateRange>(defaultRange(30));
  const payments = usePayments('customer', { page, ...rangeToQuery(range) });
  const cancel = useCancelPayment('customer');
  const canCollect = usePermission('sales.collectPayment');
  const [cancelling, setCancelling] = useState<PartyPaymentDto | null>(null);
  const [reason, setReason] = useState('');
  const columns: Column<PartyPaymentDto>[] = [
    { key: 'number', header: 'Receipt', cell: (p) => <div><div className="font-medium">{p.number}</div><div className="text-[12px] text-fg-subtle">{formatDate(p.date)}</div></div> },
    { key: 'party', header: 'Customer', cell: (p) => <Link href={`/customers/${p.partyId}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>{p.partyName}</Link> },
    { key: 'method', header: 'Method', cell: (p) => <span>{PAYMENT_METHOD_LABELS[p.method]}{p.reference ? <span className="block text-[12px] text-fg-subtle">{p.reference}</span> : null}</span> },
    { key: 'amount', header: 'Amount', numeric: true, cell: (p) => <span className="font-medium">{money(p.amountMinor)}</span> },
    { key: 'alloc', header: 'Allocated to', cell: (p) => p.allocations.length ? p.allocations.map((a) => `${a.documentNumber} (${money(a.amountMinor)})`).join(', ') : <span className="text-fg-subtle">Advance {money(p.unallocatedMinor)}</span> },
    { key: 'by', header: 'By', cell: (p) => p.createdBy?.name ?? '—' },
    { key: 'actions', header: '', cell: (p) => <span className="flex items-center gap-1"><DocumentMenu type="paymentReceipt" refId={p.id} label="Receipt" />{canCollect ? <Button variant="ghost" size="sm" onClick={() => setCancelling(p)}>Cancel</Button> : null}</span> },
  ];
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3"><DateRangePicker value={range} onChange={setRange} /></div>
      <DataTable columns={columns} rows={payments.data?.items} rowKey={(p) => p.id} isPending={payments.isPending} isError={payments.isError} error={payments.error} meta={payments.data?.meta} onPageChange={setPage} empty={{ icon: Wallet, title: 'No collections in this period' }} />
      <ConfirmDialog open={!!cancelling} onOpenChange={(o) => !o && setCancelling(null)} title={`Cancel receipt ${cancelling?.number}?`} description={<div className="space-y-3"><p>The amount is reversed on the customer ledger and any allocated invoices become outstanding again.</p><Input placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} /></div>} confirmLabel="Cancel receipt" destructive loading={cancel.isPending} onConfirm={() => { if (!cancelling || reason.trim().length < 3) { toast.error('Give a reason (at least 3 characters).'); return; } cancel.mutate({ id: cancelling.id, reason }, { onSuccess: () => { toast.success('Receipt cancelled'); setCancelling(null); setReason(''); }, onError: (e) => toast.error(errorMessage(e)) }); }} />
    </Card>
  );
}

function HeldTab() {
  const held = useHeldSales();
  return (
    <Card>
      <DataTable
        columns={[
          { key: 'label', header: 'Label', cell: (h) => h.label || 'Untitled' },
          { key: 'customer', header: 'Customer', cell: (h) => h.customerName || 'Walk-in' },
          { key: 'items', header: 'Items', numeric: true, cell: (h) => h.lineCount },
          { key: 'total', header: 'Estimated', numeric: true, cell: (h) => money(h.estimatedTotalMinor) },
          { key: 'by', header: 'Held by', cell: (h) => `${h.heldBy?.name ?? '—'} · ${relativeTime(h.createdAt)}` },
          { key: 'go', header: '', cell: () => <Link href="/sales/pos" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>Resume at POS</Link> },
        ]}
        rows={held.data}
        rowKey={(h) => h.id}
        isPending={held.isPending}
        isError={held.isError}
        error={held.error}
        empty={{ title: 'No bills on hold', description: 'Use “Hold” at the POS to park a bill.' }}
      />
    </Card>
  );
}
