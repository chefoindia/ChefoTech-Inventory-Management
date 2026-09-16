'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Pencil, Wallet, ShoppingCart, FileText, Archive } from 'lucide-react';
import type { SaleDto, PrescriptionDto } from '@pharmaos/shared';
import { useCustomer, useCustomerSales, useCustomerDocument, useUpdateCustomer } from '@/features/parties/api';
import { usePrescriptions } from '@/features/prescriptions/api';
import { CustomerDialog } from '@/features/parties/party-forms';
import { LedgerTab } from '@/features/parties/ledger-tab';
import { RecordPaymentDialog } from '@/features/parties/payment-dialog';
import { usePermission } from '@/features/auth/permissions';
import { errorMessage } from '@/lib/api-client';
import { money, pct } from '@/lib/format';
import { formatDate, formatDateTime } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, KeyValue, Stat } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge, StatusBadge, PaymentStatusBadge, DocStatusBadge } from '@/components/ui/badge';
import { Spinner, ErrorState } from '@/components/ui/states';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DataTable, type Column } from '@/components/ui/data-table';
import { FileUpload, AttachmentList } from '@/components/ui/file-upload';
import { CustomFieldsView } from '@/components/ui/custom-fields-form';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const customer = useCustomer(id);
  const update = useUpdateCustomer();
  const docs = useCustomerDocument();
  const canManage = usePermission('customers.manage');
  const canLedger = usePermission('customers.viewLedger');
  const canCollect = usePermission('sales.collectPayment');
  const canSales = usePermission('sales.view');
  const canRx = usePermission('prescriptions.view');
  const [editOpen, setEditOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  if (customer.isPending) return <Spinner />;
  if (customer.isError) return <ErrorState message={errorMessage(customer.error)} onRetry={() => customer.refetch()} />;
  const c = customer.data;
  return (
    <>
      <PageHeader title={c.name} description={<span className="flex flex-wrap items-center gap-2">{[c.phone, c.email, c.address?.city].filter(Boolean).join(' · ')} <StatusBadge status={c.status} />{c.tags.map((t) => <Badge key={t}>{t}</Badge>)}</span>} actions={<>
        <Link href="/sales/pos" className={buttonVariants({ variant: 'secondary', size: 'sm' })}><ShoppingCart className="h-3.5 w-3.5" /> New sale</Link>
        {canCollect && c.balanceMinor > 0 ? <Button size="sm" onClick={() => setPayOpen(true)}><Wallet className="h-3.5 w-3.5" /> Collect {money(c.balanceMinor)}</Button> : null}
        {canManage ? <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}><Pencil className="h-3.5 w-3.5" /> Edit</Button> : null}
        {canManage && c.status !== 'archived' ? <Button variant="ghost" size="sm" onClick={() => setArchiving(true)}><Archive className="h-3.5 w-3.5" /> Archive</Button> : null}
      </>} />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {canLedger ? <Stat label="Outstanding" value={<span className={c.balanceMinor > 0 ? 'text-danger-600' : ''}>{money(c.balanceMinor)}</span>} hint={c.creditLimitMinor ? `Credit limit ${money(c.creditLimitMinor)}${c.creditDays ? ` · ${c.creditDays} days` : ''}` : 'No credit limit set'} /> : null}
        <Stat label="Lifetime purchases" value={money(c.totalPurchasesMinor ?? 0)} hint={c.lastPurchaseAt ? `Last on ${formatDate(c.lastPurchaseAt)}` : 'No purchases yet'} />
        <Stat label="Default discount" value={pct(c.defaultDiscountBps)} hint="Applied automatically at the POS" />
        <Stat label="Customer since" value={<span className="text-lg">{formatDate(c.createdAt)}</span>} hint={c.gstin ? `GSTIN ${c.gstin}` : 'Retail (B2C)'} />
      </div>

      <Tabs defaultValue="overview" className="mt-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {canLedger ? <TabsTrigger value="ledger">Ledger</TabsTrigger> : null}
          {canSales ? <TabsTrigger value="invoices">Invoices</TabsTrigger> : null}
          {canRx ? <TabsTrigger value="prescriptions">Prescriptions</TabsTrigger> : null}
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <Card>
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <KeyValue items={[
                { label: 'Phone', value: c.phone }, { label: 'Alternate phone', value: c.altPhone || '—' }, { label: 'Email', value: c.email || '—' }, { label: 'Date of birth', value: c.dateOfBirth ? formatDate(c.dateOfBirth) : '—' },
                { label: 'Gender', value: c.gender || '—' }, { label: 'Address', value: [c.address?.line1, c.address?.line2, c.address?.city, c.address?.state, c.address?.pincode].filter(Boolean).join(', ') || '—' },
                { label: 'GSTIN', value: c.gstin || '—' }, { label: 'State code', value: c.stateCode || '—' }, { label: 'Opening balance', value: money(c.openingBalanceMinor) }, { label: 'Notes', value: c.notes || '—' },
              ]} />
              <CustomFieldsView entity="customer" values={c.customFields} />
            </CardContent>
          </Card>
        </TabsContent>
        {canLedger ? <TabsContent value="ledger"><LedgerTab partyType="customer" partyId={c.id} balanceMinor={c.balanceMinor} email={c.email || undefined} /></TabsContent> : null}
        {canSales ? <TabsContent value="invoices"><CustomerInvoices id={c.id} /></TabsContent> : null}
        {canRx ? <TabsContent value="prescriptions"><CustomerPrescriptions id={c.id} /></TabsContent> : null}
        <TabsContent value="documents">
          <Card>
            <CardHeader className="flex-row items-center justify-between"><CardTitle>Documents</CardTitle>{canManage ? <FileUpload purpose="customerDocument" entityId={c.id} multiple onUploaded={(refs) => refs.forEach((r) => docs.add.mutate({ id: c.id, attachment: r }))} /> : null}</CardHeader>
            <CardContent><AttachmentList items={c.documents} onRemove={canManage ? (publicId) => docs.remove.mutate({ id: c.id, publicId }) : undefined} /></CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <CustomerDialog open={editOpen} onOpenChange={setEditOpen} customer={c} />
      <RecordPaymentDialog partyType="customer" open={payOpen} onOpenChange={setPayOpen} partyId={c.id} />
      <ConfirmDialog open={archiving} onOpenChange={setArchiving} title={`Archive ${c.name}?`} description="The customer is hidden from search and the POS. History and ledger are preserved." confirmLabel="Archive" destructive loading={update.isPending} onConfirm={() => update.mutate({ id: c.id, input: { status: 'archived' } }, { onSuccess: () => { toast.success('Customer archived'); router.push('/customers'); }, onError: (e) => toast.error(errorMessage(e)) })} />
    </>
  );
}

function CustomerInvoices({ id }: { id: string }) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const sales = useCustomerSales(id, page);
  const columns: Column<SaleDto>[] = [
    { key: 'number', header: 'Invoice', cell: (s) => <div><div className="font-medium">{s.number}</div><div className="text-[12px] text-fg-subtle">{formatDateTime(s.createdAt)} · {s.outletName}</div></div> },
    { key: 'items', header: 'Items', numeric: true, cell: (s) => s.lines.length },
    { key: 'total', header: 'Total', numeric: true, cell: (s) => money(s.totals.grandTotalMinor) },
    { key: 'balance', header: 'Balance', numeric: true, cell: (s) => s.balanceMinor ? <span className="text-danger-600">{money(s.balanceMinor)}</span> : '—' },
    { key: 'due', header: 'Due', cell: (s) => s.dueDate ? formatDate(s.dueDate) : '—' },
    { key: 'status', header: 'Status', cell: (s) => s.status === 'cancelled' ? <Badge dot>Cancelled</Badge> : <PaymentStatusBadge status={s.paymentStatus} /> },
  ];
  return <Card><DataTable columns={columns} rows={sales.data?.items} rowKey={(s) => s.id} isPending={sales.isPending} isError={sales.isError} error={sales.error} meta={sales.data?.meta} onPageChange={setPage} onRowClick={(s) => router.push(`/sales/${s.id}`)} empty={{ icon: ShoppingCart, title: 'No invoices yet' }} /></Card>;
}

function CustomerPrescriptions({ id }: { id: string }) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const rx = usePrescriptions({ page, customerId: id });
  const canManage = usePermission('prescriptions.manage');
  const columns: Column<PrescriptionDto>[] = [
    { key: 'doctor', header: 'Doctor', cell: (p) => <div><div className="font-medium">{p.doctorName}</div><div className="text-[12px] text-fg-subtle">{p.hospital || p.doctorRegNo}</div></div> },
    { key: 'date', header: 'Date', cell: (p) => formatDate(p.prescriptionDate) },
    { key: 'valid', header: 'Valid until', cell: (p) => p.validUntil ? formatDate(p.validUntil) : '—' },
    { key: 'items', header: 'Medicines', cell: (p) => p.items.map((i) => i.medicine).join(', ') || `${p.files.length} file(s)` },
    { key: 'sales', header: 'Used in', cell: (p) => p.linkedSales.length ? p.linkedSales.map((s) => s.number).join(', ') : '—' },
    { key: 'status', header: 'Status', cell: (p) => <DocStatusBadge status={p.status} /> },
  ];
  return (
    <Card>
      <div className="flex items-center justify-end border-b border-border p-3">{canManage ? <Link href={`/prescriptions?new=1&customerId=${id}`} className={buttonVariants({ size: 'sm' })}><FileText className="h-3.5 w-3.5" /> Add prescription</Link> : null}</div>
      <DataTable columns={columns} rows={rx.data?.items} rowKey={(p) => p.id} isPending={rx.isPending} isError={rx.isError} error={rx.error} meta={rx.data?.meta} onPageChange={setPage} onRowClick={(p) => router.push(`/prescriptions/${p.id}`)} empty={{ icon: FileText, title: 'No prescriptions on file' }} />
    </Card>
  );
}
